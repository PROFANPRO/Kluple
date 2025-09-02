// === Telegram WebApp ===
const tg = window.Telegram?.WebApp;
tg?.expand();

const userPhoto = document.getElementById('userPhoto');
const user = tg?.initDataUnsafe?.user;
if (user?.photo_url) userPhoto.src = user.photo_url;
userPhoto.addEventListener('click', () => { if (user?.username) window.open('https://t.me/' + user.username, '_blank'); });

// === TonConnect SDK ===
const walletBtn = document.getElementById('walletBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

// Инициализация коннектора
const userWallets = {}; // Храним коннекторы для каждого пользователя

// Отслеживание статуса подключения
const handleStatusChange = (wallet, userId) => {
  if (wallet) {
    let friendly;
    try { friendly = TonConnectSDK.toUserFriendlyAddress(wallet.account.address); } 
    catch { friendly = wallet.account.address; }
    setWalletUi(friendly);
    updateBalanceByPublicAPIs(friendly);
    closeWalletModal();
  } else {
    walletBtn.textContent = 'Подключить кошелёк';
    balanceDisplay.textContent = '0 TON';
  }
};

connector.onStatusChange((wallet) => handleStatusChange(wallet, user?.id || 'default'));

// Восстановление сессии
window.addEventListener('load', async () => {
  try {
    const userId = user?.id || 'default'; // Используем ID пользователя как уникальный ключ
    if (!userWallets[userId]) {
      userWallets[userId] = new TonConnectSDK.TonConnect({
        manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json'
      });
    }
    await userWallets[userId].restoreConnection();
  } catch(e) {
    console.warn('restoreConnection error:', e);
  }
});

// Подключение кошелька
walletBtn.onclick = async () => {
  const userId = user?.id || 'default'; // Уникальный идентификатор пользователя
  const userConnector = userWallets[userId]; // Используем коннектор для конкретного пользователя

  if (userConnector.connected && userConnector.wallet?.account?.address) return;
  openWalletModal();
  await renderWalletList(userId); // Передаем ID пользователя для рендеринга
};

function setWalletUi(friendlyAddress) {
  const short = friendlyAddress.length > 12 ? friendlyAddress.slice(0, 6) + '…' + friendlyAddress.slice(-4) : friendlyAddress;
  walletBtn.textContent = short;
}

async function renderWalletList(userId) {
  const listEl = document.getElementById('walletList');
  listEl.innerHTML = '<div style="opacity:.7;">Загрузка списка кошельков…</div>';
  let wallets = [];
  try {
    wallets = await userWallets[userId].getWallets(); // Получаем кошельки для конкретного пользователя
  } catch(e) {
    console.error(e);
  }
  if (!wallets.length) {
    listEl.innerHTML = '<div style="opacity:.8;">Кошельки не найдены.</div>';
    return;
  }
  listEl.innerHTML = '';
  wallets.forEach((w) => {
    const item = document.createElement('div');
    item.className = 'wallet-item';
    const icon = w.imageUrl ? `<img src="${w.imageUrl}" alt="${w.name}">` : '<div style="width:28px;height:28px;border-radius:6px;background:#334155"></div>';
    item.innerHTML = `${icon}<div style="display:flex;flex-direction:column;gap:2px"><div style="font-weight:600">${w.name}</div>${w.tondns ? `<div style="opacity:.7;font-size:12px">${w.tondns}</div>` : ''}</div>`;
    item.onclick = () => connectByWalletInfo(w, userId);
    listEl.appendChild(item);
  });
}

function connectByWalletInfo(w, userId) {
  try {
    const userConnector = userWallets[userId];
    if (TonConnectSDK.isWalletInfoCurrentlyEmbedded?.(w) || TonConnectSDK.isWalletInfoCurrentlyInjected?.(w)) {
      userConnector.connect({ jsBridgeKey: w.jsBridgeKey });
      return;
    }
    if (TonConnectSDK.isWalletInfoRemote?.(w)) {
      const link = userConnector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl });
      if (link) { 
        if (tg?.openLink) tg.openLink(link); 
        else window.open(link, '_blank', 'noopener'); 
      }
      return;
    }
  } catch(e) {
    console.error(e);
  }
}

async function updateBalanceByPublicAPIs(friendlyAddress) {
  try {
    const r = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(friendlyAddress)}`);
    if (r.ok) {
      const j = await r.json();
      const nano = j?.balance ?? j?.account?.balance;
      if (nano !== undefined) {
        balanceDisplay.textContent = (Number(nano) / 1e9).toFixed(4) + ' TON';
        return;
      }
    }
  } catch (err) {}
  try {
    const r2 = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(friendlyAddress)}`);
    if (r2.ok) {
      const j2 = await r2.json();
      const nano2 = j2?.result ?? j2?.balance;
      if (nano2 !== undefined) {
        balanceDisplay.textContent = (Number(nano2) / 1e9).toFixed(4) + ' TON';
        return;
      }
    }
  } catch (err) {}
}

// ===== Navigation / modals =====
function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if(nav) nav.classList.add('active');
}

// Остальной код остается без изменений...
