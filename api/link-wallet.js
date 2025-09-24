// /pages/api/link-wallet.js
import crypto from "crypto";
import { Address } from "@ton/core";
import { supabase } from "../../lib/supabaseClient.js";

// --- verify Telegram initData (WebApp) ---
function verifyTelegramInitData(initData, botToken) {
  if (typeof initData !== "string" || !initData) return { ok: false, reason: "empty_init" };
  if (!botToken) return { ok: false, reason: "no_token" };

  const token = botToken.trim();

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "bad_searchparams" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no_hash" };

  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k !== "hash") entries.push(`${k}=${v}`);
  }
  entries.sort();
  const dataCheckString = entries.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calcHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calcHash, "hex");
  if (a.length !== b.length) return { ok: false, reason: "len_mismatch" };

  const ok = crypto.timingSafeEqual(a, b);
  if (!ok) return { ok: false, reason: "hash_mismatch" };

  try {
    const userJson = params.get("user");
    if (!userJson) return { ok: false, reason: "no_user" };
    const user = JSON.parse(userJson);
    const id = user?.id;
    if (!id) return { ok: false, reason: "no_user_id" };
    return { ok: true, userId: id };
  } catch {
    return { ok: false, reason: "bad_user_json" };
  }
}

function isTonAddress(addr = "") {
  try {
    Address.parse(addr);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { initData, userId: rawUserId, wallet } = req.body || {};

  // 1) Валидируем адрес TON
  if (!wallet || !isTonAddress(wallet)) {
    return res.status(400).json({ error: "Неверный формат TON-адреса" });
  }

  // 2) Достаём userId
  let userId = null;
  const hasToken = !!process.env.BOT_TOKEN;

  if (initData && hasToken) {
    const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
    if (!v.ok) {
      return res.status(401).json({ error: "Невалидная подпись Telegram", reason: v.reason });
    }
    userId = v.userId;
  } else if (rawUserId) {
    console.warn("[link-wallet] WARNING: fallback на legacy userId. Настройте BOT_TOKEN и initData.");
    userId = rawUserId;
  } else {
    return res.status(400).json({ error: "Не указан initData или userId" });
  }

  try {
    // 3) Чистим старые привязки
    const delUser = supabase.from("wallet_links").delete().eq("user_id", userId);
    const delWallet = supabase.from("wallet_links").delete().eq("wallet", wallet);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([delUser, delWallet]);
    if (e1 || e2) console.warn("[link-wallet] warning on delete", e1 || e2);

    // 4) Создаём новую привязку
    const { error: insertError } = await supabase
      .from("wallet_links")
      .insert([{ user_id: userId, wallet }]);

    if (insertError) {
      console.error("link-wallet insert error:", insertError);
      return res.status(500).json({ error: "Ошибка при привязке кошелька" });
    }

    console.log(`[link-wallet] user ${userId} привязал ${wallet}`);
    return res.status(200).json({ success: true, userId, wallet });
  } catch (err) {
    console.error("link-wallet fatal error:", err);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
