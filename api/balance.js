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
    // 1. Собираем URL запроса последних транзакций кассы
    const url = `https://tonapi.io/v2/blockchain/accounts/${CASHIER}/transactions?limit=50`;

    const headers = {};
    if (TONAPI_KEY) {
      headers["Authorization"] = `Bearer ${TONAPI_KEY}`;
    }

    // 2. Запрашиваем транзакции
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const errData = await resp.json();
      return res.status(resp.status).json({ error: errData.message || "Ошибка TonAPI" });
    }

    const data = await resp.json();
    if (!data.transactions) {
      return res.status(200).json({ success: true, balanceTON: 0 });
    }

    // 3. Фильтруем только входящие транзакции от userAddress
    const deposits = data.transactions.filter(
      (tx) =>
        tx.in_msg?.source?.address?.toLowerCase() === userAddress.toLowerCase()
    );

    // 4. Суммируем полученные TON
    const totalNano = deposits.reduce((sum, tx) => {
      return sum + Number(tx.in_msg?.value || 0);
    }, 0);

    return res.status(200).json({
      success: true,
      address: userAddress,
      depositedTON: totalNano / 1e9,
      txCount: deposits.length,
    });

  } catch (err) {
    console.error("Ошибка получения баланса:", err);
    return res.status(500).json({ error: "Ошибка проверки баланса" });
  }
}
