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
const balanceDisplay = document.getElementById('balanceDisplay');

let userAddress = null;
const initData = tg?.initData || ''; // Подписанная строка Telegram

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: `${location.origin}/tonconnect-manifest.json`,
  buttonRootId: 'walletBtn',
});

// === Баланс через backend (no-cache) ===
async function updateBalanceByBackend() {
  try {
    const resp = await fetch('/api/balance', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ initData })
    });

    const data = await resp.json();
    if (resp.ok && Number.isFinite(Number(data.balanceTON))) {
      balanceDisplay.textContent = `${Number(data.balanceTON).toFixed(4)} TON`;
    } else {
      console.error('Ошибка при получении баланса:', data?.error || data);
      balanceDisplay.textContent = '0 TON';
    }
  } catch (e) {
    console.error('Ошибка запроса баланса:', e);
    balanceDisplay.textContent = '0 TON';
  }
}

// Слушаем изменения статуса TonConnect
tonConnectUI.onStatusChange(async (wallet) => {
  if (wallet) {
    try {
      userAddress = wallet.account.address;
      // Привязка кошелька на бэке (через initData)
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
        userAddress = null;
        balanceDisplay.textContent = '0 TON';
        return;
      }
      // Обновляем баланс (теперь сервер самостоятельно найдёт userId по initData)
      updateBalanceByBackend();
      setTimeout(() => updateBalanceByBackend(), 1200);
    } catch (err) {
      console.error('onStatusChange error:', err);
    }
  } else {
    // Дисконнект: TonConnect UI сам покажет кнопку «Connect wallet»
    userAddress = null;
    balanceDisplay.textContent = '0 TON';
  }
});

// Восстанавливаем сессию при загрузке
window.addEventListener('load', async () => {
  try {
    await tonConnectUI.connectionRestored;
    if (tonConnectUI.account) {
      userAddress = tonConnectUI.account.address;
      updateBalanceByBackend();
      setTimeout(() => updateBalanceByBackend(), 1200);
    }
  } catch (e) {
    console.error('Restore connection error:', e);
  }
});

// === Страницы/модалки ===
function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (nav) nav.classList.add('active');
}
window.showPage = showPage;

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
    // 1) Получаем адрес кассы
    const cashierResp = await fetch('/api/get-cashier-address', { cache: 'no-store' });
    const cashierData = await cashierResp.json();
    if (!cashierResp.ok || !cashierData?.address) {
      alert(cashierData.error || 'Не удалось получить адрес кассы');
      return;
    }
    const cashierAddress = cashierData.address;

    // 2) Готовим транзакцию TonConnect
    const nanoAmount = toNano(val);
    if (!nanoAmount) return alert('Неверная сумма');

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: cashierAddress, amount: nanoAmount }],
    };

    // 3) Отправляем транзакцию
    const result = await tonConnectUI.sendTransaction(tx);
    console.log('TonConnect TX result:', result);
    closeDepositModal();

    // 4) Явно просим бэкенд проверить депозиты и зачислить (TonAPI → Supabase)
    try {
      await fetch('/api/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      });
    } catch (e) {
      console.warn('verify-deposit call failed', e);
    }

    // 5) Обновляем баланс несколько раз
    alert('Транзакция отправлена! Проверяем депозит...');
    updateBalanceByBackend();
    setTimeout(() => updateBalanceByBackend(), 2000);
    setTimeout(() => updateBalanceByBackend(), 7000);
    setTimeout(() => updateBalanceByBackend(), 12000);
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
    setTimeout(() => updateBalanceByBackend(), 3000);
  } catch (e) {
    console.error('withdraw error', e);
    alert(e.message || 'Ошибка вывода');
  }
}
window.confirmWithdraw = confirmWithdraw;

// === История пополнений и выводов ===
async function openHistory() {
  try {
    const resp = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      alert(data.error || 'Ошибка загрузки истории');
      return;
    }

    // Для простоты — пока покажем алертом
    const lines = data.history.map((h) => {
      if (h.type === 'deposit') {
        return `+${h.amountTON} TON (${new Date(h.date).toLocaleString()})`;
      } else {
        return `-${h.amountTON} TON (${h.status}) (${new Date(h.date).toLocaleString()})`;
      }
    });
    alert(lines.join('\n') || 'История пуста');
  } catch (e) {
    console.error('history error', e);
    alert('Ошибка при получении истории');
  }
}
window.openHistory = openHistory;

// === Игры (демо) ===
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

      // Используем игровую логику с хешированием
      const gameResult = playGame(selectedChoice, bet);
      resultEl.textContent = gameResult;

      setTimeout(() => {
        betBtn.disabled = false;
        betBtn.textContent = 'Сделать ставку';
      }, 1200);
    }
  }, 1000);
}
window.startGame = startGame;

// === Submit-обработчики ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('depositSubmit')?.addEventListener('click', (e) => {
    e.preventDefault();
    confirmDeposit();
  });

  document.getElementById('withdrawSubmit')?.addEventListener('click', (e) => {
    e.preventDefault();
    confirmWithdraw();
  });
});
