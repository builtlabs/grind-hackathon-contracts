// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ValueHolder
/// @notice A base contract capable of holding and managing value.
abstract contract ValueHolder {
    uint256 private _stagedBalance;

    // #######################################################################################

    event StagedBalanceIncreased(uint256 amount);
    event StagedBalanceDecreased(uint256 amount);

    error ValueHolderInsufficientStagedBalance();
    error ValueHolderInsufficientAvailableBalance();

    // #######################################################################################

    modifier hasAvailableBalance(uint256 _value) {
        if (_getAvailableBalance() < _value) {
            revert ValueHolderInsufficientAvailableBalance();
        }
        _;
    }

    // #######################################################################################

    /// @notice Returns the reserved balance held within this contract.
    function getStagedBalance() external view returns (uint256) {
        return _stagedBalance;
    }

    /// @notice Returns the available balance held within this contract.
    function getAvailableBalance() external view returns (uint256) {
        return _getAvailableBalance();
    }

    // #######################################################################################

    function _getAvailableBalance() internal view returns (uint256) {
        return _getBalance() - _stagedBalance;
    }

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

    // #######################################################################################

    function _getBalance() internal view virtual returns (uint256);

    function _receiveValue(address _from, uint256 _value) internal virtual;

    function _sendValue(address _to, uint256 _value) internal virtual;
}
