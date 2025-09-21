// === Telegram WebApp ===
const tg = window.Telegram?.WebApp;
tg?.expand();

const userPhoto = document.getElementById('userPhoto');
const user = tg?.initDataUnsafe?.user;
if (user?.photo_url) userPhoto.src = user.photo_url;
userPhoto.addEventListener('click', () => {
if (user?.username) window.open('https://t.me/' + user.username, '_blank');
});

// === TonConnect SDK ===
const walletBtn = document.getElementById('walletBtn');
const walletIcon = document.getElementById('walletIcon');
const walletDropdown = document.getElementById('walletDropdown');
const disconnectBtn = document.getElementById('disconnectBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

let userAddress = null;
let userId = tg?.initDataUnsafe?.user?.id || null;

const connector = new TonConnectSDK.TonConnect({
manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json'
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

connector.onStatusChange(async (wallet) => {
if (wallet) {
try {
// Приводим адрес к user-friendly формату
try {
userAddress = TonConnectSDK.toUserFriendlyAddress(wallet.account.address);
} catch {
userAddress = wallet.account.address;
}

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
await connector.disconnect();
return;
}

if (data.error) {
console.warn('[link-wallet] Сервер вернул ошибку:', data.error);
alert(data.error);
await connector.disconnect();
return;
}

console.log('[link-wallet] Кошелёк успешно привязан или уже был привязан:', data.wallet);
} catch (err) {
console.error('Ошибка связывания кошелька:', err);
alert('Не удалось привязать кошелёк');
await connector.disconnect();
return;
}
}

// Если дошли сюда — всё ок, показываем UI
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

window.addEventListener('load', async () => {
try {
const restored = await connector.restoreConnection();
if (connector.connected && connector.wallet?.account?.address) {
const restoredAddr = TonConnectSDK.toUserFriendlyAddress(connector.wallet.account.address);
userAddress = restoredAddr;
setWalletUi(userAddress);
updateBalanceByBackend(userAddress);
walletIcon.style.display = "inline-block";
}
} catch (e) {
console.warn('restoreConnection error:', e);
}
});

walletBtn.onclick = async () => {
if (connector.connected && connector.wallet?.account?.address) return;
openWalletModal();
await renderWalletList();
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

await connector.disconnect();
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
const short = friendlyAddress.length > 12
? friendlyAddress.slice(0, 6) + '…' + friendlyAddress.slice(-4)
: friendlyAddress;
walletBtn.textContent = short;
}

async function renderWalletList() {
const listEl = document.getElementById('walletList');
listEl.innerHTML = '<div style="opacity:.7;">Загрузка списка кошельков…</div>';
let wallets = [];
try { wallets = await connector.getWallets(); } catch (e) { console.error(e); }
if (!wallets.length) { listEl.innerHTML = '<div style="opacity:.8;">Кошельки не найдены.</div>'; return; }
listEl.innerHTML = '';
wallets.forEach((w) => {
const item = document.createElement('div');
item.className = 'wallet-item';
const icon = w.imageUrl ? `<img src="${w.imageUrl}" alt="${w.name}">` : '<div style="width:28px;height:28px;border-radius:6px;background:#334155"></div>';
item.innerHTML = `${icon}
     <div style="display:flex;flex-direction:column;gap:2px">
       <div style="font-weight:600">${w.name}</div>
       ${w.tondns ? `<div style="opacity:.7;font-size:12px">${w.tondns}</div>` : ''}
     </div>`;
item.onclick = () => connectByWalletInfo(w);
listEl.appendChild(item);
});
}

function connectByWalletInfo(w) {
try {
if (TonConnectSDK.isWalletInfoCurrentlyEmbedded?.(w) || TonConnectSDK.isWalletInfoCurrentlyInjected?.(w)) {
connector.connect({ jsBridgeKey: w.jsBridgeKey });
return;
}
if (TonConnectSDK.isWalletInfoRemote?.(w)) {
const link = connector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl });
if (link) {
if (tg?.openLink) tg.openLink(link);
else window.open(link, '_blank', 'noopener');
}
return;
}
} catch (e) { console.error(e); }
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

// === Депозит и вывод ===
async function confirmDeposit() {
console.log("confirmDeposit called");
const val = document.getElementById('depositAmount').value;
if (!val || isNaN(val) || Number(val) <= 0) {
alert('Введите корректную сумму');
return;
}
if (!userAddress || !connector.connected) {
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
const result = await connector.sendTransaction(tx);
console.log('TonConnect TX result:', result);

    // === Пытаемся сразу открыть кошелёк ===
if (result?.universalLink) {
      console.log("Открываю ссылку на кошелёк:", result.universalLink);
      if (tg?.openLink) tg.openLink(result.universalLink, { try_instant_view: false });
      else window.open(result.universalLink, '_blank', 'noopener');
      try {
        // Пытаемся открыть через Telegram WebApp
        if (tg?.openLink) {
          tg.openLink(result.universalLink, { try_instant_view: false });
          console.log("Ссылка открыта через tg.openLink");
        } else {
          // Если не Telegram — откроем в новом окне
          window.open(result.universalLink, '_blank', 'noopener');
        }
      } catch (err) {
        console.warn("tg.openLink не сработал, пробуем обычный переход...");
        window.location.href = result.universalLink;
      }
} else {
      alert("Транзакция создана. Откройте свой кошелёк вручную и подтвердите перевод.");
      // Если universalLink не вернулся — даём пользователю ссылку вручную
      alert(`Откройте кошелёк вручную и подтвердите перевод:\n${cashierAddress}`);
}

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
console.log("depositSubmit clicked");
confirmDeposit();
});

const wdrBtn = document.getElementById('withdrawSubmit');
if (wdrBtn) wdrBtn.addEventListener('click', (e) => {
e.preventDefault();
confirmWithdraw();
});
});
