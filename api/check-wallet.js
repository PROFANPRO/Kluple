// /pages/api/check-wallet.js
if (!global.USER_WALLETS) global.USER_WALLETS = {};

export default async function handler(req, res) {
  const { wallet, userId } = req.query;

  if (!wallet || !userId) {
    return res.status(400).json({ allowed: false, error: "wallet или userId не указаны" });
  }

  const linkedWallet = global.USER_WALLETS[userId];

  // Разрешаем только если кошелёк совпадает с ранее привязанным
  if (linkedWallet && linkedWallet === wallet) {
    return res.status(200).json({ allowed: true });
  }

  return res.status(403).json({ allowed: false, error: "Кошелёк не привязан к этому аккаунту" });
}
