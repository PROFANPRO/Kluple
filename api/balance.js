import fetch from "node-fetch";

export default async function handler(req, res) {
  const { method } = req;

  // Твой TonAPI ключ и адрес кассы из Vercel Environment
  const TONAPI_KEY = process.env.TONAPI_KEY;
  const CASHIER_PRIVATE_KEY = process.env.CASHIER_PRIVATE_KEY;
  const CASHIER_ADDRESS = process.env.CASHIER_ADDRESS;

  if (!TONAPI_KEY || !CASHIER_ADDRESS) {
    return res.status(500).json({ error: "TONAPI_KEY или CASHIER_ADDRESS не заданы" });
  }

  if (method === "GET") {
    try {
      const userAddress = req.query.userAddress;
      if (!userAddress) return res.status(400).json({ error: "Не указан адрес пользователя" });

      const resp = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(userAddress)}`, {
        headers: { Authorization: `Bearer ${TONAPI_KEY}` },
      });

      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ error: data.message || "Ошибка TonAPI" });

      const balanceTON = data.balance ? Number(data.balance) / 1e9 : 0;
      return res.status(200).json({ balance: balanceTON });
    } catch (err) {
      console.error("Ошибка получения баланса:", err);
      return res.status(500).json({ error: "Ошибка получения баланса" });
    }
  }

  if (method === "POST") {
    const { action, amount, userAddress } = req.body;

    if (action === "withdraw") {
      if (!userAddress || !amount) return res.status(400).json({ error: "Не указаны userAddress или amount" });

      try {
        // ⚠️ Здесь нужен код для подписи и отправки транзакции с кассы на адрес пользователя.
        // Для этого лучше использовать официальный SDK tonweb или ton-core.
        // Ниже оставляю заглушку, чтобы ты видел, что вызов идёт.
        console.log(`Вывод ${amount} TON на адрес ${userAddress} с кассы ${CASHIER_ADDRESS}`);

        // Здесь ты добавишь код для создания и подписи перевода TON.
        // Пока возвращаем фейковый ответ.
        return res.status(200).json({
          success: true,
          txHash: "0xFAKE_TX_HASH",
          message: "Вывод инициирован (реальную логику подписи нужно добавить на сервере)",
        });
      } catch (err) {
        console.error("Ошибка вывода:", err);
        return res.status(500).json({ error: "Ошибка при выводе" });
      }
    }

    return res.status(400).json({ error: "Неизвестное действие" });
  }

  return res.status(405).json({ error: "Метод не поддерживается" });
}
