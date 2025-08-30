import React from "react";
import WalletButton from "./WalletButton";
import Balance from "./Balance";
import SendTx from "./SendTx";
import Sign from "./Sign";

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
