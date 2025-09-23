// /pages/api/verify-deposit.js
import crypto from "crypto";
import { Address } from "@ton/core";
import { supabase } from "../../lib/supabaseClient"; // оставляю как у тебя

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не поддерживается" });

  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: "initData не передан" });

  // 1) Верифицируем initData → userId от Telegram
  const v = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!v.ok) return res.status(401).json({ error: "Невалидная подпись Telegram", reason: v.reason });
  const userId = v.userId;

  // 2) Готовим адрес кассы (разрешим любые форматы при сравнении)
  const cashierEnv = process.env.TON_CASHIER_ADDRESS;
  if (!cashierEnv) return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });

  let cashierForms;
  try {
    cashierForms = makeAddressForms(cashierEnv); // { raw, uq, eq, set }
  } catch {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS некорректен" });
  }

  try {
    // 3) Находим привязанный кошелёк пользователя
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

    // 4) Тянем транзакции кассы из TonAPI
    // Документация v2: /v2/blockchain/accounts/{account}/transactions
    const limit = 50; // можно увеличить или добавить пагинацию
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

    // Ожидаем json.transactions = []
    const txs = Array.isArray(json.transactions) ? json.transactions : [];

    // 5) Фильтруем только нужные входы:
    // - адрес назначения = касса (на всякий случай сверим, хотя дергаем по аккаунту кассы)
    // - источник = привязанный кошелёк
    // - не bounced
    // - value > 0 (нанотоны)
    const good = txs.filter((tx) => {
      const inMsg = tx?.in_msg || tx?.inMsg || {};
      const toAddr = safeAddr(inMsg?.destination?.address || inMsg?.dest || tx?.account?.address);
      const fromAddr = safeAddr(inMsg?.source?.address || inMsg?.src);
      const bounced = boolish(inMsg?.bounced ?? inMsg?.is_bounced ?? tx?.bounced);
      const valueNano = toBigInt(inMsg?.value);

      // адрес назначения точно касса
      if (!toAddr || !addressInSet(toAddr, cashierForms.set)) return false;
      // адрес отправителя = привязанный кошелёк пользователя
      if (!fromAddr || !addressInSet(fromAddr, userForms.set)) return false;
      // не bounced, есть сумма
      if (bounced) return false;
      if (valueNano <= 0n) return false;

      return true;
    });

    // 6) Идемпотентное зачисление по tx_hash; сумма — BIGINT (нанотоны)
    let creditedNano = 0n;

    for (const tx of good) {
      const hash = tx?.hash || tx?.transaction_id?.hash;
      if (!hash) continue;

      // уже зачисляли?
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

      // вставляем депозит (нанотоны как строка) + увеличиваем баланс через RPC
      const insertPayload = {
        user_id: userId,
        tx_hash: hash,
        amount_nano: valueNano.toString(),
        // опц: created_at = new Date((tx.utime || tx.now || Date.now()/1000) * 1000).toISOString()
      };

      const { error: insErr } = await supabase.from("deposits").insert(insertPayload);
      if (insErr) {
        // конкуренция? — если в таблице стоит UNIQUE(tx_hash), мы защитимся
        console.warn("deposit insert error:", insErr);
        continue;
      }

      // Увеличиваем баланс (нанотоны)
      // Создай в БД функцию increment_balance_nano(uid text, inc text) returns void
      const { error: rpcErr } = await supabase.rpc("increment_balance_nano", {
        uid: userId,
        inc: valueNano.toString(),
      });
      if (rpcErr) {
        console.error("increment_balance_nano error:", rpcErr);
        // можно пометить депозит как "pending_recount"
        continue;
      }

      creditedNano += valueNano;
    }

    return res.status(200).json({
      success: true,
      creditedTON: Number(creditedNano) / 1e9, // только для ответа (ок округление)
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
    return a.toRawString(); // сравниваем по raw
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
