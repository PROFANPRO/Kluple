// /pages/api/balance.js
import crypto from "crypto";
import { Address } from "@ton/core";
import { supabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");

  try {
    if (req.method === "POST") {
      // === НОВЫЙ БЕЗОПАСНЫЙ ПУТЬ: initData -> userId -> баланс из БД ===
      const { initData } = req.body || {};
      const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
      if (!v.ok) return res.status(401).json({ error: "Невалидная подпись Telegram", reason: v.reason });

      const userId = v.userId;

      // Берём баланс из БД (нанотоны, BIGINT)
      const { data, error } = await supabase
        .from("users")
        .select("balance_nano")
        .eq("id", userId)
        .single();

      if (error) return res.status(500).json({ error: "Ошибка БД" });

      const nano = toBigInt(data?.balance_nano ?? 0);
      return res.status(200).json({
        success: true,
        userId,
        balanceTON: Number(nano) / 1e9,   // удобно фронту
        balanceNano: nano.toString(),     // точно
      });
    }

    if (req.method === "GET") {
      // === ЛЕГАСИ (по адресу): НЕ идём в TonAPI, а ищем пользователя по адресу и берём БД ===
      const { userAddress } = req.query || {};
      if (!userAddress) return res.status(400).json({ error: "Не указан адрес пользователя" });

      // нормализуем адрес, затем ищем связку в вашей wallet_links
      let forms;
      try {
        forms = makeAddressForms(userAddress);
      } catch {
        return res.status(400).json({ error: "Некорректный формат адреса" });
      }

      // Ищем user_id по любому виду адреса (лучше иметь нормализованный wallet в одной колонке)
      const { data: link } = await supabase
        .from("wallet_links")
        .select("user_id, wallet")
        .or(
          `wallet.eq.${forms.raw},wallet.eq.${forms.uq},wallet.eq.${forms.eq}`
        )
        .limit(1)
        .maybeSingle();

      if (!link?.user_id) {
        return res.status(200).json({ success: true, address: userAddress, balanceTON: 0, balanceNano: "0" });
      }

      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("balance_nano")
        .eq("id", link.user_id)
        .single();

      if (userErr) return res.status(500).json({ error: "Ошибка БД" });

      const nano = toBigInt(userRow?.balance_nano ?? 0);
      return res.status(200).json({
        success: true,
        address: link.wallet,
        userId: link.user_id,
        balanceTON: Number(nano) / 1e9,
        balanceNano: nano.toString(),
        note: "LEGACY_GET; рекомендуем перейти на POST /api/balance с initData",
      });
    }

    return res.status(405).json({ error: "Метод не поддерживается" });
  } catch (e) {
    console.error("balance error:", e);
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

function makeAddressForms(anyAddr) {
  const a = Address.parse(anyAddr);
  const raw = a.toRawString(); // 0:....
  const uq = a.toString({ urlSafe: true, bounceable: false }); // UQ...
  const eq = a.toString({ urlSafe: true, bounceable: true });  // EQ...
  return { raw, uq, eq };
}

function toBigInt(v) {
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
}
