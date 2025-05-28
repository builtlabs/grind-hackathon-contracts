// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "../currency/ValueHolder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Liquidity
/// @author @builtbyfrancis
abstract contract Liquidity is ValueHolder, Ownable {
    uint256 constant _DENOMINATOR = 10000;

    // #######################################################################################

    event LiquidityAdded(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityRemoved(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityChangeQueued(uint8 indexed action, address indexed user, uint256 amount);

    error InvalidValue();
    error InvalidMaxExposure();
    error InsufficientShares();
    error InsufficientLiquidity();

    struct LiquidityDelta {
        uint8 action; // 0 = add, 1 = remove
        address user;
        uint256 amount;
    }

    // #######################################################################################

    LiquidityDelta[] private _liquidityQueue;
    uint256 private _stagedBalance;

    mapping(address => uint256) private _userShares;
    uint256 private _totalShares;

    uint256 private _availableLiquidity;
    uint256 private _maxExposureNumerator;

    // #######################################################################################

    modifier notZero(uint256 _value) {
        if (_value == 0) revert InvalidValue();
        _;
    }

    // #######################################################################################

    constructor() {
        _maxExposureNumerator = 1000; // 10%
    }

    // #######################################################################################

    function setMaxExposure(uint256 _numerator) external onlyOwner {
        if (_numerator < 100 || _numerator > 5000) {
            revert InvalidMaxExposure();
        }

        _maxExposureNumerator = _numerator;
    }

    // #######################################################################################

    function getShares(address _user) external view returns (uint256) {
        return _userShares[_user];
    }

    function getTotalShares() external view returns (uint256) {
        return _totalShares;
    }

    function getLiquidityQueue() external view returns (LiquidityDelta[] memory) {
        return _liquidityQueue;
    }

    function deposit(uint256 _amount) external payable notZero(_amount) {
        _receiveValue(msg.sender, _amount);

        if (_canChangeLiquidity()) {
            _addLiquidity(msg.sender, _amount, _getBalance() - _amount);
            _resetLiquidity();
        } else {
            _queueLiquidityChange(0, _amount);

            unchecked {
                _stagedBalance += _amount;
            }
        }
    }

    function withdraw(uint256 _amount) external notZero(_amount) {
        if (_canChangeLiquidity()) {
            if (_removeLiquidity(msg.sender, _amount, _getBalance()) == 0) {
                revert InsufficientShares();
            }

            _resetLiquidity();
        } else {
            _queueLiquidityChange(1, _amount);
        }
    }

    // #######################################################################################

    function _getRoundLiquidity() internal view returns (uint256) {
        return _availableLiquidity;
    }

    function _clearLiquidityQueue() internal {
        uint256 _balance = _getBalance() - _stagedBalance;
        _stagedBalance = 0;

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
    }

    function _releaseRoundLiquidity(uint256 _amount) internal {
        unchecked {
            _availableLiquidity += _amount;
        }
    }

    // #######################################################################################

    function _canChangeLiquidity() internal view virtual returns (bool);

    // #######################################################################################

    function _queueLiquidityChange(uint8 _action, uint256 _amount) private {
        _liquidityQueue.push(LiquidityDelta(_action, msg.sender, _amount));
        emit LiquidityChangeQueued(_action, msg.sender, _amount);
    }

    function _addLiquidity(address _user, uint256 _amount, uint256 _balance) private {
        uint256 newShares = _totalShares == 0 ? _amount : (_amount * _totalShares) / _balance;
        unchecked {
            _userShares[_user] += newShares;
            _totalShares += newShares;
        }

        emit LiquidityAdded(_user, _amount, newShares);
    }

    function _removeLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        if (_userShares[_user] < _amount) {
            return 0;
        }

        uint256 withdrawAmount = (_amount * _balance) / _totalShares;
        unchecked {
            _userShares[_user] -= _amount;
            _totalShares -= _amount;
        }

        _sendValue(_user, withdrawAmount);

        emit LiquidityRemoved(_user, withdrawAmount, _amount);

        return withdrawAmount;
    }

    function _resetLiquidity() private {
        _availableLiquidity = (_getBalance() * _maxExposureNumerator) / _DENOMINATOR;
    }
}
