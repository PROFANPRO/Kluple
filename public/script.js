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
const walletBtn = document.getElementById('walletBtn');
const walletIcon = document.getElementById('walletIcon');
const walletDropdown = document.getElementById('walletDropdown');
const disconnectBtn = document.getElementById('disconnectBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

let userAddress = null;
let userId = tg?.initDataUnsafe?.user?.id || null;

// Универсально создаём инстанс TonConnectUI (на всякий случай поддерживаем разные UMD экспорты)
const TCUICtor = (window.TonConnectUI && (window.TonConnectUI.TonConnectUI || window.TonConnectUI)) || null;
if (!TCUICtor) {
  console.error('TonConnect UI не загружен. Проверь <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"> в HTML.');
}
const tonConnectUI = TCUICtor ? new TCUICtor({
  manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json'
}) : null;

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

// === Отслеживание статуса кошелька ===
if (tonConnectUI) {
  tonConnectUI.onStatusChange(async (wallet) => {
    if (wallet?.account?.address) {
      try {
        // Берём адрес напрямую из TonConnect UI
        userAddress = wallet.account.address;

        // Линкуем кошелёк к пользователю на бэке (безопасная логика у тебя в /api/link-wallet)
        if (userId) {
          try {
            const resp = await fetch('/api/link-wallet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, wallet: userAddress })
            });

            const data = await resp.json();

            if (!resp.ok) {
              console.error('[link-wallet] Ошибка HTTP:', data);
              alert(data.error || 'Ошибка при привязке кошелька');
              await tonConnectUI.disconnect();
              return;
            }

            if (data.error) {
              console.warn('[link-wallet] Сервер вернул ошибку:', data.error);
              alert(data.error);
              await tonConnectUI.disconnect();
              return;
            }

            console.log('[link-wallet] Кошелёк успешно привязан или уже был привязан:', data.wallet || userAddress);
          } catch (err) {
            console.error('Ошибка связывания кошелька:', err);
            alert('Не удалось привязать кошелёк');
            await tonConnectUI.disconnect();
            return;
          }
        }

        // UI после успешной привязки
        setWalletUi(userAddress);
        updateBalanceByBackend(userAddress);
        walletIcon.style.display = "inline-block";
        closeWalletModal();

      } catch (err) {
        console.error("onStatusChange error:", err);
      }
    } else {
      resetWalletUI();
    }
  });
}

// === Восстановление сессии ===
window.addEventListener('load', async () => {
  try {
    if (!tonConnectUI) return;
    await tonConnectUI.restoreConnection();
    if (tonConnectUI.account?.address) {
      userAddress = tonConnectUI.account.address;
      setWalletUi(userAddress);
      updateBalanceByBackend(userAddress);
      walletIcon.style.display = "inline-block";
    }
  } catch (e) {
    console.warn('restoreConnection error:', e);
  }
});

// === Кнопки кошелька ===
walletBtn.onclick = async () => {
  if (!tonConnectUI) {
    alert('TonConnect UI не инициализирован');
    return;
  }
  await tonConnectUI.openModal();
};

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

  try {
    await tonConnectUI?.disconnect();
  } catch (e) {
    console.warn('Ошибка disconnect TonConnectUI:', e);
  }
  resetWalletUI();
  walletDropdown.classList.remove('show');
};

function resetWalletUI() {
  walletBtn.textContent = 'Подключить кошелёк';
  walletIcon.style.display = "none";
  balanceDisplay.textContent = '0 TON';
  userAddress = null;
}

function setWalletUi(friendlyAddress) {
  const short = friendlyAddress && friendlyAddress.length > 12
    ? friendlyAddress.slice(0, 6) + '…' + friendlyAddress.slice(-4)
    : (friendlyAddress || 'Подключить кошелёк');
  walletBtn.textContent = short;
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
function openWalletModal() { document.getElementById('walletModal').style.display = 'flex'; }
function closeWalletModal() { document.getElementById('walletModal').style.display = 'none'; }
function openDepositModal() {
  if (!userAddress) return alert('Сначала подключите кошелёк!');
  document.getElementById('depositModal').style.display = 'flex';
}
function closeDepositModal() { document.getElementById('depositModal').style.display = 'none'; }
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }

// === Депозит ===
async function confirmDeposit() {
  console.log("confirmDeposit called");
  const val = document.getElementById('depositAmount').value;
  if (!val || isNaN(val) || Number(val) <= 0) {
    alert('Введите корректную сумму');
    return;
  }
  if (!userAddress || !tonConnectUI?.connected) {
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

    console.log("Отправляем транзакцию через TonConnect UI:", tx);
    // TonConnect UI сам откроет модалку/приложение кошелька
    await tonConnectUI.sendTransaction(tx);

    closeDepositModal();
    alert('Транзакция отправлена! Проверяем депозит...');
    setTimeout(() => updateBalanceByBackend(userAddress), 7000);

  } catch (err) {
    console.error('Ошибка при отправке транзакции', err);
    alert('Ошибка при отправке транзакции');
  }
}

// === Вывод ===
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
  const btn = document.querySelector(`.choice-btn[data-choice="${choice}"]`);
  if (btn) btn.classList.add('active-choice');
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

// === Обработчики нажатий ===
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
