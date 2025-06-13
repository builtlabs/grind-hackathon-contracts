// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ValueHolder
/// @notice A base contract capable of holding and managing value.
abstract contract ValueHolder is Ownable {
    uint256 private _stagedBalance;
    uint256 private _minimum;

    // #######################################################################################

    event StagedBalanceIncreased(uint256 amount);
    event StagedBalanceDecreased(uint256 amount);

    error ValueHolderValueTooSmall();
    error ValueHolderInsufficientStagedBalance();
    error ValueHolderInsufficientAvailableBalance();

    // #######################################################################################

    modifier hasAvailableBalance(uint256 _value) {
        if (_getAvailableBalance() < _value) {
            revert ValueHolderInsufficientAvailableBalance();
        }
        _;
    }

    modifier notZero(uint256 _value) {
        if (_value == 0) revert ValueHolderValueTooSmall();
        _;
    }

    modifier enforceMinimum(uint256 _value) {
        if (_value < _minimum) revert ValueHolderValueTooSmall();
        _;
    }

    // #######################################################################################

    constructor(uint256 _minimumValue) {
        if (_minimumValue == 0) revert ValueHolderValueTooSmall();
        _minimum = _minimumValue;
    }

    // #######################################################################################

    /// @notice Returns the reserved balance held within this contract.
    function getStagedBalance() external view returns (uint256) {
        return _stagedBalance;
    }

    /// @notice Returns the minimum value that can be used.
    function getMinimum() external view returns (uint256) {
        return _getMinimum();
    }

    /// @notice Returns the available balance held within this contract.
    function getAvailableBalance() external view returns (uint256) {
        return _getAvailableBalance();
    }

    // #######################################################################################

    /// @notice Sets the minimum value that can be used.
    function setMinimum(uint256 _minimumValue) external onlyOwner {
        if (_minimumValue == 0) revert ValueHolderValueTooSmall();
        _minimum = _minimumValue;
    }

    // #######################################################################################

    function _stageAmount(uint256 _amount) internal {
        unchecked {
            _stagedBalance += _amount;
        }

        emit StagedBalanceIncreased(_amount);
    }

    function _unstageAmount(uint256 _amount) internal {
        if (_stagedBalance < _amount) {
            revert ValueHolderInsufficientStagedBalance();
        }

        unchecked {
            _stagedBalance -= _amount;
        }

        emit StagedBalanceDecreased(_amount);
    }

    function _getMinimum() internal view returns (uint256) {
        return _minimum;
    }

    function _getAvailableBalance() internal view returns (uint256) {
        return _getBalance() - _stagedBalance;
    }

    // #######################################################################################

    function _getBalance() internal view virtual returns (uint256);

    function _receiveValue(address _from, uint256 _value) internal virtual;

    function _sendValue(address _to, uint256 _value) internal virtual;
}
