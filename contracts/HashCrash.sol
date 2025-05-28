// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Liquidity } from "./liquidity/Liquidity.sol";
import { ILootTable } from "./interfaces/ILootTable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HashCrash
/// @author @builtbyfrancis
abstract contract HashCrash is Liquidity {
    error BetNotFoundError();
    error BetNotYoursError();
    error BetCancelledError();

    error NotHashProducerError();

    error RoundInProgressError();
    error RoundNotStartedError();

    error InvalidHashError();
    error InvalidCashoutIndexError();

    event RoundStarted(bytes32 indexed roundHash, uint64 startBlock);
    event RoundEnded(bytes32 indexed roundHash, bytes32 roundSalt, uint64 deadIndex);

    event BetPlaced(bytes32 indexed roundHash, address indexed user, uint256 amount, uint64 cashoutIndex);
    event BetCashoutUpdated(bytes32 indexed roundHash, uint256 indexed index, uint64 cashoutIndex);
    event BetCancelled(bytes32 indexed roundHash, uint256 indexed index);

    event LootTableUpdated(ILootTable lootTable);

    // #######################################################################################

    struct Bet {
        uint256 amount;
        address user;
        uint64 cashoutIndex;
        bool cancelled;
    }

    modifier onlyHashProducer() {
        if (msg.sender != _hashProducer) revert NotHashProducerError();
        _;
    }

    // #######################################################################################

    Bet[] private _bets;

    bytes32 private _roundHash;
    address private _hashProducer;
    uint64 private _roundStartBlock;

    ILootTable private _lootTable;
    uint64 private _introBlocks;

    ILootTable private _stagedLootTable;

    // #######################################################################################

    constructor(
        ILootTable lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        address owner_
    ) Liquidity() Ownable(owner_) {
        _introBlocks = 20;
        _roundHash = genesisHash_;
        _hashProducer = hashProducer_;

        _setLootTable(lootTable_);
    }

    // ########################################################################################

    function getBets() external view returns (Bet[] memory) {
        return _bets;
    }

    function getBetsFor(address _user) external view returns (Bet[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < _bets.length; i++) {
            if (_bets[i].user == _user) {
                count++;
            }
        }

        Bet[] memory userBets = new Bet[](count);

        count = 0;
        for (uint256 i = 0; i < _bets.length; i++) {
            if (_bets[i].user == _user) {
                userBets[count] = _bets[i];
                count++;
            }
        }

        return userBets;
    }

    function getRoundInfo()
        external
        view
        returns (uint64 _startBlock, uint256 _roundLiquidity, bytes32 _hash, bytes32[] memory _blockHashes)
    {
        _startBlock = _roundStartBlock;
        _roundLiquidity = _getRoundLiquidity();
        _hash = _roundHash;

        if (_startBlock >= block.number) {
            _blockHashes = new bytes32[](0);
        } else {
            uint64 length = uint64(block.number) - _startBlock;
            _blockHashes = new bytes32[](length);

            for (uint64 i = 0; i < length; i++) {
                _blockHashes[i] = _getBlockHash(_startBlock + i);
            }
        }
    }

    function getSettings() external view returns (ILootTable lootTable_, address hashProducer_, uint64 introBlocks_) {
        lootTable_ = _lootTable;
        hashProducer_ = _hashProducer;
        introBlocks_ = _introBlocks;
    }

    // ########################################################################################

    function setHashProducer(address hashProducer_) external onlyOwner {
        _hashProducer = hashProducer_;
    }

    function setIntroBlocks(uint64 introBlocks_) external onlyOwner {
        _introBlocks = introBlocks_;
    }

    function setLootTable(ILootTable lootTable_) external onlyOwner {
        if (_isIdle()) {
            _setLootTable(lootTable_);
        } else {
            _stagedLootTable = lootTable_;
        }
    }

    // ########################################################################################

    function placeBet(uint256 _amount, uint64 _autoCashout) external payable notZero(_amount) {
        if (_roundStartBlock == 0) {
            _initialiseRound();
        }

        // Ensure the bet is valid
        if (_roundStartBlock <= block.number) revert RoundInProgressError();
        if (_lootTable.getLength() <= _autoCashout) revert InvalidCashoutIndexError();

        // Ensure the user has enough funds
        _receiveValue(msg.sender, _amount);

        // Reduce the round liquidity by the users max win
        _useRoundLiquidity(_lootTable.multiply(_amount, _autoCashout));

        // Store the bet
        _bets.push(Bet(_amount, msg.sender, _autoCashout, false));

        // Emit an event for the bet placed
        emit BetPlaced(_roundHash, msg.sender, _amount, _autoCashout);
    }

    function updateBet(uint256 _index, uint64 _autoCashout) external {
        Bet storage bet = _getBet(_index);

        // Ensure the update is valid
        if (_roundStartBlock <= block.number) revert RoundInProgressError();
        if (_lootTable.getLength() <= _autoCashout) revert InvalidCashoutIndexError();

        // Update the round liquidity
        _releaseRoundLiquidity(_lootTable.multiply(bet.amount, bet.cashoutIndex));
        _useRoundLiquidity(_lootTable.multiply(bet.amount, _autoCashout));

        // Update the bet
        bet.cashoutIndex = _autoCashout;

        // Emit an event for the bet updated
        emit BetCashoutUpdated(_roundHash, _index, _autoCashout);
    }

    function cancelBet(uint256 _index) external {
        Bet storage bet = _getBet(_index);

        // Ensure the game has not started
        if (_roundStartBlock <= block.number) revert RoundInProgressError();

        // Cancel the bet
        bet.cancelled = true;

        // Refund the bet
        _sendValue(msg.sender, bet.amount);

        // Update the round liquidity
        _releaseRoundLiquidity(_lootTable.multiply(bet.amount, bet.cashoutIndex));

        // Emit an event for the bet cancelled
        emit BetCancelled(_roundHash, _index);
    }

    function cashout(uint256 _index) external {
        Bet storage bet = _getBet(_index);

        // Ensure the game has started
        uint64 _bn = uint64(block.number);
        if (_bn < _roundStartBlock) revert RoundNotStartedError();

        // Ensure the user has not cashed out already
        uint64 blockIndex = _bn - _roundStartBlock;
        if (bet.cashoutIndex <= blockIndex) revert InvalidCashoutIndexError();

        bet.cashoutIndex = blockIndex;

        emit BetCashoutUpdated(_roundHash, _index, blockIndex);
    }

    function reveal(bytes32 _salt, bytes32 _nextHash) external onlyHashProducer {
        if (keccak256(abi.encode(_salt)) != _roundHash) revert InvalidHashError();

        uint64 deadIndex = _getDeadIndex(_salt);

        _processBets(deadIndex);
        _clearLiquidityQueue();

        emit RoundEnded(_roundHash, _salt, deadIndex);

        _roundStartBlock = 0;
        _roundHash = _nextHash;
    }

    // ########################################################################################

    function _canChangeLiquidity() internal view override returns (bool) {
        return _isIdle();
    }

    // ########################################################################################

    function _isIdle() private view returns (bool) {
        return _roundStartBlock == 0;
    }

    function _getBet(uint256 _index) private view returns (Bet storage bet_) {
        if (_index >= _bets.length) revert BetNotFoundError();

        bet_ = _bets[_index];

        if (bet_.user != msg.sender) revert BetNotYoursError();
        if (bet_.cancelled) revert BetCancelledError();
    }

    function _getDeadIndex(bytes32 _salt) private view returns (uint64) {
        uint64 length = uint64(_lootTable.getLength());

        for (uint64 i = 0; i < length; i++) {
            uint256 rng = uint256(keccak256(abi.encode(_salt, _getBlockHash(_roundStartBlock + i))));

            if (_lootTable.isDead(rng, i)) {
                return i;
            }
        }
        return length;
    }

    function _getBlockHash(uint256 _blockNumber) private view returns (bytes32 blockHash_) {
        blockHash_ = blockhash(_blockNumber);
        if (blockHash_ == bytes32(0)) revert InvalidHashError();
    }

    function _initialiseRound() private {
        if (_stagedLootTable != ILootTable(address(0))) {
            _setLootTable(_stagedLootTable);
            delete _stagedLootTable;
        }

        _roundStartBlock = uint64(block.number) + _introBlocks;
        emit RoundStarted(_roundHash, _roundStartBlock);
    }

    function _setLootTable(ILootTable lootTable_) private {
        _lootTable = lootTable_;
        emit LootTableUpdated(lootTable_);
    }

    function _processBets(uint64 _deadIndex) internal {
        for (uint256 i = 0; i < _bets.length; i++) {
            Bet storage bet = _bets[i];

            if (!bet.cancelled && bet.cashoutIndex < _deadIndex) {
                _sendValue(bet.user, _lootTable.multiply(bet.amount, bet.cashoutIndex));
            }
        }

        delete _bets;
    }
}
