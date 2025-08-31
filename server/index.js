import express from "express";
import TonWeb from "tonweb";

const app = express();
app.use(express.json());

// Подключение к toncenter API
const tonweb = new TonWeb(
  new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC", {
    apiKey: process.env.TONCENTER_API_KEY,
  })
);

const BOT_ADDRESS = "UQA8Ern5Ak7FeXpOkMO0OZDa2hcPpDxbeopk3klxAo_WKmCG";

// Хранилище игровых балансов в памяти (можно позже подключить БД)
let balances = {};

// Проверка депозитов от игроков на адрес бота
async function checkDeposits() {
  const addr = new TonWeb.utils.Address(BOT_ADDRESS);
  const txs = await tonweb.provider.getTransactions(addr.toString(), 20);

  txs.forEach((tx) => {
    const from = tx.in_msg?.source;
    const value = parseInt(tx.in_msg?.value || "0");
    if (from && value > 0) {
      if (!balances[from]) balances[from] = 0;
      balances[from] += value / 1e9; // из нанотон в TON
    }
  });
}

// API: получить баланс игрока
app.get("/api/balance/:address", (req, res) => {
  const { address } = req.params;
  res.json({ balance: balances[address] || 0 });
});

// API: депозит (игрок переводит TON на бота, сервер увеличивает баланс)
app.post("/api/deposit", (req, res) => {
  const { address, amount } = req.body;
  if (!address || !amount || amount <= 0) return res.status(400).json({ error: "Неверные данные" });

  if (!balances[address]) balances[address] = 0;
  balances[address] += Number(amount);
  res.json({ balance: balances[address] });
});

// API: вывод (игрок снимает TON)
app.post("/api/withdraw", async (req, res) => {
  const { address, amount } = req.body;
  if (!address || !amount || amount <= 0) return res.status(400).json({ error: "Неверные данные" });
  if ((balances[address] || 0) < amount) return res.status(400).json({ error: "Недостаточно средств" });

  balances[address] -= Number(amount);

  // TODO: здесь можно добавить реальный перевод через TON SDK на кошелёк игрока

  res.json({ balance: balances[address] });
});

// Проверка депозитов каждые 15 секунд
setInterval(checkDeposits, 15000);

app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));
