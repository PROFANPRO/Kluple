import React, { useState } from "react";
import { signMessage } from "../services/tonconnect";

export default function Sign() {
  const [result, setResult] = useState<any>(null);

  const handleSign = async () => {
    const r = await signMessage();
    setResult(r);
  };

  return (
    <div>
      <button onClick={handleSign}>Подписать</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
