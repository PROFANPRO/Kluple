// Connect Button
const connectBtn = document.getElementById('walletBtn');
const balanceDisplay = document.getElementById('balanceDisplay');

// Global variable to store the connector
let connector = null;

// Initialize the TonConnect SDK
const initializeTonConnect = () => {
  connector = new TonConnectSDK.TonConnect({
    manifestUrl: 'https://raw.githubusercontent.com/PROFANPRO/Kluple/main/public/tonconnect-manifest.json',
  });

  // Set up status change listener
  connector.onStatusChange = (wallet) => handleStatusChange(wallet);

  // Restore session if any
  connector.restoreConnection();
};

// Handle wallet connection status changes
const handleStatusChange = (wallet) => {
  if (wallet) {
    const friendlyAddress = wallet.account.address;
    balanceDisplay.textContent = 'Address: ' + friendlyAddress;
    updateBalance(friendlyAddress);
    connectBtn.textContent = 'Disconnect Wallet';
  } else {
    balanceDisplay.textContent = '0 TON';
    connectBtn.textContent = 'Connect Wallet';
  }
};

// Update wallet balance using public APIs
const updateBalance = async (address) => {
  try {
    const response = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}`);
    if (response.ok) {
      const data = await response.json();
      const balance = data.balance || 0;
      balanceDisplay.textContent = `Balance: ${(balance / 1e9).toFixed(4)} TON`;
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
  }
};

// Handle connect and disconnect button actions
connectBtn.onclick = () => {
  if (connector && connector.connected) {
    connector.disconnect();
    connectBtn.textContent = 'Connect Wallet';
  } else {
    connector.connect();
    connectBtn.textContent = 'Disconnect Wallet';
  }
};

// Initialize the app when the window is loaded
window.addEventListener('load', () => {
  initializeTonConnect();
});
