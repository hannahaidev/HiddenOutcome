import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract } from 'ethers';
import { GameHeader } from './GameHeader';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/GameApp.css';

type DecryptedState = {
  balance: number | null;
  health: number | null;
};

export function GameApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const [statusNote, setStatusNote] = useState<string>('');
  const [isActing, setIsActing] = useState<boolean>(false);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [decrypted, setDecrypted] = useState<DecryptedState>({ balance: null, health: null });

  const {
    data: joinedData,
    refetch: refetchJoined,
    isFetching: joinedLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasJoined',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const {
    data: encryptedBalance,
    refetch: refetchBalance,
    isFetching: balanceLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedBalance',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && joinedData) },
  });

  const {
    data: encryptedHealth,
    refetch: refetchHealth,
    isFetching: healthLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedHealth',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && joinedData) },
  });

  const {
    data: statsData,
    refetch: refetchStats,
    isFetching: statsLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && joinedData) },
  });

  const stats = useMemo(() => {
    const typed = statsData as readonly [bigint, bigint, bigint] | undefined;
    return {
      battles: Number(typed?.[0] ?? 0n),
      victories: Number(typed?.[1] ?? 0n),
      heals: Number(typed?.[2] ?? 0n),
    };
  }, [statsData]);

  const hasJoined = Boolean(joinedData);

  const refreshPlayer = async () => {
    await Promise.all([refetchJoined?.(), refetchBalance?.(), refetchHealth?.(), refetchStats?.()]);
  };

  const parseReceipt = (receipt: any, contract: Contract) => {
    let message = '';
    for (const log of receipt?.logs || []) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'MonsterFought') {
          message = parsed.args.victory
            ? `Victory! Looted ${parsed.args.reward} coins.`
            : 'Defeat. You took 1 damage.';
        }
        if (parsed?.name === 'HealUsed') {
          message = `Heal attempt recorded (${parsed.args.totalHeals.toString()})`;
        }
      } catch {
        continue;
      }
    }
    if (message) {
      setStatusNote(message);
    }
  };

  const decryptState = async () => {
    if (!instance || !address || !encryptedBalance || !encryptedHealth || !signerPromise) {
      setStatusNote('Connect wallet and load player state before decrypting.');
      return;
    }

    setIsDecrypting(true);
    try {
      const signer = await signerPromise;
      const balanceHandle = encryptedBalance as string;
      const healthHandle = encryptedHealth as string;

      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [
          { handle: balanceHandle, contractAddress: CONTRACT_ADDRESS },
          { handle: healthHandle, contractAddress: CONTRACT_ADDRESS },
        ],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      setDecrypted({
        balance: Number(result[balanceHandle] || 0),
        health: Number(result[healthHandle] || 0),
      });
      setStatusNote('Decryption complete.');
    } catch (error) {
      console.error('decrypt error', error);
      setStatusNote('Failed to decrypt. Please try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleJoin = async () => {
    if (!signerPromise) {
      setStatusNote('Connect your wallet to join.');
      return;
    }
    setIsActing(true);
    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.joinGame();
      setStatusNote('Joining the hunt...');
      const receipt = await tx.wait();
      parseReceipt(receipt, contract);
      await refreshPlayer();
      setStatusNote('Joined with 1000 encrypted coins and full health.');
      setDecrypted({ balance: null, health: null });
    } catch (error) {
      console.error('join error', error);
      setStatusNote('Join failed. Please retry.');
    } finally {
      setIsActing(false);
    }
  };

  const handleFight = async () => {
    if (!signerPromise) {
      setStatusNote('Connect your wallet to fight.');
      return;
    }
    setIsActing(true);
    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.fightMonster();
      setStatusNote('Battling monster...');
      const receipt = await tx.wait();
      parseReceipt(receipt, contract);
      await refreshPlayer();
      await decryptState();
    } catch (error) {
      console.error('fight error', error);
      setStatusNote('Battle failed. Try again.');
    } finally {
      setIsActing(false);
    }
  };

  const handleHeal = async () => {
    if (!signerPromise) {
      setStatusNote('Connect your wallet to heal.');
      return;
    }
    setIsActing(true);
    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.heal();
      setStatusNote('Healing...');
      const receipt = await tx.wait();
      parseReceipt(receipt, contract);
      await refreshPlayer();
      await decryptState();
    } catch (error) {
      console.error('heal error', error);
      setStatusNote('Heal failed. Check your balance or health.');
    } finally {
      setIsActing(false);
    }
  };

  useEffect(() => {
    if (hasJoined && encryptedBalance && encryptedHealth && instance && !isDecrypting) {
      decryptState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJoined, encryptedBalance, encryptedHealth, instance]);

  const loadingPlayer = joinedLoading || balanceLoading || healthLoading || statsLoading;

  return (
    <div className="game-shell">
      <GameHeader />
      <div className="game-hero">
        <div>
          <p className="eyebrow">FHE-powered dungeon</p>
          <h2 className="hero-title">Hunt monsters, hoard encrypted gold.</h2>
          <p className="hero-subtitle">
            Every reward and wound is hidden with Zama FHE. Join the raid, flip the 50/50, and patch yourself up with 10 coins per heal.
          </p>
          <div className="status-note">{statusNote || 'Stay sharp—outcomes are hidden until you decrypt.'}</div>
        </div>
        <div className="glass-card spotlight">
          <div className="card-head">
            <div>
              <p className="eyebrow">Player status</p>
              <h3>Encrypted profile</h3>
            </div>
            <button
              className="ghost-button"
              onClick={decryptState}
              disabled={!hasJoined || isDecrypting || zamaLoading || loadingPlayer || !isConnected}
            >
              {isDecrypting ? 'Decrypting...' : 'Decrypt'}
            </button>
          </div>
          <div className="stat-grid">
            <div className="stat-tile">
              <p className="label">Gold</p>
              <p className="value">
                {decrypted.balance !== null ? `${decrypted.balance} coins` : 'Encrypted'}
              </p>
            </div>
            <div className="stat-tile">
              <p className="label">Health</p>
              <p className="value">
                {decrypted.health !== null ? `${decrypted.health} / 10` : 'Encrypted'}
              </p>
            </div>
            <div className="stat-tile muted">
              <p className="label">Battles</p>
              <p className="value">{stats.battles}</p>
            </div>
            <div className="stat-tile muted">
              <p className="label">Victories</p>
              <p className="value">{stats.victories}</p>
            </div>
            <div className="stat-tile muted">
              <p className="label">Heals</p>
              <p className="value">{stats.heals}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="action-row">
        <div className="glass-card action-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Game flow</p>
              <h3>Make your move</h3>
            </div>
            <span className="badge">{hasJoined ? 'Ready' : 'Not joined'}</span>
          </div>
          <div className="action-buttons">
            <button
              className="action-button primary"
              onClick={handleJoin}
              disabled={!isConnected || hasJoined || isActing}
            >
              {hasJoined ? 'Joined' : isActing ? 'Joining...' : 'Join +1000 coins'}
            </button>
            <button
              className="action-button"
              onClick={handleFight}
              disabled={!hasJoined || isActing}
            >
              {isActing ? 'Battling...' : 'Fight monster (50/50)'}
            </button>
            <button
              className="action-button ghost"
              onClick={handleHeal}
              disabled={!hasJoined || isActing}
            >
              {isActing ? 'Healing...' : 'Heal (-10 coins)'}
            </button>
          </div>
          <p className="hint">
            Win: +10 to 100 encrypted coins. Lose: -1 health. Heal costs 10 encrypted coins and restores 1 health.
          </p>
        </div>

        <div className="glass-card checklist">
          <p className="eyebrow">How it works</p>
          <ul>
            <li>Gold and health stay encrypted on-chain with Zama FHE.</li>
            <li>Reads use viem; transactions run through ethers + RainbowKit.</li>
            <li>Use the decrypt button after any action to reveal your stats.</li>
            <li>No local storage, no localhost networks, Sepolia only.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
