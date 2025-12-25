# HiddenOutcome

HiddenOutcome is a fully on-chain adventure game built on Zama FHEVM. Player gold and health stay encrypted on-chain, while battles, rewards, and healing remain verifiable.

The core loop:
- Join once to receive 1000 encrypted coins and 10 health.
- Fight monsters with a 50/50 win rate.
- Win to earn 10-100 encrypted coins, lose to take 1 damage.
- Spend 10 encrypted coins to heal 1 health (up to 10).

## Project goals
- Demonstrate a complete FHE gameplay loop with encrypted state.
- Keep all gameplay logic on-chain with verifiable outcomes.
- Provide a reference frontend that can read, write, and decrypt FHE data.

## Problems solved
- Prevents public disclosure of player balances and health in an on-chain game.
- Reduces adversarial play based on visible stats (no on-chain scouting).
- Shows how to safely expose encrypted state to only the player.
- Keeps an audit trail of actions without revealing the numbers.

## Advantages
- Privacy by default: balances and health are encrypted using FHE.
- Simple economic model: fixed starting funds, bounded rewards, explicit heal cost.
- Minimal trust: no off-chain server, no mutable admin controls.
- Composable: clean contract API and tasks for scripting.
- Frontend and tasks demonstrate both decrypt paths (relayer and CLI).

## Gameplay rules
- Starting coins: 1000 (encrypted).
- Health: 10 max, cannot exceed 10 or drop below 0.
- Fight outcome: 50/50 per battle.
- Victory reward: random 10 to 100 coins (inclusive).
- Defeat penalty: -1 health.
- Heal: costs 10 coins, restores 1 health.
- Heal attempts are always counted even if you cannot heal.

## Smart contract
Contract: `HiddenOutcomeGame` (`contracts/HiddenOutcomeGame.sol`)

State model:
- `Player.balance`: encrypted euint32
- `Player.health`: encrypted euint8
- `Player.joined`: bool
- `Player.battles`, `Player.victories`, `Player.heals`: uint64 counters

Core functions:
- `joinGame()`: initializes encrypted balance and health, only once.
- `fightMonster()`: resolves a 50/50 outcome, updates balance/health, increments counters.
- `heal()`: attempts to heal, updates balance/health if eligible, increments heal counter.
- `getEncryptedBalance(address)`: returns encrypted balance handle.
- `getEncryptedHealth(address)`: returns encrypted health handle.
- `getPlayerStats(address)`: returns plaintext counters.
- `hasJoined(address)`: returns join status.

Events:
- `PlayerJoined`
- `MonsterFought` (contains victory flag and reward)
- `HealUsed` (total heals count)

Randomness:
- Derived from recent block data (blockhash, prevrandao, timestamp).
- Suitable for casual gameplay, not for high-stakes randomness.

FHE access control:
- The contract always calls `FHE.allowThis` and `FHE.allow` so the player can decrypt their own balance and health.
- Only encrypted handles are stored on chain; decryption happens client-side.

## Encryption and decryption flow
1. Contract writes encrypted values using `FHE.asEuint32` and `FHE.asEuint8`.
2. Reads return encrypted handles via `getEncryptedBalance` and `getEncryptedHealth`.
3. Decryption options:
   - Frontend: Zama relayer SDK uses an EIP-712 signature for user-authorized decryption.
   - CLI/tasks: Hardhat FHEVM plugin decrypts values for local testing.

## Frontend
Location: `home/`

Highlights:
- React + Vite UI with RainbowKit wallet connection.
- Reads use viem (`useReadContract`); writes use ethers `Contract`.
- Zama relayer decrypts balances/health in-browser.
- Sepolia-only network; no localhost usage and no local storage.

Required setup:
1. Deploy the contract on Sepolia.
2. Copy the ABI from `deployments/sepolia/HiddenOutcomeGame.json` into `home/src/config/contracts.ts`.
3. Replace `CONTRACT_ADDRESS` in `home/src/config/contracts.ts` with the deployed address.
4. Run the frontend:

```
cd home
npm install
npm run dev
```

## Tech stack
Smart contracts:
- Solidity 0.8.x
- Zama FHEVM (`@fhevm/solidity`, `@fhevm/hardhat-plugin`)
- Hardhat + hardhat-deploy + TypeChain

Frontend:
- React + Vite
- wagmi + RainbowKit
- viem (reads) + ethers (writes)
- Zama relayer SDK (`@zama-fhe/relayer-sdk`)

Testing and tooling:
- Chai + Hardhat Ethers
- FHEVM mock for local tests
- TypeScript

## Repository layout
```
contracts/          HiddenOutcomeGame contract
deploy/             Hardhat deploy scripts
deployments/        Deployed artifacts and ABIs
docs/               Zama FHEVM and relayer notes
home/               React frontend (Vite)
tasks/              Hardhat tasks for gameplay and decrypt
test/               Contract tests
```

## Setup and usage
### Requirements
- Node.js 20+
- npm
- A Sepolia RPC key and a funded Sepolia account (for deployment)

### Install root dependencies
```
npm install
```

### Compile
```
npm run compile
```

### Test (local FHEVM mock)
```
npm run test
```

### Local development deployment
Start a local node (optional) and deploy:
```
npx hardhat node
npx hardhat deploy --network anvil
```

### Sepolia deployment
1. Create a `.env` file in the repo root with:
   - `INFURA_API_KEY`
   - `PRIVATE_KEY`
   - optional: `ETHERSCAN_API_KEY`, `REPORT_GAS`
2. Deploy:
```
npx hardhat deploy --network sepolia
```

### Useful Hardhat tasks
```
npx hardhat task:address --network sepolia
npx hardhat task:join-game --network sepolia --address <contract>
npx hardhat task:fight-monster --network sepolia --address <contract>
npx hardhat task:heal --network sepolia --address <contract>
npx hardhat task:decrypt-player --network sepolia --address <contract> --player <address>
```

## Documentation
- Zama contract notes: `docs/zama_llm.md`
- Zama relayer notes: `docs/zama_doc_relayer.md`

## Design decisions
- Encrypted state for balance and health prevents public strategy leakage.
- Plaintext counters keep UX responsive without decryption for every stat.
- Simple rules make FHE behavior easy to verify.

## Limitations
- Randomness is pseudo-random and not suitable for high-value games.
- No token transfers or marketplace integration by design.
- Contract stores only player-specific state; there is no global leaderboard.

## Future roadmap
- Replace block-based randomness with a verifiable randomness source.
- Add item drops and encrypted inventory slots.
- Introduce season resets and opt-in leaderboards with selective disclosure.
- Expand monsters and difficulty tiers with encrypted modifiers.
- Add gas-optimized batch actions for power users.
- Improve frontend UX around decryption latency and error handling.

## License
BSD-3-Clause-Clear. See `LICENSE`.
