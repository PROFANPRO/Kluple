import express from "express";
import TonWeb from "tonweb";

const app = express();
app.use(express.json());

// Подключение к toncenter API
const tonweb = new TonWeb(
  new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC", {
    apiKey: process.env.TONCENTER_API_KEY, // ключ возьмём позже
  })
);

// Адрес кошелька бота
const BOT_ADDRESS = "UQA8Ern5Ak7FeXpOkMO0OZDa2hcPpDxbeopk3klxAo_WKmCG";
let balances = {}; // пока что хранение в памяти

// Проверка новых депозитов
async function checkDeposits() {
  const addr = new TonWeb.utils.Address(BOT_ADDRESS);
  const txs = await tonweb.provider.getTransactions(addr.toString(), 10);

  txs.forEach((tx) => {
    const from = tx.in_msg?.source;
    const value = parseInt(tx.in_msg?.value || "0");
    if (from && value > 0) {
      if (!balances[from]) balances[from] = 0;
      balances[from] += value / 1e9; // из нанотон в TON
    }
  });
}

// API: отдать баланс по адресу
app.get("/api/balance/:address", (req, res) => {
  const { address } = req.params;
  res.json({ balance: balances[address] || 0 });
});

// каждые 15 секунд проверяем транзакции
setInterval(checkDeposits, 15000);

app.listen(3000, () =>
  console.log("✅ Server running on http://localhost:3000")
);
