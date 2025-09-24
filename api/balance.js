// /pages/api/balance.js
import crypto from "crypto";
import { supabase } from "../../lib/supabaseClient.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { initData } = req.body || {};
  const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!v.ok) {
    return res.status(401).json({ error: "Невалидная подпись Telegram", reason: v.reason });
  }

  const userId = v.userId;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("balance_nano")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("balance db error:", error);
      return res.status(500).json({ error: "Ошибка БД" });
    }

    const nano = toBigInt(data?.balance_nano ?? 0);
    return res.status(200).json({
      success: true,
      userId,
      balanceTON: Number(nano) / 1e9,
      balanceNano: nano.toString(),
    });
  } catch (err) {
    console.error("balance fatal error:", err);
    return res.status(500).json({ error: "Внутренняя ошибка" });
  }
}

/* ------------ helpers ------------ */

function verifyTelegramInitData(initData, botToken) {
  if (typeof initData !== "string" || !initData) return { ok: false, reason: "empty_init" };
  if (!botToken) return { ok: false, reason: "no_token" };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "bad_searchparams" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no_hash" };

  const entries = [];
  for (const [k, v] of params.entries()) if (k !== "hash") entries.push(`${k}=${v}`);
  entries.sort();
  const dataCheckString = entries.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const calcHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calcHash, "hex");
  if (a.length !== b.length) return { ok: false, reason: "len_mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: "hash_mismatch" };

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

function toBigInt(v) {
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
}
