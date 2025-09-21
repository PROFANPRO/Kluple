// === Telegram WebApp ===
const tg = window.Telegram?.WebApp;
tg?.expand();

const userPhoto = document.getElementById('userPhoto');
const user = tg?.initDataUnsafe?.user;
if (user?.photo_url) userPhoto.src = user.photo_url;
userPhoto.addEventListener('click', () => {
  if (user?.username) window.open('https://t.me/' + user.username, '_blank');
});

// === TonConnect UI ===
const walletIcon = document.getElementById('walletIcon');
const walletDropdown = document.getElementById('walletDropdown');
const disconnectBtn = document.getElementById('disconnectBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

let userAddress = null;
let userId = tg?.initDataUnsafe?.user?.id || null;

// Инициализируем TonConnect UI
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json',
  buttonRootId: 'walletBtn', // TonConnect вставит свою кнопку
});

// === Баланс через backend ===
async function updateBalanceByBackend(friendlyAddress) {
  try {
    const resp = await fetch(`/api/balance?userAddress=${encodeURIComponent(friendlyAddress)}`);
    const data = await resp.json();
    if (resp.ok) {
      balanceDisplay.textContent = (Number(data.balanceTON) || 0).toFixed(4) + ' TON';
    } else {
      console.error('Ошибка при получении баланса:', data.error);
      balanceDisplay.textContent = '0 TON';
    }
  } catch (e) {
    console.error('Ошибка запроса баланса:', e);
    balanceDisplay.textContent = '0 TON';
  }
}

// Слушаем изменения статуса
tonConnectUI.onStatusChange(async (wallet) => {
  if (wallet) {
    try {
      userAddress = wallet.account.address;
      if (userId) {
        try {
          const resp = await fetch('/api/link-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, wallet: userAddress })
          });

          const data = await resp.json();

          if (!resp.ok || data.error) {
            console.error('[link-wallet] Ошибка:', data.error || resp.status);
            alert(data.error || 'Ошибка при привязке кошелька');
            await tonConnectUI.disconnect();
            return;
          }

          console.log('[link-wallet] Кошелёк привязан:', data.wallet);
        } catch (err) {
          console.error('Ошибка связывания кошелька:', err);
          alert('Не удалось привязать кошелёк');
          await tonConnectUI.disconnect();
          return;
        }
      }

      walletIcon.style.display = "inline-block";
      updateBalanceByBackend(userAddress);

    } catch (err) {
      console.error("onStatusChange error:", err);
    }
  } else {
    resetWalletUI();
  }
});

// Восстанавливаем сессию при загрузке
window.addEventListener('load', async () => {
  await tonConnectUI.connectionRestored;
  if (tonConnectUI.account) {
    userAddress = tonConnectUI.account.address;
    walletIcon.style.display = "inline-block";
    updateBalanceByBackend(userAddress);
  }
});

walletIcon.onclick = () => {
  walletDropdown.classList.toggle('show');
};

disconnectBtn.onclick = async () => {
  try {
    if (userId && userAddress) {
      await fetch('/api/unlink-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, wallet: userAddress })
      });
    }
  } catch (err) {
    console.error('Ошибка при отвязке кошелька:', err);
  }
  await tonConnectUI.disconnect();
  resetWalletUI();
  walletDropdown.classList.remove('show');
};

function resetWalletUI() {
  walletIcon.style.display = "none";
  balanceDisplay.textContent = '0 TON';
  userAddress = null;
}

// === Страницы ===
function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (nav) nav.classList.add('active');
}

function openPromoModal() { document.getElementById('promoModal').style.display = 'flex'; }
function closePromoModal() { document.getElementById('promoModal').style.display = 'none'; }
function openMenu() { document.getElementById('menuModal').style.display = 'flex'; }
function closeMenu() { document.getElementById('menuModal').style.display = 'none'; }
function openDepositModal() {
  if (!userAddress) return alert('Сначала подключите кошелёк!');
  document.getElementById('depositModal').style.display = 'flex';
}
function closeDepositModal() { document.getElementById('depositModal').style.display = 'none'; }
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }

