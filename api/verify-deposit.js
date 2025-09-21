import { supabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { userId, userAddress } = req.body;
  if (!userId || !userAddress) {
    return res.status(400).json({ error: "Не указан userId или userAddress" });
  }

  const cashier = process.env.TON_CASHIER_ADDRESS;
  if (!cashier) {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });
  }

  try {
    const url = `https://tonapi.io/v2/blockchain/accounts/${cashier}/transactions?limit=20`;

    const headers = {};
    if (process.env.TONAPI_KEY) {
      headers["Authorization"] = `Bearer ${process.env.TONAPI_KEY}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`TonAPI error: ${response.status}`);

    const data = await response.json();

    // Берём только новые депозиты от пользователя
    const deposits = data.transactions.filter(
      (tx) =>
        tx.in_msg?.source?.address?.toLowerCase() === userAddress.toLowerCase()
    );

    let credited = 0;

    for (const tx of deposits) {
      const nano = Number(tx.in_msg?.value || 0);
      if (!nano) continue;

      // Проверяем, записан ли уже такой tx в базе
      const { data: existing } = await supabase
        .from("deposits")
        .select("id")
        .eq("tx_hash", tx.hash)
        .maybeSingle();

      if (!existing) {
        // Записываем новый депозит
        await supabase.from("deposits").insert({
          user_id: userId,
          tx_hash: tx.hash,
          amount: nano / 1e9,
        });

        // Увеличиваем баланс пользователя
        await supabase.rpc("increment_balance", {
          uid: userId,
          inc: nano / 1e9,
        });

        credited += nano / 1e9;
      }
    }

    return res.status(200).json({
      success: true,
      credited, // сколько TON реально начислили сейчас
    });
  } catch (err) {
    console.error("verify-deposit error:", err);
    return res.status(500).json({ error: "Ошибка проверки депозита" });
  }
}
