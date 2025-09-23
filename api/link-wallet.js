// /pages/api/link-wallet.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ВАЖНО: только на сервере
);

// Проверка подписи initData (Telegram WebApp)
function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // Формируем data_check_string
    const entries = [];
    for (const [k, v] of params.entries()) {
      if (k !== "hash") entries.push(`${k}=${v}`);
    }
    entries.sort(); // по ключу
    const dataCheckString = entries.join("\n");

    // Секрет: HMAC_SHA256("WebAppData", botToken)
    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Подписываем data_check_string
    const calcHash = crypto
      .createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");

    // Сравниваем безопасно
    const ok = crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calcHash, "hex"));
    if (!ok) return null;

    // Парсим user из initData
    const userJson = params.get("user");
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    return user?.id || null;
  } catch (e) {
    console.error("verifyTelegramInitData error:", e);
    return null;
  }
}

// Простейшая проверка TON-адреса (bounceable, base64url, начинается с EQ/ UQ)
function isLikelyTonAddress(addr = "") {
  return typeof addr === "string" && /^(E|U)Q[0-9A-Za-z_-]{46}$/.test(addr);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { initData, userId: rawUserId, wallet } = req.body || {};

  try {
    // 1) Определяем userId: сначала пробуем initData, иначе — legacy userId
    let userId = null;
    if (initData) {
      const verifiedUserId = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
      if (!verifiedUserId) {
        return res.status(401).json({ error: "Невалидная подпись Telegram (initData)" });
      }
      userId = verifiedUserId;
    } else if (rawUserId) {
      userId = rawUserId;
    }

    if (!userId || !wallet) {
      return res.status(400).json({ error: "Не указан userId/initData или wallet" });
    }

    if (!isLikelyTonAddress(wallet)) {
      return res.status(400).json({ error: "Неверный формат TON-адреса" });
    }

    // 2) Снимаем любые старые привязки:
    // - по этому user_id
    // - по этому wallet (чтобы кошелёк не был привязан к другому пользователю)
    const delUser = supabase.from("wallet_links").delete().eq("user_id", userId);
    const delWallet = supabase.from("wallet_links").delete().eq("wallet", wallet);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([delUser, delWallet]);
    if (e1 || e2) {
      console.warn("link-wallet: warning on delete", e1 || e2);
    }

    // 3) Вставляем новую запись
    const { error: insertError } = await supabase
      .from("wallet_links")
      .insert([{ user_id: userId, wallet }]);

    if (insertError) {
      console.error("link-wallet insert error:", insertError);
      return res.status(500).json({ error: "Ошибка при привязке кошелька" });
    }

    console.log(`[link-wallet] user ${userId} привязал ${wallet}`);
    return res.status(200).json({ success: true, wallet, userId });
  } catch (err) {
    console.error("link-wallet fatal error:", err);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
