// /pages/api/unlink-wallet.js
if (!global.USER_WALLETS) global.USER_WALLETS = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { userId, wallet } = req.body;

  if (!userId || !wallet) {
    return res.status(400).json({ error: "Не указан userId или wallet" });
  }

  try {
    // Удаляем привязку, если она есть
    if (global.USER_WALLETS[userId] === wallet) {
      delete global.USER_WALLETS[userId];
      console.log(`🔓 Кошелёк ${wallet} отвязан от userId ${userId}`);
    }

    return res.status(200).json({ success: true, message: "Кошелёк отвязан" });
  } catch (err) {
    console.error("unlink-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
  }
}
