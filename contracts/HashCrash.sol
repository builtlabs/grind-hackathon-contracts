// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Liquidity } from "./liquidity/Liquidity.sol";
import { ILootTable } from "./interfaces/ILootTable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HashCrash
/// @notice The base hashcrash implementation, without specifying the value type.
abstract contract HashCrash is Liquidity {
    uint256 private constant _MAX_BET_QUEUE_SIZE = 256;

    error NotActiveError();

    error BetNotFoundError();
    error BetNotYoursError();
    error BetCancelledError();

    error NotHashProducerError();

    error RoundFullError();
    error RoundInProgressError();
    error RoundNotStartedError();

    error InvalidHashError();
    error InvalidCashoutIndexError();
    error InvalidCancelReturnNumeratorError();

    error RoundNotRefundableError();

    // #######################################################################################

    event RoundStarted(bytes32 indexed roundHash, uint64 startBlock, uint64 hashIndex);
    event RoundAccelerated(bytes32 indexed roundHash, uint64 startBlock);
    event RoundEnded(bytes32 indexed roundHash, bytes32 roundSalt, uint64 deadIndex);
    event RoundRefunded(bytes32 indexed roundHash, bytes32 roundSalt);

    event BetPlaced(
        bytes32 indexed roundHash,
        uint256 indexed index,
        address indexed user,
        uint256 amount,
        uint64 cashoutIndex
    );
    event BetCashoutUpdated(bytes32 indexed roundHash, uint256 indexed index, uint64 cashoutIndex);
    event BetCancelled(bytes32 indexed roundHash, uint256 indexed index);

    event ActiveUpdated(bool active);
    event LootTableUpdated(ILootTable lootTable);

    // #######################################################################################

    struct Bet {
        uint256 amount;
        address user;
        uint64 cashoutIndex;
    }

    struct BetOutput {
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

    mapping(uint256 => Bet) private _bets;
    uint256 private _betCancelledBitmap;
    uint256 private _betLength;

    bytes32 private _roundHash;
    address private _hashProducer;
    uint64 private _roundStartBlock;
    uint32 private _cancelReturnNumerator;

    ILootTable private _lootTable;
    uint64 private _introBlocks;
    uint32 private _reducedIntroBlocks;

    ILootTable private _stagedLootTable;
    uint64 private _hashIndex;
    bool private _active;

    // #######################################################################################

    /// @notice Constructor initializes the contract with the given parameters.
    /// @param lootTable_ The loot table to use for the game.
    /// @param genesisHash_ The initial hash for the round.
    /// @param hashProducer_ The address that can produce the next round hash.
    /// @param lowLiquidityThreshold_ The round liquidity below which we should start the round early.
    /// @param minimumValue_ The minimum value that can be used for bets.
    /// @param owner_ The owner of the contract.
    constructor(
        ILootTable lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        uint128 lowLiquidityThreshold_,
        uint256 minimumValue_,
        address owner_
    ) Liquidity(lowLiquidityThreshold_, minimumValue_) Ownable(owner_) {
        _introBlocks = 20;
        _reducedIntroBlocks = 5;
        _cancelReturnNumerator = 9700; // 97%
        _roundHash = genesisHash_;
        _hashProducer = hashProducer_;

        _setLootTable(lootTable_);
    }

    // ########################################################################################

    /// @notice Returns whether the game is active.
    function getActive() external view returns (bool) {
        return _active;
    }

    /// @notice Returns the current cancel return numerator.
    function getCancelReturnNumerator() external view returns (uint32) {
        return _cancelReturnNumerator;
    }

    /// @notice Returns the current loot table.
    function getLootTable() external view returns (ILootTable) {
        return _lootTable;
    }

    /// @notice Returns the staged loot table, if any. It will be applied when the next round starts.
    function getStagedLootTable() external view returns (ILootTable) {
        return _stagedLootTable;
    }

    /// @notice Returns the current hash producer.
    function getHashProducer() external view returns (address) {
        return _hashProducer;
    }

    /// @notice Returns the number of blocks between the first bet and the start of the round.
    function getIntroBlocks() external view returns (uint64) {
        return _introBlocks;
    }

    /// @notice Returns the number of blocks the round intro is reduced to when it hits low liquidity.
    function getReducedIntroBlocks() external view returns (uint32) {
        return _reducedIntroBlocks;
    }

    /// @notice Returns all bets placed in the current round by the given user.
    function getBetsFor(address _user) external view returns (BetOutput[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < _betLength; i++) {
            if (_bets[i].user == _user) {
                count++;
            }
        }

        BetOutput[] memory userBets = new BetOutput[](count);

        count = 0;
        for (uint256 i = 0; i < _betLength; i++) {
            if (_bets[i].user == _user) {
                userBets[count] = BetOutput({
                    amount: _bets[i].amount,
                    user: _bets[i].user,
                    cashoutIndex: _bets[i].cashoutIndex,
                    cancelled: _getCancelled(i, _betCancelledBitmap)
                });
                count++;
            }
        }

        return userBets;
    }

    /// @notice Returns the current round information.
    /// @return hashIndex_ The index of the current round hash.
    /// @return startBlock_ The block number when the current round started.
    /// @return roundLiquidity_ The total liquidity available for the current round.
    /// @return hash_ The current round hash.
    /// @return bets_ An array of all bets placed in the current round.
    /// @return blockHashes_ An array of block hashes from the start of the round to the current block (exclusive).
    function getRoundInfo()
        external
        view
        returns (
            uint64 hashIndex_,
            uint64 startBlock_,
            uint256 roundLiquidity_,
            bytes32 hash_,
            BetOutput[] memory bets_,
            bytes32[] memory blockHashes_
        )
    {
        hashIndex_ = _hashIndex;
        startBlock_ = _roundStartBlock;
        roundLiquidity_ = _getRoundLiquidity();
        hash_ = _roundHash;
        bets_ = new BetOutput[](_betLength);
        for (uint256 i = 0; i < _betLength; i++) {
            bets_[i] = BetOutput({
                amount: _bets[i].amount,
                user: _bets[i].user,
                cashoutIndex: _bets[i].cashoutIndex,
                cancelled: _getCancelled(i, _betCancelledBitmap)
            });
        }

        if (_isIdle() || startBlock_ >= block.number) {
            blockHashes_ = new bytes32[](0);
        } else {
            uint64 lootTableLength = uint64(_lootTable.getLength());
            uint64 length = uint64(block.number) - startBlock_;

            if (length > lootTableLength) {
                length = lootTableLength;
            }

            blockHashes_ = new bytes32[](length);

            for (uint64 i = 0; i < length; i++) {
                blockHashes_[i] = blockhash(startBlock_ + i);
            }
        }
    }

    // ########################################################################################

    /// @notice Sets the active state of the game.
    /// @param active_ The new active state.
    /// @dev If the game is set to inactive, it will not allow the start of a new round.
    function setActive(bool active_) external onlyOwner {
        if (_active == active_) return;

        _active = active_;
        emit ActiveUpdated(active_);
    }

    /// @notice Sets the cancel return numerator.
    /// @param cancelReturnNumerator_ The new cancel return numerator.
    /// @dev The numerator must be less than or equal to the denominator (10000).
    function setCancelReturnNumerator(uint32 cancelReturnNumerator_) external onlyOwner {
        if (cancelReturnNumerator_ > _DENOMINATOR) revert InvalidCancelReturnNumeratorError();
        _cancelReturnNumerator = cancelReturnNumerator_;
    }

    /// @notice Sets the hash producer address.
    /// @param hashProducer_ The new hash producer address.
    function setHashProducer(address hashProducer_) external onlyOwner {
        _hashProducer = hashProducer_;
    }

    /// @notice Sets the number of intro blocks before the round starts.
    /// @param introBlocks_ The number of intro blocks.
    function setIntroBlocks(uint64 introBlocks_) external onlyOwner {
        _introBlocks = introBlocks_;
    }

    /// @notice Sets the maximum number of intro blocks once low liquidity is hit.
    /// @param reducedIntroBlocks_ The reduced number of intro blocks.
    function setReducedIntroBlocks(uint32 reducedIntroBlocks_) external onlyOwner {
        _reducedIntroBlocks = reducedIntroBlocks_;
    }

    /// @notice Sets the loot table for the game.
    /// @param lootTable_ The new loot table to use.
    /// @dev If the game is currently idle, the loot table is set immediately. Otherwise, it is staged for the next round.
    function setLootTable(ILootTable lootTable_) external onlyOwner {
        if (_isIdle()) {
            _setLootTable(lootTable_);
        } else {
            _stagedLootTable = lootTable_;
        }
    }

    // ########################################################################################

    /// @notice Places a bet in the current round.
    /// @param _amount The amount to bet, must be greater than zero.
    /// @param _autoCashout The index of the auto cashout in the loot table.
    /// @dev If the round has not started, it will initialise the round.
    function placeBet(uint256 _amount, uint64 _autoCashout) external payable enforceMinimum(_amount) {
        if (_roundStartBlock == 0) {
            _initialiseRound();
        }

        // Ensure the bet is valid
        if (_betLength == _MAX_BET_QUEUE_SIZE) revert RoundFullError();
        if (_roundStartBlock <= block.number) revert RoundInProgressError();
        if (_lootTable.getLength() <= _autoCashout) revert InvalidCashoutIndexError();

        // Ensure the user has enough funds
        _receiveValue(msg.sender, _amount);

        // Reduce the round liquidity by the users max win
        _useRoundLiquidity(_lootTable.multiply(_amount, _autoCashout));

        // Emit an event for the bet placed
        emit BetPlaced(_roundHash, _betLength, msg.sender, _amount, _autoCashout);

        // Store the bet
        _bets[_betLength] = Bet(_amount, msg.sender, _autoCashout);
        unchecked {
            _betLength++;
        }
    }

    /// @notice Updates the auto cashout index for a bet.
    /// @param _index The index of the bet to update.
    /// @param _autoCashout The new auto cashout index in the loot table.
    function updateBet(uint256 _index, uint64 _autoCashout) external {
        Bet storage bet = _getBet(_index, _betCancelledBitmap);

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

    /// @notice Cancels a bet and refunds the user.
    /// @param _index The index of the bet to cancel.
    function cancelBet(uint256 _index) external {
        uint256 _bitmap = _betCancelledBitmap;
        Bet storage bet = _getBet(_index, _bitmap);

        // Ensure the game has not started
        if (_roundStartBlock <= block.number) revert RoundInProgressError();

        // Cancel the bet
        _betCancelledBitmap = _setCancelled(_index, _bitmap);

        // Partially refund the user
        _sendValue(msg.sender, _getCancelReturn(bet.amount));

        // Update the round liquidity
        _releaseRoundLiquidity(_lootTable.multiply(bet.amount, bet.cashoutIndex));

        // Emit an event for the bet cancelled
        emit BetCancelled(_roundHash, _index);
    }

    /// @notice Allows a user to cash out their bet at the current block index.
    /// @param _index The index of the bet to cash out.
    function cashout(uint256 _index) external {
        Bet storage bet = _getBet(_index, _betCancelledBitmap);

        // Ensure the game has started
        uint64 _bn = uint64(block.number);
        if (_bn < _roundStartBlock) revert RoundNotStartedError();

        // Ensure the user has not cashed out already
        uint64 blockIndex = _bn - _roundStartBlock;
        if (bet.cashoutIndex <= blockIndex) revert InvalidCashoutIndexError();

        bet.cashoutIndex = blockIndex;

        emit BetCashoutUpdated(_roundHash, _index, blockIndex);
    }

    /// @notice Reveals the round result and processes the bets.
    /// @param _salt The salt used to generate the round hash.
    /// @param _nextHash The hash for the next round.
    function reveal(bytes32 _salt, bytes32 _nextHash) external onlyHashProducer {
        if (keccak256(abi.encodePacked(_salt)) != _roundHash) revert InvalidHashError();

        uint64 deadIndex = _lootTable.getDeadIndex(_salt, _roundStartBlock);

        _processBets(deadIndex);
        _clearLiquidityQueue();

        emit RoundEnded(_roundHash, _salt, deadIndex);

        _roundStartBlock = 0;
        _roundHash = _nextHash;
        unchecked {
            _hashIndex++;
        }
    }

    /// @notice Refunds the round.
    /// @param _salt The salt used to generate the round hash.
    /// @param _nextHash The hash for the next round.
    /// @dev This can only be called in an emergency situation, where the reveal has been delayed and it is no longer possible for the chain to access the round blockhashes.
    function refund(bytes32 _salt, bytes32 _nextHash) external onlyHashProducer {
        if (keccak256(abi.encodePacked(_salt)) != _roundHash) revert InvalidHashError();

        if (_roundStartBlock == 0 || blockhash(_roundStartBlock) != bytes32(0)) revert RoundNotRefundableError();

        _refundBets();
        _clearLiquidityQueue();

        emit RoundRefunded(_roundHash, _salt);

        _roundStartBlock = 0;
        _roundHash = _nextHash;
        unchecked {
            _hashIndex++;
        }
    }

    // ########################################################################################

    function _canChangeLiquidity() internal view override returns (bool) {
        return _isIdle();
    }

    function _getRound() internal view override returns (uint64) {
        return _hashIndex + 1; // Ensure it is never zero
    }

    function _onLowLiquidity() internal override {
        if (_roundStartBlock != 0 && block.number < _roundStartBlock - _reducedIntroBlocks) {
            _roundStartBlock = uint64(block.number + _reducedIntroBlocks);
            emit RoundAccelerated(_roundHash, _roundStartBlock);
        }
    }

    // ########################################################################################

    function _isIdle() private view returns (bool) {
        return _roundStartBlock == 0;
    }

    function _getBet(uint256 _index, uint256 _bitmap) private view returns (Bet storage bet_) {
        if (_index >= _betLength) revert BetNotFoundError();

        bet_ = _bets[_index];

        if (bet_.user != msg.sender) revert BetNotYoursError();
        if (_getCancelled(_index, _bitmap)) revert BetCancelledError();
    }

    function _getCancelReturn(uint256 _amount) private view returns (uint256) {
        return (_amount * _cancelReturnNumerator) / _DENOMINATOR;
    }

    function _getCancelled(uint256 _index, uint256 _bitmap) private pure returns (bool) {
        return (_bitmap & (1 << _index)) != 0;
    }

    function _setCancelled(uint256 _index, uint256 _bitmap) private pure returns (uint256) {
        return _bitmap |= (1 << _index);
    }

    function _initialiseRound() private {
        if (!_active) revert NotActiveError();

        // Apply the staged loot table if it exists
        if (_stagedLootTable != ILootTable(address(0))) {
            _setLootTable(_stagedLootTable);
            delete _stagedLootTable;
        }

        _roundStartBlock = uint64(block.number) + _introBlocks;
        emit RoundStarted(_roundHash, _roundStartBlock, _hashIndex);
    }

    function _setLootTable(ILootTable lootTable_) private {
        _lootTable = lootTable_;
        emit LootTableUpdated(lootTable_);
    }

    function _processBets(uint64 _deadIndex) private {
        uint256 _bitmap = _betCancelledBitmap;

        for (uint256 i = 0; i < _betLength; i++) {
            if (!_getCancelled(i, _bitmap)) {
                Bet memory bet = _bets[i];

                if (bet.cashoutIndex < _deadIndex) {
                    _sendValue(bet.user, _lootTable.multiply(bet.amount, bet.cashoutIndex));
                }
            }
        }

        _betLength = 0;
        _betCancelledBitmap = 0;
    }

    function _refundBets() private {
        uint256 _bitmap = _betCancelledBitmap;

        for (uint256 i = 0; i < _betLength; i++) {
            if (!_getCancelled(i, _bitmap)) {
                _sendValue(_bets[i].user, _bets[i].amount);
                emit BetCancelled(_roundHash, i);
            }
        }

        _betLength = 0;
        _betCancelledBitmap = 0;
    }
}
