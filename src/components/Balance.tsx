import React, { useState } from "react";
import { getBalance } from "../services/tonconnect";

export default function Balance() {
  const [balance, setBalance] = useState<string | null>(null);

  const loadBalance = async () => {
    const b = await getBalance();
    setBalance(b);
  };

  return (
    <div>
      <button onClick={loadBalance}>Показать баланс</button>
      {balance && <p>Баланс: {balance}</p>}
    </div>
  );
}
