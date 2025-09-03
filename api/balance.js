export default async function handler(req, res) {
  if (!global.USER_BALANCES) global.USER_BALANCES = {};

  const { method } = req;

  if (method === "GET") {
    const userId = req.query.user;
    const balance = global.USER_BALANCES[userId] || 0;
    return res.status(200).json({ balance });
  }

  if (method === "POST") {
    const { userId, amount, action } = req.body;

    if (!global.USER_BALANCES[userId]) global.USER_BALANCES[userId] = 0;

    if (action === "deposit") {
      global.USER_BALANCES[userId] += amount;
    } else if (action === "withdraw") {
      if (global.USER_BALANCES[userId] < amount) {
        return res.status(400).json({ error: "Недостаточно средств" });
      }
      global.USER_BALANCES[userId] -= amount;
    }

    return res
      .status(200)
      .json({ balance: global.USER_BALANCES[userId] });
  }

  return res.status(405).json({ error: "Метод не поддерживается" });
}
