import React from "react";
import { sendTransaction } from "../services/tonconnect";

export default function SendTx() {
  return <button onClick={sendTransaction}>Отправить транзакцию</button>;
}
