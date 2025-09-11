// /pages/api/balance.js
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const TONAPI_KEY = process.env.TONAPI_KEY;
  const { userAddress } = req.query;

  if (!userAddress) {
    return res.status(400).json({ error: "Не указан адрес пользователя" });
  }

  try {
    const url = `https://tonapi.io/v2/accounts/${encodeURIComponent(userAddress)}`;
    const headers = {};

    if (TONAPI_KEY) {
      headers["Authorization"] = `Bearer ${TONAPI_KEY}`;
    }

    const resp = await fetch(url, { headers });
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || "Ошибка TonAPI" });
    }

    const balanceTON = data.balance ? Number(data.balance) / 1e9 : 0;

    return res.status(200).json({
      success: true,
      address: userAddress,
      balanceTON: balanceTON,
    });

  } catch (err) {
    console.error("Ошибка получения баланса:", err);
    return res.status(500).json({ error: "Ошибка получения баланса" });
  }
}
