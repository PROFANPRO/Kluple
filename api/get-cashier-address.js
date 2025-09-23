// /pages/api/get-cashier-address.js
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const cashier = process.env.TON_CASHIER_ADDRESS;
  if (!cashier) {
    return res.status(500).json({ error: "TON_CASHIER_ADDRESS не настроен" });
  }

  return res.status(200).json({ address: cashier });
}
