// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "../currency/ValueHolder.sol";

/// @title Liquidity
/// @notice A base contract for managing liquidity.
abstract contract Liquidity is ValueHolder {
    uint256 constant _MAX_LIQUIDITY_QUEUE_SIZE = 256;
    uint256 constant _DENOMINATOR = 10000;

    // #######################################################################################

    event LiquidityAdded(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityRemoved(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityChangeQueued(uint8 indexed action, address indexed user, uint256 amount);

    error OneChangePerRound();
    error LiquidityQueueFull();
    error InvalidMaxExposure();
    error InsufficientShares();
    error InsufficientLiquidity();

    struct LiquidityDelta {
        uint8 action; // 0 = add, 1 = remove
        address user;
        uint256 amount;
    }

    struct User {
        uint192 shares;
        uint64 lastUpdated;
    }

    // #######################################################################################

    LiquidityDelta[] private _liquidityQueue;
    uint256 private _availableLiquidity;

    mapping(address => User) private _users;
    uint256 private _totalShares;

    uint128 private _maxExposureNumerator;
    uint128 private _lowLiquidityThreshold;

    // #######################################################################################

    modifier onlyChange() {
        uint64 round = _getRound();

        // Ensure that the user has not already made a change in this round.
        if (_users[msg.sender].lastUpdated == round) revert OneChangePerRound();

        // Update their last changed.
        _users[msg.sender].lastUpdated = round;

        _;
    }

    // #######################################################################################

    /// @notice Constructor sets the initial max liquidity exposure to 10% and the low liquidity threshold.
    /// @param lowLiquidityThreshold_ The threshold below which the parent is notified the _availableLiquidity is low.
    /// @param minimumValue_ The minimum value that can be used for deposits.
    constructor(uint128 lowLiquidityThreshold_, uint256 minimumValue_) ValueHolder(minimumValue_) {
        _maxExposureNumerator = 1000; // 10%
        _lowLiquidityThreshold = lowLiquidityThreshold_;
    }

    // #######################################################################################

    /// @notice Sets the maximum exposure numerator.
    /// @param _numerator The numerator for the maximum exposure, must be between 100 and 5000 (1% to 50%).
    function setMaxExposure(uint128 _numerator) external onlyOwner {
        if (_numerator < 100 || _numerator > 5000) {
            revert InvalidMaxExposure();
        }

        _maxExposureNumerator = _numerator;
    }

    /// @notice Sets the low liquidity threshold.
    /// @param _value The new low liquidity threshold.
    function setLowLiquidityThreshold(uint128 _value) external onlyOwner {
        _lowLiquidityThreshold = _value;
    }

    // #######################################################################################

    /// @notice Returns the current available liquidity.
    function getAvailableLiquidity() external view returns (uint256) {
        return _availableLiquidity;
    }

    /// @notice Returns the current maximum exposure numerator.
    function getMaxExposureNumerator() external view returns (uint128) {
        return _maxExposureNumerator;
    }

    /// @notice Returns the current low liquidity threshold.
    function getLowLiquidityThreshold() external view returns (uint128) {
        return _lowLiquidityThreshold;
    }

    /// @notice Returns the number of shares held by the given user.
    function getShares(address _user) external view returns (uint256) {
        return _users[_user].shares;
    }

    /// @notice Returns the last deposit round of the given user.
    function getLastUpdated(address _user) external view returns (uint64) {
        return _users[_user].lastUpdated;
    }

    /// @notice Returns the total number of shares across all users.
    function getTotalShares() external view returns (uint256) {
        return _totalShares;
    }

    /// @notice Returns the current liquidity changes waiting to be applied.
    function getLiquidityQueue() external view returns (LiquidityDelta[] memory) {
        return _liquidityQueue;
    }

    // #######################################################################################

    /// @notice Either deposits, or queues a deposit of the given amount by the sender.
    /// @param _amount The amount to deposit, must be greater than zero.
    function deposit(uint256 _amount) external payable enforceMinimum(_amount) onlyChange {
        // Standardize behavior between native and ERC20 deposits.
        _receiveValue(msg.sender, _amount);

        // We stage because this amount should not become available until the deposit is processed.
        _stageAmount(_amount);

        // If the contract can change liquidity immediately, add the liquidity.
        if (_canChangeLiquidity()) {
            _addLiquidity(msg.sender, _amount, _getAvailableBalance());
            _resetLiquidity();
        } else {
            // Otherwise, queue the liquidity change.
            _queueLiquidityChange(0, _amount);
        }
    }

    /// @notice Either withdraws, or queues a withdrawal of the given amount by the sender.
    /// @param _amount The amount to withdraw, must be greater than zero.
    function withdraw(uint256 _amount) external notZero(_amount) onlyChange {
        // If the contract can change liquidity immediately, remove the liquidity.
        if (_canChangeLiquidity()) {
            if (_removeLiquidity(msg.sender, _amount, _getAvailableBalance()) == 0) {
                revert InsufficientShares();
            }

            _resetLiquidity();
        } else {
            // Otherwise, queue the liquidity change. We do not need to check for sufficient shares here.
            _queueLiquidityChange(1, _amount);
        }
    }

    // #######################################################################################

    function _getRoundLiquidity() internal view returns (uint256) {
        return _availableLiquidity;
    }

    function _clearLiquidityQueue() internal {
        // Cache the available balance to avoid multiple calls to _getAvailableBalance.
        uint256 _balance = _getAvailableBalance();

        for (uint256 i = 0; i < _liquidityQueue.length; i++) {
            LiquidityDelta memory delta = _liquidityQueue[i];

            if (delta.action == 0) {
                _addLiquidity(delta.user, delta.amount, _balance);
                unchecked {
                    _balance += delta.amount;
                }
            } else {
                _balance -= _removeLiquidity(delta.user, delta.amount, _balance);
            }
        }

        delete _liquidityQueue;

        _resetLiquidity();
    }

    function _useRoundLiquidity(uint256 _amount) internal {
        if (_amount > _availableLiquidity) {
            revert InsufficientLiquidity();
        }

        unchecked {
            _availableLiquidity -= _amount;
        }

        if (_availableLiquidity < _lowLiquidityThreshold) {
            _onLowLiquidity();
        }
    }

    function _releaseRoundLiquidity(uint256 _amount) internal {
        unchecked {
            _availableLiquidity += _amount;
        }
    }

    // #######################################################################################

    function _canChangeLiquidity() internal view virtual returns (bool);

    function _getRound() internal view virtual returns (uint64);

    function _onLowLiquidity() internal virtual {
        // This function can be overridden by the parent contract to handle low liquidity situations.
        // For example, it could start the game early.
    }

    // #######################################################################################

    function _queueLiquidityChange(uint8 _action, uint256 _amount) private {
        if (_liquidityQueue.length == _MAX_LIQUIDITY_QUEUE_SIZE) revert LiquidityQueueFull();

        _liquidityQueue.push(LiquidityDelta(_action, msg.sender, _amount));
        emit LiquidityChangeQueued(_action, msg.sender, _amount);
    }

    function _addLiquidity(address _user, uint256 _amount, uint256 _balance) private {
        uint256 newShares = _totalShares == 0 ? _amount : (_amount * _totalShares) / _balance;

        unchecked {
            _users[_user].shares += uint192(newShares);
            _totalShares += newShares;
        }

        // The liquidity has been processed, so we can make the amount available.
        _unstageAmount(_amount);

        emit LiquidityAdded(_user, _amount, newShares);
    }

    function _removeLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        if (_users[_user].shares < _amount) {
            // The user does not have enough shares to withdraw the requested amount, so we just ignore the request.
            return 0;
        }

        uint256 withdrawAmount = (_amount * _balance) / _totalShares;
        unchecked {
            _users[_user].shares -= uint192(_amount);
            _totalShares -= _amount;
        }

        _sendValue(_user, withdrawAmount);

        emit LiquidityRemoved(_user, withdrawAmount, _amount);

        return withdrawAmount;
    }

    function _resetLiquidity() private {
        // The available liquidity is recalculated based on the current balance and the maximum exposure.
        _availableLiquidity = (_getAvailableBalance() * _maxExposureNumerator) / _DENOMINATOR;
    }
}
