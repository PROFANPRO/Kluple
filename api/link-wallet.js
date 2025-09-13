// /pages/api/link-wallet.js
// ❗ Память сервера — будет сбрасываться при каждом деплое, 
// лучше использовать БД, если проект пойдёт в продакшн
if (!global.USER_WALLETS) global.USER_WALLETS = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { userId, wallet } = req.body;

  if (!userId || !wallet) {
    return res.status(400).json({ error: "Не указан userId или wallet" });
  }

  // Проверяем, не привязан ли этот кошелёк к другому пользователю
  for (const [uid, addr] of Object.entries(global.USER_WALLETS)) {
    if (addr === wallet && uid !== userId) {
      return res.status(400).json({ error: "Этот кошелёк уже привязан к другому аккаунту" });
    }
  }

  // Привязываем кошелёк
  global.USER_WALLETS[userId] = wallet;
  console.log(`[link-wallet] user ${userId} привязал ${wallet}`);

  return res.status(200).json({ success: true, wallet });
}
