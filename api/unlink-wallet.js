// /pages/api/unlink-wallet.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { userId, wallet } = req.body;

  if (!userId || !wallet) {
    return res.status(400).json({ error: "Не указан userId или wallet" });
  }

  try {
    // 🔑 Хранилище привязок — глобальный объект (для продакшена лучше база)
    if (!global.LINKED_WALLETS) global.LINKED_WALLETS = {};

    // Удаляем привязку
    if (global.LINKED_WALLETS[userId] === wallet) {
      delete global.LINKED_WALLETS[userId];
    }

    console.log(`🔓 Кошелёк ${wallet} отвязан от userId ${userId}`);

    return res.status(200).json({ success: true, message: "Кошелёк отвязан" });
  } catch (err) {
    console.error("unlink-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
  }
}
