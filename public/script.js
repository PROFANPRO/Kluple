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
        if (!resp.ok || data.error) {
          alert(data.error || 'Кошелёк уже привязан к другому аккаунту!');
          await connector.disconnect();
          return;
        }
      } catch (err) {
        console.error('Ошибка связывания кошелька:', err);
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

function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (nav) nav.classList.add('active');
}

// === ИГРЫ ===
let selectedChoice = null;

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

  // Показ UI только для "Под 7 над"
  document.querySelector('.choice-buttons').style.display = (game === "seven") ? "flex" : "none";
  document.getElementById('diceArea').style.display = (game === "seven") ? "flex" : "none";
  document.getElementById('countdown').style.display = (game === "seven") ? "block" : "none";

  document.getElementById('betAmount').value = '';
  document.getElementById('gameResult').textContent = '';
  selectedChoice = null;
  document.querySelectorAll('.choice-btn').forEach(btn => btn.classList.remove('active-choice'));
}

function closeGame() {
  document.getElementById('gameContainer').classList.remove('active');
  showPage('games', document.querySelector('.bottom-nav .nav-item:nth-child(2)'));
}

function selectChoice(choice) {
  selectedChoice = choice;
  document.querySelectorAll('.choice-btn').forEach(btn => btn.classList.remove('active-choice'));
  document.getElementById(`choice-${choice}`).classList.add('active-choice');
}

function startGame() {
  const betInput = document.getElementById('betAmount');
  const resultEl = document.getElementById('gameResult');
  const bet = Number(betInput.value);

  if (!bet || bet <= 0) return alert('Введите корректную ставку!');
  if (!selectedChoice) return alert('Выберите <7, =7 или >7!');

  let countdown = 5;
  const countdownEl = document.getElementById('countdown');
  countdownEl.textContent = `Бросок через ${countdown}...`;
  
  const interval = setInterval(() => {
    countdown--;
    countdownEl.textContent = `Бросок через ${countdown}...`;
    if (countdown === 0) {
      clearInterval(interval);
      rollDiceAndShowResult(bet, resultEl);
    }
  }, 1000);
}

function rollDiceAndShowResult(bet, resultEl) {
  const die1 = Math.ceil(Math.random() * 6);
  const die2 = Math.ceil(Math.random() * 6);
  const sum = die1 + die2;

  const diceArea = document.getElementById('diceArea');
  diceArea.innerHTML = `
    <div class="dice">🎲 ${die1}</div>
    <div class="dice">🎲 ${die2}</div>
    <div class="dice-sum">Сумма: ${sum}</div>
  `;

  let win = false;
  if (selectedChoice === "lt7" && sum < 7) win = true;
  if (selectedChoice === "eq7" && sum === 7) win = true;
  if (selectedChoice === "gt7" && sum > 7) win = true;

  resultEl.style.color = win ? '#22c55e' : '#ef4444';
  resultEl.textContent = win ? `Вы выиграли ${bet * 2}!` : 'Вы проиграли 😔';
}

document.addEventListener('DOMContentLoaded', () => {
  showPage('home', document.querySelector('.bottom-nav .nav-item:first-child'));
});
