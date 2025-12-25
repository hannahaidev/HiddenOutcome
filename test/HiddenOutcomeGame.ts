import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HiddenOutcomeGame, HiddenOutcomeGame__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function decryptBalance(address: string, ciphertext: string, signer: HardhatEthersSigner) {
  return Number(await fhevm.userDecryptEuint(FhevmType.euint32, ciphertext, address, signer));
}

async function decryptHealth(address: string, ciphertext: string, signer: HardhatEthersSigner) {
  return Number(await fhevm.userDecryptEuint(FhevmType.euint8, ciphertext, address, signer));
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("HiddenOutcomeGame")) as HiddenOutcomeGame__factory;
  const contract = (await factory.deploy()) as HiddenOutcomeGame;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("HiddenOutcomeGame", function () {
  let signers: Signers;
  let contract: HiddenOutcomeGame;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Tests are meant for the local FHEVM mock environment");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("lets a player join with encrypted starting resources", async function () {
    await contract.connect(signers.alice).joinGame();

    const encryptedBalance = await contract.getEncryptedBalance(signers.alice.address);
    const encryptedHealth = await contract.getEncryptedHealth(signers.alice.address);
    const stats = await contract.getPlayerStats(signers.alice.address);
    const joined = await contract.hasJoined(signers.alice.address);

    const clearBalance = await decryptBalance(contractAddress, encryptedBalance, signers.alice);
    const clearHealth = await decryptHealth(contractAddress, encryptedHealth, signers.alice);

    expect(joined).to.eq(true);
    expect(clearBalance).to.eq(1000);
    expect(clearHealth).to.eq(10);
    expect(Number(stats[0])).to.eq(0); // battles
    expect(Number(stats[1])).to.eq(0); // victories
    expect(Number(stats[2])).to.eq(0); // heals
  });

  it("updates encrypted resources after a fight", async function () {
    await contract.connect(signers.alice).joinGame();

    const tx = await contract.connect(signers.alice).fightMonster();
    await tx.wait();

    const encryptedBalance = await contract.getEncryptedBalance(signers.alice.address);
    const encryptedHealth = await contract.getEncryptedHealth(signers.alice.address);
    const stats = await contract.getPlayerStats(signers.alice.address);

    const clearBalance = await decryptBalance(contractAddress, encryptedBalance, signers.alice);
    const clearHealth = await decryptHealth(contractAddress, encryptedHealth, signers.alice);

    expect(Number(stats[0])).to.eq(1);
    expect(clearHealth).to.be.at.least(0);
    expect(clearHealth).to.be.at.most(10);
    expect(clearBalance).to.be.at.least(1000);
    expect(clearBalance).to.be.at.most(1100);
  });

  it("spends coins to heal when health is missing", async function () {
    await contract.connect(signers.alice).joinGame();

    // Force at least one defeat to lose health
    let currentHealth = 10;
    for (let i = 0; i < 20; i++) {
      const fightTx = await contract.connect(signers.alice).fightMonster();
      await fightTx.wait();
      currentHealth = await decryptHealth(
        contractAddress,
        await contract.getEncryptedHealth(signers.alice.address),
        signers.alice,
      );
      if (currentHealth < 10) break;
    }

    expect(currentHealth).to.be.lessThan(10);

    const balanceBefore = await decryptBalance(
      contractAddress,
      await contract.getEncryptedBalance(signers.alice.address),
      signers.alice,
    );
    const healthBefore = currentHealth;

    const healTx = await contract.connect(signers.alice).heal();
    await healTx.wait();

    const balanceAfter = await decryptBalance(
      contractAddress,
      await contract.getEncryptedBalance(signers.alice.address),
      signers.alice,
    );
    const healthAfter = await decryptHealth(
      contractAddress,
      await contract.getEncryptedHealth(signers.alice.address),
      signers.alice,
    );
    const stats = await contract.getPlayerStats(signers.alice.address);

    expect(balanceAfter).to.eq(balanceBefore - 10);
    expect(healthAfter).to.eq(Math.min(healthBefore + 1, 10));
    expect(healthAfter).to.be.at.most(10);
    expect(Number(stats[2])).to.eq(1); // heals counter
  });
});