// === Депозит и вывод ===
async function confirmDeposit() {
  console.log("confirmDeposit called");
  const val = document.getElementById('depositAmount').value;
  if (!val || isNaN(val) || Number(val) <= 0) {
    alert('Введите корректную сумму');
    return;
  }
  if (!userAddress || !tonConnectUI.connected) {
    alert('Сначала подключите кошелёк!');
    return;
  }

  try {
    const cashierResp = await fetch('/api/get-cashier-address');
    const cashierData = await cashierResp.json();
    if (!cashierResp.ok || !cashierData?.address) {
      alert(cashierData.error || 'Не удалось получить адрес кассы');
      return;
    }

    const cashierAddress = cashierData.address;
    const nanoAmount = Math.floor(Number(val) * 1e9);

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: cashierAddress, amount: String(nanoAmount) }]
    };

    console.log("Отправляем транзакцию:", tx);
    const result = await tonConnectUI.sendTransaction(tx);
    console.log('TonConnect UI TX result:', result);

    closeDepositModal();

    alert('Транзакция отправлена! Проверяем депозит...');
    setTimeout(() => updateBalanceByBackend(userAddress), 7000);

  } catch (err) {
    console.error('Ошибка при отправке транзакции', err);
    alert('Ошибка при отправке транзакции');
  }
}

async function confirmWithdraw() {
  const val = document.getElementById('withdrawAmount').value;
  if (!val || isNaN(val) || Number(val) <= 0) {
    alert('Введите корректную сумму');
    return;
  }
  alert('Вывод реализуется на сервере. Добавь /api/withdraw с подписью транзакции.');
  closeWithdrawModal();
}

// === Игры ===
let selectedChoice = null;

function selectChoice(choice) {
  selectedChoice = choice;
  document.querySelectorAll('.choice-btn').forEach(btn => btn.classList.remove('active-choice'));
  document.querySelector(`.choice-btn[data-choice="${choice}"]`).classList.add('active-choice');
}

function openGame(game) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById('gameContainer').classList.add('active');

  const titles = {
    roulette: "Рулетка",
    ninja: "Ниндзя",
    tower: "Башня",
    seven: "Под 7 над",
    cs: "CS",
    luck: "Колесо удачи"
  };
  document.getElementById('gameTitle').textContent = titles[game] || "Игра";

  document.getElementById('betAmount').value = '';
  document.getElementById('gameResult').textContent = '';

  const choiceBlock = document.querySelector('.choice-buttons');
  const diceArea = document.getElementById('diceArea');
  if (game === 'seven') {
    choiceBlock.style.display = 'flex';
    diceArea.style.display = 'flex';
  } else {
    choiceBlock.style.display = 'none';
    diceArea.style.display = 'none';
  }
}

function closeGame() {
  document.getElementById('gameContainer').classList.remove('active');
  showPage('games', document.querySelector('.bottom-nav .nav-item:nth-child(2)'));
}

function startGame() {
  const betInput = document.getElementById('betAmount');
  const resultEl = document.getElementById('gameResult');
  const betBtn = document.getElementById('betBtn');
  const bet = Number(betInput.value);

  if (!bet || bet <= 0) {
    alert('Введите корректную ставку!');
    return;
  }
  if (!selectedChoice) {
    alert('Сделайте выбор: <7, =7 или >7');
    return;
  }

  betBtn.disabled = true;
  betBtn.textContent = 'Ожидание...';

  const diceArea = document.getElementById('diceArea');
  const countdown = document.getElementById('countdown');

  resultEl.textContent = '';
  diceArea.innerHTML = '';
  diceArea.style.display = 'none';

  countdown.style.display = 'block';
  let timer = 5;
  countdown.textContent = timer;
  const interval = setInterval(() => {
    timer--;
    if (timer > 0) {
      countdown.textContent = timer;
    } else {
      clearInterval(interval);
      countdown.style.display = 'none';

      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      const sum = dice1 + dice2;

      diceArea.innerHTML = `
        <div class="dice">${dice1}</div>
        <div class="dice">${dice2}</div>
      `;
      diceArea.style.display = 'flex';

      let win = false;
      if (selectedChoice === '<' && sum < 7) win = true;
      if (selectedChoice === '=' && sum === 7) win = true;
      if (selectedChoice === '>' && sum > 7) win = true;

      resultEl.style.color = win ? '#22c55e' : '#ef4444';
      resultEl.textContent = `Выпало ${sum}. ${win ? `Вы выиграли ${bet * 2}! 🎉` : 'Вы проиграли 😔'}`;

      setTimeout(() => {
        betBtn.disabled = false;
        betBtn.textContent = 'Сделать ставку';
      }, 1500);
    }
  }, 1000);
}

// === Обработчики нажатий для депозитов и вывода ===
document.addEventListener('DOMContentLoaded', () => {
  const depBtn = document.getElementById('depositSubmit');
  if (depBtn) depBtn.addEventListener('click', (e) => {
    e.preventDefault();
    confirmDeposit();
  });

  const wdrBtn = document.getElementById('withdrawSubmit');
  if (wdrBtn) wdrBtn.addEventListener('click', (e) => {
    e.preventDefault();
    confirmWithdraw();
  });
});
