// /api/history.js
import crypto from "crypto";
import { supabase } from "../lib/supabaseClient.js";

// верификация initData
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { initData, limit = 20 } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData required" });

  const userId = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!userId) return res.status(401).json({ error: "Bad Telegram signature" });

  try {
    const { data: deposits, error: depErr } = await supabase
      .from("deposits")
      .select("id, amount_nano, tx_hash, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data: withdrawals, error: wdErr } = await supabase
      .from("withdrawals")
      .select("id, amount_nano, wallet, status, tx_hash, created_at, processed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (depErr || wdErr) {
      console.error("history error:", depErr || wdErr);
      return res.status(500).json({ error: "DB error" });
    }

    // склеим историю в единый массив
    const history = [
      ...deposits.map((d) => ({
        type: "deposit",
        id: d.id,
        amountTON: Number(d.amount_nano) / 1e9,
        txHash: d.tx_hash,
        date: d.created_at,
      })),
      ...withdrawals.map((w) => ({
        type: "withdraw",
        id: w.id,
        amountTON: Number(w.amount_nano) / 1e9,
        wallet: w.wallet,
        status: w.status,
        txHash: w.tx_hash,
        date: w.created_at,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({ success: true, history });
  } catch (err) {
    console.error("history fatal:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
