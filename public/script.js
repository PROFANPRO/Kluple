// === Telegram WebApp ===
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

// Подхватываем аватар/ссылку
const userPhoto = document.getElementById('userPhoto');
const user = tg?.initDataUnsafe?.user;
if (user?.photo_url) userPhoto.src = user.photo_url;
userPhoto.addEventListener('click', () => {
  if (user?.username) window.open(`https://t.me/${user.username}`, '_blank');
});

// Реакция на смену темы (чтобы CSS мог подстроиться)
tg?.onEvent?.('themeChanged', () => {
  document.documentElement.setAttribute('data-tg-theme', tg.themeParams?.button_color ? 'dark' : 'light');
});

// === TonConnect UI ===
const walletIcon = document.getElementById('walletIcon');
const walletDropdown = document.getElementById('walletDropdown');
const disconnectBtn = document.getElementById('disconnectBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

let userAddress = null;
const userId = tg?.initDataUnsafe?.user?.id || null;
const initData = tg?.initData || ''; // В ЭТОМ — подпись Telegram

// ✳️ ВАЖНО: хостим манифест у себя, а не на raw.githubusercontent
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: `${location.origin}/tonconnect-manifest.json`,
  buttonRootId: 'walletBtn',
});

// === Баланс через backend ===
async function updateBalanceByBackend(friendlyAddress) {
  try {
    // Лучше передавать только address; user сервер узнает по связке
    const resp = await fetch(`/api/balance?userAddress=${encodeURIComponent(friendlyAddress)}`);
    const data = await resp.json();
    if (resp.ok && Number.isFinite(Number(data.balanceTON))) {
      balanceDisplay.textContent = `${Number(data.balanceTON).toFixed(4)} TON`;
    } else {
      console.error('Ошибка при получении баланса:', data.error);
      balanceDisplay.textContent = '0 TON';
    }
  } catch (e) {
    console.error('Ошибка запроса баланса:', e);
    balanceDisplay.textContent = '0 TON';
  }
}

// Прячем/сбрасываем кошелек в UI
function resetWalletUI() {
  walletIcon.style.display = 'none';
  walletDropdown.classList.remove('show');
  balanceDisplay.textContent = '0 TON';
  userAddress = null;
}

// Слушаем изменения статуса TonConnect
tonConnectUI.onStatusChange(async (wallet) => {
  if (wallet) {
    try {
      userAddress = wallet.account.address; // friendly (bounceable) адрес
      // Привязываем кошелёк к пользователю на бэке с проверкой подписи Telegram
      if (userId && initData) {
        const resp = await fetch('/api/link-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, wallet: userAddress }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) {
          console.error('[link-wallet] Ошибка:', data.error || resp.status);
          alert(data.error || 'Ошибка при привязке кошелька');
          await tonConnectUI.disconnect();
          return;
        }
      }
      walletIcon.style.display = 'inline-block';
      updateBalanceByBackend(userAddress);
    } catch (err) {
      console.error('onStatusChange error:', err);
    }
  } else {
    resetWalletUI();
  }
});

// Восстанавливаем сессию при загрузке
window.addEventListener('load', async () => {
  try {
    await tonConnectUI.connectionRestored;
    if (tonConnectUI.account) {
      userAddress = tonConnectUI.account.address;
      walletIcon.style.display = 'inline-block';
      updateBalanceByBackend(userAddress);
    }
  } catch (e) {
    console.error('Restore connection error:', e);
  }
});

// Дропдаун кошелька
walletIcon.onclick = () => walletDropdown.classList.toggle('show');
document.addEventListener('click', (e) => {
  if (!walletDropdown.contains(e.target) && e.target !== walletIcon) {
    walletDropdown.classList.remove('show');
  }
});

// Отвязка кошелька
disconnectBtn.onclick = async () => {
  try {
    if (initData && userAddress) {
      await fetch('/api/unlink-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, wallet: userAddress }),
      });
    }
  } catch (err) {
    console.error('Ошибка при отвязке кошелька:', err);
  }
  await tonConnectUI.disconnect();
  resetWalletUI();
};

// === Страницы/модалки ===
function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (nav) nav.classList.add('active');
}
window.showPage = showPage; // если вызывается из inline onclick

function openPromoModal() { document.getElementById('promoModal').style.display = 'flex'; }
function closePromoModal() { document.getElementById('promoModal').style.display = 'none'; }
function openMenu() { document.getElementById('menuModal').style.display = 'flex'; }
function closeMenu() { document.getElementById('menuModal').style.display = 'none'; }
function openDepositModal() {
  if (!userAddress || !tonConnectUI.connected) return alert('Сначала подключите кошелёк!');
  document.getElementById('depositModal').style.display = 'flex';
}
function closeDepositModal() { document.getElementById('depositModal').style.display = 'none'; }
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }
window.openPromoModal = openPromoModal;
window.closePromoModal = closePromoModal;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;

// === Депозит и вывод ===
function toNano(tonStrOrNum) {
  const n = Number(tonStrOrNum);
  if (!Number.isFinite(n)) return null;
  // защита от слишком больших сумм, чтобы не переполнить Number
  if (n > 10_000_000) return null;
  return String(Math.round(n * 1e9));
}

