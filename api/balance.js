// /pages/api/balance.js
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const TONAPI_KEY = process.env.TONAPI_KEY;
  const CASHIER = process.env.TON_CASHIER_ADDRESS;
  const { userAddress } = req.query;

  if (!CASHIER) {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });
  }

  if (!userAddress) {
    return res.status(400).json({ error: "Не указан адрес пользователя" });
  }

  try {
    const url = `https://tonapi.io/v2/blockchain/accounts/${CASHIER}/transactions?limit=50`;

    const headers = {};
    if (TONAPI_KEY) headers["Authorization"] = `Bearer ${TONAPI_KEY}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const errData = await resp.json();
      return res.status(resp.status).json({ error: errData.message || "Ошибка TonAPI" });
    }

    const data = await resp.json();
    if (!data.transactions) {
      return res.status(200).json({ success: true, balanceTON: 0 });
    }

    // Фильтруем только депозиты от этого пользователя
    const deposits = data.transactions.filter(
      (tx) => tx.in_msg?.source?.address?.toLowerCase() === userAddress.toLowerCase()
    );

    const totalNano = deposits.reduce((sum, tx) => sum + Number(tx.in_msg?.value || 0), 0);

    return res.status(200).json({
      success: true,
      address: userAddress,
      balanceTON: totalNano / 1e9, // <-- ключевое поле, которое ждёт фронтенд
      txCount: deposits.length,
    });

  } catch (err) {
    console.error("Ошибка получения баланса:", err);
    return res.status(500).json({ error: "Ошибка проверки баланса" });
  }
}
