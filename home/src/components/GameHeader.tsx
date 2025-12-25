import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/GameApp.css';

export function GameHeader() {
  return (
    <header className="game-header">
      <div className="brand">
        <div className="brand-mark">◎</div>
        <div>
          <p className="eyebrow">Hidden Outcome</p>
          <h1 className="title">Encrypted Hunt</h1>
        </div>
      </div>
      <ConnectButton />
    </header>
  );
}