async function confirmDeposit() {
  const valStr = document.getElementById('depositAmount').value.trim();
  const val = Number(valStr);
  if (!Number.isFinite(val) || val <= 0) return alert('Введите корректную сумму');
  if (val < 0.01) return alert('Минимум 0.01 TON');
  if (!userAddress || !tonConnectUI.connected) return alert('Сначала подключите кошелёк!');

  try {
    const cashierResp = await fetch('/api/get-cashier-address');
    const cashierData = await cashierResp.json();
    if (!cashierResp.ok || !cashierData?.address) {
      alert(cashierData.error || 'Не удалось получить адрес кассы');
      return;
    }
    const cashierAddress = cashierData.address;
    const nanoAmount = toNano(val);
    if (!nanoAmount) return alert('Неверная сумма');

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: cashierAddress, amount: nanoAmount }],
    };

    const result = await tonConnectUI.sendTransaction(tx);
    console.log('TonConnect TX result:', result);
    closeDepositModal();

    // Подтверждение и обновление баланса (лучше — через вебсокет/вебхук)
    alert('Транзакция отправлена! Проверяем депозит...');
    setTimeout(() => updateBalanceByBackend(userAddress), 7000);
  } catch (err) {
    console.error('Ошибка при отправке транзакции', err);
    alert('Ошибка при отправке транзакции');
  }
}
window.confirmDeposit = confirmDeposit;

async function confirmWithdraw() {
  const valStr = document.getElementById('withdrawAmount').value.trim();
  const val = Number(valStr);
  if (!Number.isFinite(val) || val <= 0) return alert('Введите корректную сумму');
  if (val < 0.01) return alert('Минимум 0.01 TON');

  // В проде вывод инициирует бэкенд/контракт (KYC/лимиты/риск)
  try {
    const resp = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, amountTON: val }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Ошибка вывода');
    alert('Заявка на вывод принята');
    closeWithdrawModal();
    setTimeout(() => updateBalanceByBackend(userAddress), 3000);
  } catch (e) {
    console.error('withdraw error', e);
    alert(e.message || 'Ошибка вывода');
  }
}
window.confirmWithdraw = confirmWithdraw;

// === Игры ===
let selectedChoice = null;

function selectChoice(choice) {
  selectedChoice = choice;
  document.querySelectorAll('.choice-btn').forEach(btn => btn.classList.remove('active-choice'));
  const btn = document.querySelector(`.choice-btn[data-choice="${choice}"]`);
  if (btn) btn.classList.add('active-choice');
}
window.selectChoice = selectChoice;

function openGame(game) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById('gameContainer').classList.add('active');

  const titles = {
    roulette: 'Рулетка',
    ninja: 'Ниндзя',
    tower: 'Башня',
    seven: 'Под 7 над',
    cs: 'CS',
    luck: 'Колесо удачи',
  };
  document.getElementById('gameTitle').textContent = titles[game] || 'Игра';

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
window.openGame = openGame;

function closeGame() {
  document.getElementById('gameContainer').classList.remove('active');
  showPage('games', document.querySelector('.bottom-nav .nav-item:nth-child(2)'));
}
window.closeGame = closeGame;

async function startGame() {
  const betInput = document.getElementById('betAmount');
  const resultEl = document.getElementById('gameResult');
  const betBtn = document.getElementById('betBtn');
  const bet = Number(betInput.value);

  if (!Number.isFinite(bet) || bet <= 0) return alert('Введите корректную ставку!');
  if (!selectedChoice) return alert('Сделайте выбор: <7, =7 или >7');

  betBtn.disabled = true;
  betBtn.textContent = 'Ожидание...';

  const diceArea = document.getElementById('diceArea');
  const countdown = document.getElementById('countdown');

  resultEl.textContent = '';
  diceArea.innerHTML = '';
  diceArea.style.display = 'none';

  countdown.style.display = 'block';
  let timer = 3;
  countdown.textContent = timer;
  const interval = setInterval(() => {
    timer--;
    if (timer > 0) {
      countdown.textContent = timer;
    } else {
      clearInterval(interval);
      countdown.style.display = 'none';

      // ⚠️ ДЕМО-режим: клиентский RNG
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      const sum = dice1 + dice2;

      diceArea.innerHTML = `<div class="dice">${dice1}</div><div class="dice">${dice2}</div>`;
      diceArea.style.display = 'flex';

      let win = false;
      if (selectedChoice === '<' && sum < 7) win = true;
      if (selectedChoice === '=' && sum === 7) win = true;
      if (selectedChoice === '>' && sum > 7) win = true;

      resultEl.style.color = win ? '#22c55e' : '#ef4444';
      resultEl.textContent = `Выпало ${sum}. ${win ? `Вы выиграли ${bet * 2}! 🎉` : 'Вы проиграли 😔'}`;

      // TODO: В проде тут делаем fetch('/api/games/seven', { initData, bet, choice })
      // и показываем результат, возвращённый сервером (provably fair),
      // плюс обновляем баланс после ответа.

      setTimeout(() => {
        betBtn.disabled = false;
        betBtn.textContent = 'Сделать ставку';
      }, 1200);
    }
  }, 1000);
}
window.startGame = startGame;

// === Обработчики submit для депозитов/вывода ===
document.addEventListener('DOMContentLoaded', () => {
  const depBtn = document.getElementById('depositSubmit');
  depBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    confirmDeposit();
  });

  const wdrBtn = document.getElementById('withdrawSubmit');
  wdrBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    confirmWithdraw();
  });
});
