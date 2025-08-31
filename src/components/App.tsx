import React, { useState } from "react";
import "./index.css";
import { showPage, openMenu, updateBalance, startGame } from "./utils/gameLogic";
import WalletButton from "./components/WalletButton";
import Balance from "./components/Balance";
import SendTx from "./components/SendTx";
import Sign from "./components/Sign";

export default function App() {
  const [balance, setBalance] = useState(100);

  return (
    <div>
      {/* === Меню === */}
      <div id="menu" className="menu">
        <a href="#" onClick={() => showPage("home")}>🏠 Главная</a>
        <a href="#" onClick={() => showPage("games")}>🎮 Игры</a>
        <a href="#" onClick={() => showPage("rating")}>⭐ Рейтинг</a>
      </div>

      {/* === Главная === */}
      <div id="home" className="page active">
        <h1>Добро пожаловать в WC Game!</h1>
        <WalletButton />
        <button onClick={openMenu}>Меню</button>
        <button onClick={() => updateBalance(setBalance)}>Баланс: {balance} WC</button>
      </div>

      {/* === Игры === */}
      <div id="games" className="page">
        <h1>Игры</h1>
        <button onClick={startGame}>🎲 Играть</button>
        <SendTx />
        <Sign />
      </div>

      {/* === Рейтинг === */}
      <div id="rating" className="page">
        <h1>Рейтинг игроков</h1>
        <Balance />
      </div>
    </div>
  );
}
