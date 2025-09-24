// /pages/api/withdraw.js
import crypto from "crypto";
import { supabase } from "../lib/supabaseClient.js";

function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    const entries = [];
    for (const [k, v] of params.entries()) if (k !== "hash") entries.push(`${k}=${v}`);
    entries.sort();
    const data = entries.join("\n");

    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
    const calc = crypto.createHmac("sha256", secret).update(data).digest("hex");

    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(calc, "hex");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;

    const userJson = params.get("user");
    const user = JSON.parse(userJson || "{}");
    return user?.id || null;
  } catch {
    return null;
  }
}

function toNano(ton) {
  const n = Number(ton);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 1e9));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не поддерживается" });

  const { initData, amountTON } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData не передан" });

  const userId = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!userId) return res.status(401).json({ error: "Невалидная подпись Telegram" });

  const nano = toNano(amountTON);
  if (!nano) return res.status(400).json({ error: "Некорректная сумма" });

  // куда выводим — берём привязанный кошелёк
  const { data: linkRows, error: linkErr } = await supabase
    .from("wallet_links")
    .select("wallet")
    .eq("user_id", userId)
    .limit(1);

  if (linkErr) return res.status(500).json({ error: "Ошибка БД (wallet_links)" });
  const wallet = linkRows?.[0]?.wallet;
  if (!wallet) return res.status(400).json({ error: "Кошелёк не привязан" });

  // атомарно списываем и создаём заявку
  try {
    const { data, error } = await supabase.rpc("request_withdraw", {
      uid: userId,
      tgt_wallet: wallet,
      amount_text: nano
    });

    if (error) {
      if (String(error.message || '').includes('INSUFFICIENT_FUNDS')) {
        return res.status(400).json({ error: "Недостаточно средств" });
      }
      console.error("request_withdraw RPC error:", error);
      return res.status(500).json({ error: "Ошибка создания заявки" });
    }

    return res.status(200).json({ success: true, withdrawId: data });
  } catch (e) {
    console.error("withdraw fatal:", e);
    return res.status(500).json({ error: "Внутренняя ошибка" });
  }
}
