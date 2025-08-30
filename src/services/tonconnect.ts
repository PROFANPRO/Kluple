import { TonConnectUI } from "@tonconnect/ui-react";

export const connector = new TonConnectUI({
  manifestUrl: "/tonconnect-manifest.json"
});

// Подключение
export const connectWallet = async () => {
  await connector.openModal();
};

// Отключение
export const disconnectWallet = async () => {
  connector.disconnect();
};

// Получение баланса
export const getBalance = async () => {
  const account = connector.account;
  if (!account) return null;

  // тут нужно использовать TonWeb или TonCenter API
  // для примера вернём адрес
  return account.address;
};

// Отправка транзакции
export const sendTransaction = async () => {
  if (!connector.account) return;

  await connector.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 60,
    messages: [
      {
        address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
        amount: "1000000" // 0.001 TON
      }
    ]
  });
};

// Подпись
export const signMessage = async () => {
  if (!connector.account) return;

  const result = await connector.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 60,
    messages: []
  });

  return result;
};
