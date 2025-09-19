export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const cashier = process.env.TON_CASHIER_ADDRESS;
  if (!cashier) {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });
  }

  const { userAddress } = req.query;
  if (!userAddress) {
    return res.status(400).json({ error: "Не указан адрес пользователя" });
  }

  try {
    // 1. Собираем URL запроса к TonAPI
    const url = `https://tonapi.io/v2/blockchain/accounts/${cashier}/transactions?limit=20`;

    // 2. Если есть ключ TonAPI — добавляем его в заголовки
    const headers = {};
    if (process.env.TONAPI_KEY) {
      headers["Authorization"] = `Bearer ${process.env.TONAPI_KEY}`;
    }

    // 3. Делаем запрос
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`TonAPI error: ${response.status}`);
    }

    const data = await response.json();

    // 4. Фильтруем только входящие транзакции от этого пользователя
    const deposits = data.transactions.filter(
      (tx) =>
        tx.in_msg?.source?.address?.toLowerCase() === userAddress.toLowerCase()
    );

    // 5. Суммируем полученные TON
    const totalNano = deposits.reduce((sum, tx) => {
      return sum + (Number(tx.in_msg?.value || 0));
    }, 0);

    return res.status(200).json({
      success: true,
      totalDepositedTON: totalNano / 1e9,
      txCount: deposits.length,
    });
  } catch (err) {
    console.error("verify-deposit error:", err);
    return res.status(500).json({ error: "Ошибка проверки депозита" });
  }
}
