export default function handler(req, res) {
  // Берём адрес кассы из переменных окружения
  const cashier = process.env.TON_CASHIER_ADDRESS;

  if (!cashier) {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });
  }

  return res.status(200).json({ address: cashier });
}
