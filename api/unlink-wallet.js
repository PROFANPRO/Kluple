// /pages/api/unlink-wallet.js
import crypto from "crypto";
import { supabase } from "../../lib/supabaseClient.js";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { initData, wallet } = req.body || {};
  if (!initData || !wallet) {
    return res.status(400).json({ error: "Не передан initData или wallet" });
  }

  // Верифицируем initData и достаём userId
  const userId = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!userId) {
    return res.status(401).json({ error: "Невалидная подпись Telegram" });
  }

  try {
    const { error } = await supabase
      .from("wallet_links")
      .delete()
      .match({ user_id: userId, wallet });

    if (error) {
      console.error("Supabase unlink error:", error);
      return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
    }

    console.log(`🔓 Кошелёк ${wallet} отвязан от userId ${userId}`);
    return res.status(200).json({ success: true, message: "Кошелёк отвязан" });
  } catch (err) {
    console.error("unlink-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
  }
}
