// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BlockCrash
/// @author @builtbyfrancis
contract BlockCrash {
    IERC20 public immutable GRIND;

    // #######################################################################################

    error ZeroAmountError();
    error InvalidActionError();

    // #######################################################################################

    event LiquidityChangeQueued(uint8 indexed action, address indexed user, uint256 amount);
    event LiquidityAdded(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityRemoved(address indexed user, uint256 tokenDelta, uint256 shareDelta);

    // #######################################################################################

    struct User {
        uint256 shares;
    }

    struct LiquidityDelta {
        uint8 action; // 0 = add, 1 = remove
        address user;
        uint256 amount;
    }

    // #######################################################################################

    uint256 private _totalShares;

    mapping(address => User) private _users;

    LiquidityDelta[] private _liquidityQueue;

    // #######################################################################################

    modifier NotZero(uint256 _amount) {
        if (_amount == 0) revert ZeroAmountError();
        _;
    }

    // #######################################################################################

    constructor(IERC20 grind_) {
        GRIND = grind_;
    }

    // #######################################################################################

    function getTotalShares() external view returns (uint256) {
        return _totalShares;
    }

    function getShares(address _user) external view returns (uint256) {
        return _users[_user].shares;
    }

    function getLiquidityQueue() external view returns (LiquidityDelta[] memory) {
        return _liquidityQueue;
    }

    // #######################################################################################

    function queueLiquidityChange(uint8 _action, uint256 _amount) external NotZero(_amount) {
        if (_action > 1) revert InvalidActionError();

        _liquidityQueue.push(LiquidityDelta(_action, msg.sender, _amount));
        emit LiquidityChangeQueued(_action, msg.sender, _amount);
    }

    function reset() external {
        _processLiquidityQueue();
    }

    // #######################################################################################

    function _processLiquidityQueue() private {
        for (uint256 i = 0; i < _liquidityQueue.length; i++) {
            uint256 _balance = GRIND.balanceOf(address(this));

            LiquidityDelta memory delta = _liquidityQueue[i];

            if (delta.action == 0) {
                _balance += _addLiquidity(delta.user, delta.amount, _balance);
            } else {
                _balance -= _removeLiquidity(delta.user, delta.amount, _balance);
            }
        }
        delete _liquidityQueue;
    }

    function _addLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        if (GRIND.balanceOf(_user) < _amount || GRIND.allowance(_user, address(this)) < _amount) {
            return 0;
        }

        SafeERC20.safeTransferFrom(GRIND, _user, address(this), _amount);

        uint256 newShares = _totalShares == 0 ? _amount : (_amount * _totalShares) / _balance;
        unchecked {
            _users[_user].shares += newShares;
            _totalShares += newShares;
        }

        emit LiquidityAdded(_user, _amount, newShares);

        return _amount;
    }

    function _removeLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        User storage user = _users[_user];

        if (user.shares < _amount) {
            return 0;
        }

        unchecked {
            user.shares -= _amount;
            _totalShares -= _amount;
        }

        uint256 withdrawAmount = (_amount * _balance) / _totalShares;

        SafeERC20.safeTransfer(GRIND, _user, withdrawAmount);

        emit LiquidityRemoved(_user, withdrawAmount, _amount);

        return withdrawAmount;
    }
}

