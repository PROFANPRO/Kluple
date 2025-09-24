// /api/verify-deposit.js
import crypto from "crypto";
import { Address } from "@ton/core";
import { supabase } from "../lib/supabaseClient.js"; // ← из /pages/api к /lib

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не поддерживается" });

  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData не передан" });

  // 1) Верифицируем initData → userId
  const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!v.ok) return res.status(401).json({ error: "Невалидная подпись Telegram", reason: v.reason });
  const userId = v.userId;

  // 1.1) Гарантируем, что пользователь существует (idempotent)
  {
    const { error: upsertUserErr } = await supabase
      .from("users")
      .upsert({ id: userId, balance_nano: 0 }, { onConflict: "id" });
    if (upsertUserErr) console.warn("[verify-deposit] users upsert warning:", upsertUserErr);
  }

  // 2) Адрес кассы
  const cashierEnv = process.env.TON_CASHIER_ADDRESS;
  if (!cashierEnv) return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });

  let cashierForms;
  try {
    cashierForms = makeAddressForms(cashierEnv);
  } catch {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS некорректен" });
  }

  try {
    // 3) Привязанный кошелёк пользователя
    const { data: linkRows, error: linkErr } = await supabase
      .from("wallet_links")
      .select("wallet")
      .eq("user_id", userId)
      .limit(1);

    if (linkErr) return res.status(500).json({ error: "Ошибка БД (wallet_links)" });
    const linkedWallet = linkRows?.[0]?.wallet;
    if (!linkedWallet) return res.status(400).json({ error: "Кошелёк не привязан" });

    let userForms;
    try {
      userForms = makeAddressForms(linkedWallet);
    } catch {
      return res.status(400).json({ error: "Привязанный адрес пользователя некорректен" });
    }

    // 4) Транзакции кассы из TonAPI
    const limit = 50;
    const url = `https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(
      cashierForms.uq
    )}/transactions?limit=${limit}`;

    const headers = {};
    if (process.env.TONAPI_KEY) headers["Authorization"] = `Bearer ${process.env.TONAPI_KEY}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`TonAPI ${resp.status}: ${text}`);
    }

    const json = await resp.json();
    const txs = Array.isArray(json.transactions) ? json.transactions : [];

    // 5) Фильтруем внесения от пользователя на кассу
    const good = txs.filter((tx) => {
      const inMsg = tx?.in_msg || tx?.inMsg || {};
      const toAddr = safeAddr(inMsg?.destination?.address || inMsg?.dest || tx?.account?.address);
      const fromAddr = safeAddr(inMsg?.source?.address || inMsg?.src);
      const bounced = boolish(inMsg?.bounced ?? inMsg?.is_bounced ?? tx?.bounced);
      const valueNano = toBigInt(inMsg?.value);

      if (!toAddr || !addressInSet(toAddr, cashierForms.set)) return false;
      if (!fromAddr || !addressInSet(fromAddr, userForms.set)) return false;
      if (bounced) return false;
      if (valueNano <= 0n) return false;

      return true;
    });

    // 6) Идемпотентное зачисление по tx_hash
    let creditedNano = 0n;

    for (const tx of good) {
      const hash = tx?.hash || tx?.transaction_id?.hash;
      if (!hash) continue;

      const { data: existing, error: exErr } = await supabase
        .from("deposits")
        .select("id")
        .eq("tx_hash", hash)
        .maybeSingle();

      if (exErr) {
        console.warn("deposit lookup error:", exErr);
        continue;
      }
      if (existing) continue;

      const valueNano = toBigInt(tx?.in_msg?.value ?? tx?.inMsg?.value);
      if (valueNano <= 0n) continue;

      const insertPayload = {
        user_id: userId,
        tx_hash: hash,
        amount_nano: valueNano.toString(),
      };

      const { error: insErr } = await supabase.from("deposits").insert(insertPayload);
      if (insErr) {
        console.warn("deposit insert error:", insErr);
        continue;
      }

      const { error: rpcErr } = await supabase.rpc("increment_balance_nano", {
        uid: userId,
        amount_text: valueNano.toString(),
      });
      if (rpcErr) {
        console.error("increment_balance_nano error:", rpcErr);
        continue;
      }

      creditedNano += valueNano;
    }

    return res.status(200).json({
      success: true,
      creditedTON: Number(creditedNano) / 1e9,
      creditedNano: creditedNano.toString(),
      counted: good.length,
    });
  } catch (err) {
    console.error("verify-deposit error:", err);
    return res.status(500).json({ error: "Ошибка проверки депозита" });
  }
}

/* ------------- helpers ------------- */

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
  for (const [k, v] of params.entries()) if (k !== "hash") entries.push(`${k}=${v}`);
  entries.sort();
  const dataCheckString = entries.join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
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
  const set = new Set([raw, uq, eq].map(norm));
  return { raw, uq, eq, set };
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function safeAddr(s) {
  try {
    if (!s) return null;
    const a = Address.parse(s);
    return a.toRawString();
  } catch {
    return null;
  }
}

function addressInSet(addrAnyFormat, set) {
  try {
    const raw = Address.parse(addrAnyFormat).toRawString();
    return set.has(norm(raw)) || set.has(norm(addrAnyFormat));
  } catch {
    return false;
  }
}

function toBigInt(nano) {
  try {
    const n = BigInt(nano ?? 0);
    return n < 0n ? 0n : n;
  } catch {
    return 0n;
  }
}

function boolish(v) {
  return v === true || v === 1 || v === "true";
}
