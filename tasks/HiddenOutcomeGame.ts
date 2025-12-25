import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the HiddenOutcomeGame address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const game = await deployments.get("HiddenOutcomeGame");
  console.log("HiddenOutcomeGame address is " + game.address);
});

task("task:join-game", "Join the encrypted adventure")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("HiddenOutcomeGame");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("HiddenOutcomeGame", deployment.address);

    const tx = await contract.connect(signer).joinGame();
    console.log(`Joining game... tx:${tx.hash}`);
    await tx.wait();
    console.log("Joined! Refresh stats with task:decrypt-player.");
  });

task("task:fight-monster", "Fight a monster (50/50 win)")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("HiddenOutcomeGame");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("HiddenOutcomeGame", deployment.address);

    const tx = await contract.connect(signer).fightMonster();
    console.log(`Battling... tx:${tx.hash}`);
    const receipt = await tx.wait();

    const event = receipt?.logs
      .map((log) => contract.interface.parseLog(log))
      .find((parsed) => parsed && parsed.name === "MonsterFought");
    if (event) {
      console.log(`Outcome: ${event.args.victory ? "victory" : "defeat"}, reward: ${event.args.reward}`);
    }
    console.log("Battle finished. Run task:decrypt-player to see updated stats.");
  });

task("task:heal", "Spend 10 coins to heal 1 HP when available")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("HiddenOutcomeGame");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("HiddenOutcomeGame", deployment.address);

    const tx = await contract.connect(signer).heal();
    console.log(`Healing... tx:${tx.hash}`);
    const receipt = await tx.wait();

    const event = receipt?.logs
      .map((log) => contract.interface.parseLog(log))
      .find((parsed) => parsed && parsed.name === "HealUsed");
    if (event) {
      console.log(`Heal attempts so far: ${event.args.totalHeals.toString()}`);
    }
    console.log("Heal attempt finished. Run task:decrypt-player to view results.");
  });

task("task:decrypt-player", "Decrypt your encrypted balance and health")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .addOptionalParam("player", "Player address to decrypt, defaults to first signer")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("HiddenOutcomeGame");
    const signers = await ethers.getSigners();
    const target = (taskArguments.player as string) || signers[0].address;
    const contract = await ethers.getContractAt("HiddenOutcomeGame", deployment.address);

    const [encryptedBalance, encryptedHealth, stats] = await Promise.all([
      contract.getEncryptedBalance(target),
      contract.getEncryptedHealth(target),
      contract.getPlayerStats(target),
    ]);

    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedBalance,
      deployment.address,
      signers[0],
    );

    const clearHealth = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedHealth,
      deployment.address,
      signers[0],
    );

    console.log(`Player: ${target}`);
    console.log(`Balance: ${clearBalance} coins`);
    console.log(`Health : ${clearHealth} / 10`);
    console.log(`Battles: ${stats[0].toString()}, victories: ${stats[1].toString()}, heals: ${stats[2].toString()}`);
  });
