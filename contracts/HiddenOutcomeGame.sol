// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HiddenOutcomeGame
/// @notice Encrypted adventure where players earn and spend hidden gold.
contract HiddenOutcomeGame is ZamaEthereumConfig {
    uint32 public constant STARTING_COINS = 1_000;
    uint32 public constant MIN_REWARD = 10;
    uint32 public constant REWARD_SPREAD = 91; // 10..100 inclusive
    uint32 public constant HEAL_COST = 10;
    uint8 public constant MAX_HEALTH = 10;
    uint8 public constant DAMAGE = 1;

    struct Player {
        euint32 balance;
        euint8 health;
        bool joined;
        uint64 battles;
        uint64 victories;
        uint64 heals;
    }

    mapping(address => Player) private players;

    event PlayerJoined(address indexed player);
    event MonsterFought(address indexed player, bool victory, uint32 reward);
    event HealUsed(address indexed player, uint64 totalHeals);

    /// @notice Join the game with fresh health and encrypted gold.
    function joinGame() external {
        Player storage player = players[msg.sender];
        require(!player.joined, "Already joined");

        player.joined = true;
        player.balance = FHE.asEuint32(STARTING_COINS);
        player.health = FHE.asEuint8(MAX_HEALTH);
        player.battles = 0;
        player.victories = 0;
        player.heals = 0;

        _allowPlayer(player);
        emit PlayerJoined(msg.sender);
    }

    /// @notice Fight a monster for a 50/50 chance to earn encrypted rewards.
    function fightMonster() external {
        Player storage player = players[msg.sender];
        require(player.joined, "Join first");

        uint256 rand = _random(msg.sender, player.battles);
        bool victory = rand % 2 == 0;
        uint32 reward = victory ? uint32(rand % REWARD_SPREAD) + MIN_REWARD : 0;

        if (victory) {
            player.balance = FHE.add(player.balance, FHE.asEuint32(reward));
            player.victories += 1;
        } else {
            euint8 damage = FHE.asEuint8(DAMAGE);
            player.health = _reduceHealth(player.health, damage);
        }

        player.battles += 1;
        _allowPlayer(player);

        emit MonsterFought(msg.sender, victory, reward);
    }

    /// @notice Spend encrypted coins to regain one health point when possible.
    function heal() external {
        Player storage player = players[msg.sender];
        require(player.joined, "Join first");

        ebool hasHealthRoom = FHE.lt(player.health, FHE.asEuint8(MAX_HEALTH));
        ebool hasCoins = FHE.ge(player.balance, FHE.asEuint32(HEAL_COST));
        ebool canHeal = FHE.and(hasHealthRoom, hasCoins);

        euint8 healedHealth = _clampHealth(FHE.add(player.health, FHE.asEuint8(1)));
        player.health = FHE.select(canHeal, healedHealth, player.health);
        player.balance = FHE.select(canHeal, FHE.sub(player.balance, FHE.asEuint32(HEAL_COST)), player.balance);

        player.heals += 1;

        _allowPlayer(player);
        emit HealUsed(msg.sender, player.heals);
    }

    /// @notice Returns the encrypted gold balance for a player.
    function getEncryptedBalance(address playerAddress) external view returns (euint32) {
        require(players[playerAddress].joined, "Player not found");
        return players[playerAddress].balance;
    }

    /// @notice Returns the encrypted health for a player.
    function getEncryptedHealth(address playerAddress) external view returns (euint8) {
        require(players[playerAddress].joined, "Player not found");
        return players[playerAddress].health;
    }

    /// @notice Returns battle statistics for a player.
    function getPlayerStats(address playerAddress) external view returns (uint64, uint64, uint64) {
        Player storage player = players[playerAddress];
        require(player.joined, "Player not found");
        return (player.battles, player.victories, player.heals);
    }

    /// @notice Indicates whether a player has joined the game.
    function hasJoined(address playerAddress) external view returns (bool) {
        return players[playerAddress].joined;
    }

    function _reduceHealth(euint8 health, euint8 damage) private returns (euint8) {
        ebool below = FHE.le(health, damage);
        return FHE.select(below, FHE.asEuint8(0), FHE.sub(health, damage));
    }

    function _clampHealth(euint8 health) private returns (euint8) {
        ebool over = FHE.gt(health, FHE.asEuint8(MAX_HEALTH));
        return FHE.select(over, FHE.asEuint8(MAX_HEALTH), health);
    }

    function _allowPlayer(Player storage player) private {
        FHE.allowThis(player.balance);
        FHE.allow(player.balance, msg.sender);
        FHE.allowThis(player.health);
        FHE.allow(player.health, msg.sender);
    }

    function _random(address playerAddress, uint64 battles) private view returns (uint256) {
        return uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), block.prevrandao, block.timestamp, playerAddress, battles))
        );
    }
}
