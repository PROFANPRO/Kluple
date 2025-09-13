export default async function handler(req, res) {
  const { wallet, userId } = req.query;

  if (!wallet || !userId) {
    return res.status(400).json({ allowed: false, error: "wallet или userId не указаны" });
  }

  // ⚠️ Временная простая логика:
  // Всегда разрешаем. Ты можешь хранить связки userId <-> wallet в базе данных,
  // чтобы проверять что этот кошелёк действительно привязан к этому пользователю.
  return res.status(200).json({ allowed: true });
}
