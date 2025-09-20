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

// === Инициализация TonConnect UI ===
const TCUICtor = (window.TonConnectUI && (window.TonConnectUI.TonConnectUI || window.TonConnectUI)) || null;
if (!TCUICtor) {
  console.error('TonConnect UI не загружен! Проверь <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"> в HTML.');
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

// === Слушаем статус подключения ===
if (tonConnectUI) {
  tonConnectUI.onStatusChange(async (wallet) => {
    if (wallet?.account?.address) {
      userAddress = wallet.account.address;
      console.log('[TonConnectUI] Кошелёк подключен:', userAddress);

      if (userId) {
        try {
          const resp = await fetch('/api/link-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, wallet: userAddress })
          });

          const data = await resp.json();
          if (!resp.ok || data.error) {
            alert(data.error || 'Ошибка при привязке кошелька');
            await tonConnectUI.disconnect();
            return;
          }
          console.log('[link-wallet] Привязка прошла успешно:', data.wallet);
        } catch (err) {
          console.error('Ошибка при link-wallet:', err);
          await tonConnectUI.disconnect();
          return;
        }
      }

      setWalletUi(userAddress);
      updateBalanceByBackend(userAddress);
      walletIcon.style.display = "inline-block";
      closeWalletModal();
    } else {
      resetWalletUI();
    }
  });
}

// === Восстановление сессии ===
window.addEventListener('load', async () => {
  if (!tonConnectUI) return;
  await tonConnectUI.restoreConnection();
  if (tonConnectUI.account?.address) {
    userAddress = tonConnectUI.account.address;
    setWalletUi(userAddress);
    updateBalanceByBackend(userAddress);
    walletIcon.style.display = "inline-block";
  }
});

// === Кнопки кошелька ===
walletBtn.onclick = async () => {
  console.log("[UI] Нажата кнопка подключения кошелька");
  if (!tonConnectUI) return alert('TonConnect UI не инициализирован!');
  await tonConnectUI.openModal();
};

walletIcon.onclick = () => walletDropdown.classList.toggle('show');

disconnectBtn.onclick = async () => {
  console.log("[UI] Нажата кнопка отключения кошелька");
  try {
    if (userId && userAddress) {
      await fetch('/api/unlink-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, wallet: userAddress })
      });
    }
    await tonConnectUI.disconnect();
    resetWalletUI();
    walletDropdown.classList.remove('show');
  } catch (e) {
    console.warn('Ошибка при disconnect:', e);
  }
};

function resetWalletUI() {
  walletBtn.textContent = 'Подключить кошелёк';
  walletIcon.style.display = "none";
  balanceDisplay.textContent = '0 TON';
  userAddress = null;
}

function setWalletUi(friendlyAddress) {
  const short = friendlyAddress.length > 12
    ? friendlyAddress.slice(0, 6) + '…' + friendlyAddress.slice(-4)
    : friendlyAddress;
  walletBtn.textContent = short;
}

// === Модалки ===
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
  console.log("[UI] confirmDeposit вызван");
  const val = document.getElementById('depositAmount').value;
  if (!val || isNaN(val) || Number(val) <= 0) return alert('Введите корректную сумму');
  if (!userAddress || !tonConnectUI?.connected) return alert('Сначала подключите кошелёк!');

  try {
    const cashierResp = await fetch('/api/get-cashier-address');
    const cashierData = await cashierResp.json();
    if (!cashierResp.ok || !cashierData?.address) return alert(cashierData.error || 'Не удалось получить адрес кассы');

    const cashierAddress = cashierData.address;
    const nanoAmount = Math.floor(Number(val) * 1e9);

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: cashierAddress, amount: String(nanoAmount) }]
    };

    console.log("[TonConnectUI] Отправляем транзакцию:", tx);
    await tonConnectUI.sendTransaction(tx); // UI откроет кошелёк

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
  console.log("[UI] confirmWithdraw вызван");
  const val = document.getElementById('withdrawAmount').value;
  if (!val || isNaN(val) || Number(val) <= 0) return alert('Введите корректную сумму');
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

  if (!bet || bet <= 0) return alert('Введите корректную ставку!');
  if (!selectedChoice) return alert('Сделайте выбор: <7, =7 или >7');

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

// === Навешиваем обработчики кнопок напрямую ===
const depBtn = document.getElementById('depositSubmit');
if (depBtn) depBtn.onclick = (e) => { e.preventDefault(); console.log("[UI] Кнопка депозита"); confirmDeposit(); };

const wdrBtn = document.getElementById('withdrawSubmit');
if (wdrBtn) wdrBtn.onclick = (e) => { e.preventDefault(); console.log("[UI] Кнопка вывода"); confirmWithdraw(); };

// === Делаем функции глобальными для HTML ===
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.confirmDeposit = confirmDeposit;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.confirmWithdraw = confirmWithdraw;
window.openGame = openGame;
window.closeGame = closeGame;
window.startGame = startGame;
