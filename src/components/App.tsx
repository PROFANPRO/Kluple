import React from "react";
import WalletButton from "./components/WalletButton";
import Balance from "./components/Balance";
import SendTx from "./components/SendTx";
import Sign from "./components/Sign";

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1>WC Game</h1>
      <WalletButton />
      <Balance />
      <SendTx />
      <Sign />
    </div>
  );
}
