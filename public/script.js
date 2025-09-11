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
const balanceDisplay = document.getElementById('balanceDisplay');

const connector = new TonConnectSDK.TonConnect({
  manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json'
});

// Обновляем баланс с бэкенда
async function updateBalanceByBackend(friendlyAddress) {
  try {
    const resp = await fetch(`/api/balance?userAddress=${friendlyAddress}`);
    const data = await resp.json();

    if (resp.ok) {
      balanceDisplay.textContent = data.balanceTON.toFixed(4) + " TON";
    } else {
      console.error("Ошибка при получении баланса:", data.error);
      balanceDisplay.textContent = "0 TON";
    }
  } catch (e) {
    console.error("Ошибка запроса баланса:", e);
    balanceDisplay.textContent = "0 TON";
  }
}

connector.onStatusChange((wallet) => {
  if (wallet) {
    let friendly;
    try { 
      friendly = TonConnectSDK.toUserFriendlyAddress(wallet.account.address); 
    } catch { 
      friendly = wallet.account.address; 
    }
    setWalletUi(friendly);
    updateBalanceByBackend(friendly);
    closeWalletModal();
  } else {
    walletBtn.textContent = 'Подключить кошелёк';
    balanceDisplay.textContent = '0 TON';
  }
});

window.addEventListener('load', async () => {
  try { await connector.restoreConnection(); } catch(e){ console.warn('restoreConnection error:', e); }
});

walletBtn.onclick = async () => {
  if (connector.connected && connector.wallet?.account?.address) return;
  openWalletModal();
  await renderWalletList();
};

function setWalletUi(friendlyAddress){
  const short = friendlyAddress.length > 12 
    ? friendlyAddress.slice(0, 6) + '…' + friendlyAddress.slice(-4) 
    : friendlyAddress;
  walletBtn.textContent = short;
}

async function renderWalletList(){
  const listEl = document.getElementById('walletList');
  listEl.innerHTML = '<div style="opacity:.7;">Загрузка списка кошельков…</div>';
  let wallets = [];
  try { wallets = await connector.getWallets(); } catch(e){ console.error(e); }
  if (!wallets.length){ 
    listEl.innerHTML = '<div style="opacity:.8;">Кошельки не найдены.</div>'; 
    return; 
  }
  listEl.innerHTML = '';
  wallets.forEach((w) => {
    const item = document.createElement('div');
    item.className = 'wallet-item';
    const icon = w.imageUrl 
      ? `<img src="${w.imageUrl}" alt="${w.name}">` 
      : '<div style="width:28px;height:28px;border-radius:6px;background:#334155"></div>';
    item.innerHTML = `${icon}<div style="display:flex;flex-direction:column;gap:2px">
      <div style="font-weight:600">${w.name}</div>
      ${w.tondns ? `<div style="opacity:.7;font-size:12px">${w.tondns}</div>` : ''}
    </div>`;
    item.onclick = () => connectByWalletInfo(w);
    listEl.appendChild(item);
  });
}

function connectByWalletInfo(w){
  try {
    if (TonConnectSDK.isWalletInfoCurrentlyEmbedded?.(w) || TonConnectSDK.isWalletInfoCurrentlyInjected?.(w)) {
      connector.connect({ jsBridgeKey: w.jsBridgeKey });
      return;
    }
    if (TonConnectSDK.isWalletInfoRemote?.(w)) {
      const link = connector.connect({ universalLink: w.universalLink, bridgeUrl: w.bridgeUrl });
      if (link) { 
        if (tg?.openLink) tg.openLink(link); 
        else window.open(link, '_blank','noopener'); 
      }
      return;
    }
  } catch(e){ console.error(e); }
}

// === Navigation / modals ===
function showPage(id, nav) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (nav) nav.classList.add('active');
}

function openGame(name){ 
  const pageId='game-'+name; 
  const page=document.getElementById(pageId); 
  if(page){ 
    showPage(pageId,null); 
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); 
  } 
}
function showRanking(list, btn){ 
  document.querySelectorAll('.rank-list').forEach(l=>l.style.display='none'); 
  document.getElementById(list).style.display='block'; 
  btn.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('active')); 
  btn.classList.add('active'); 
}

function openPromoModal(){ document.getElementById('promoModal').style.display='flex'; }
function closePromoModal(){ document.getElementById('promoModal').style.display='none'; }
function openMenu(){ document.getElementById('menuModal').style.display='flex'; }
function closeMenu(){ document.getElementById('menuModal').style.display='none'; }
function openWalletModal(){ document.getElementById('walletModal').style.display='flex'; }
function closeWalletModal(){ document.getElementById('walletModal').style.display='none'; }

function openDepositModal(){ document.getElementById('depositModal').style.display='flex'; }
function closeDepositModal(){ document.getElementById('depositModal').style.display='none'; }
function openWithdrawModal(){ document.getElementById('withdrawModal').style.display='flex'; }
function closeWithdrawModal(){ document.getElementById('withdrawModal').style.display='none'; }

// === API calls for deposit/withdraw ===
async function confirmDeposit(){
    const val = document.getElementById('depositAmount').value;
    if(!val || isNaN(val) || Number(val) <= 0){
        alert('Введите корректную сумму');
        return;
    }

    try {
        const cashierResp = await fetch('/api/get-cashier-address');
        const cashierData = await cashierResp.json();
        if (!cashierResp.ok) {
            alert(cashierData.error || 'Не удалось получить адрес кассы');
            return;
        }

        const cashierAddress = cashierData.address;
        const nanoAmount = Math.floor(Number(val) * 1e9);

        await connector.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 300,
            messages: [{ address: cashierAddress, amount: nanoAmount.toString() }]
        });

        alert('Транзакция отправлена! Проверяем депозит...');
        setTimeout(async () => {
            const friendlyAddress = connector.wallet?.account?.address;
            if (!friendlyAddress) return;

            try {
                const verifyResp = await fetch(`/api/verify-deposit?userAddress=${friendlyAddress}`);
                const verifyData = await verifyResp.json();

                if (verifyResp.ok) {
                    balanceDisplay.textContent = `${verifyData.totalDepositedTON.toFixed(4)} TON`;
                    alert(`Зачислено: ${verifyData.totalDepositedTON.toFixed(4)} TON`);
                } else {
                    alert(verifyData.error || 'Не удалось проверить депозит');
                }
            } catch (err) {
                console.error('Ошибка проверки депозита:', err);
                alert('Ошибка проверки депозита');
            }
        }, 7000);

    } catch(err){
        console.error(err);
        alert('Ошибка при отправке транзакции');
    }

    closeDepositModal();
}

async function confirmWithdraw(){
    alert('Вывод реализуется на сервере (не забудь дописать логику вывода TON)');
    closeWithdrawModal();
}

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
    showPage('home', document.querySelector('.bottom-nav .nav-item:first-child'));
});
