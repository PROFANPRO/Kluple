import React from "react";
import { connectWallet, disconnectWallet } from "../services/tonconnect";

export default function WalletButton() {
  return (
    <div>
      <button onClick={connectWallet}>Подключить кошелёк</button>
      <button onClick={disconnectWallet}>Отключить</button>
    </div>
  );
}
