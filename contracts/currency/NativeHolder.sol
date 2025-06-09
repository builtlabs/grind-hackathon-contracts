// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "./ValueHolder.sol";

/// @title NativeHolder
/// @notice An implementation of the ValueHolder contract for the native currency.
contract NativeHolder is ValueHolder {
    error NativeHolderInvalidReceive();

    mapping(address => uint256) private _unclaimedBalances;

    // #######################################################################################

    /// @notice Returns the unclaimed balance for a given user.
    function getUnclaimedBalance(address _to) external view returns (uint256) {
        return _unclaimedBalances[_to];
    }

    /// @notice Allows the sender to claim their balance.
    function claim() external {
        uint256 amount = _unclaimedBalances[msg.sender];

        // Prevent re-entrancy by deleting the balance before sending.
        delete _unclaimedBalances[msg.sender];

        if (amount > 0) {
            // Ensure we can unstage the amount.
            _unstageAmount(amount);

            // Send the ether without a balance check, as we already checked it in _unstageAmount.
            _sendEther(msg.sender, amount);
        }
    }

    // #######################################################################################

    function _getBalance() internal view override returns (uint256) {
        return address(this).balance;
    }

    function _receiveValue(address, uint256 _value) internal override {
        if (msg.value != _value) {
            revert NativeHolderInvalidReceive();
        }
    }

    function _sendValue(address _to, uint256 _value) internal override hasAvailableBalance(_value) {
        _sendEther(_to, _value);
    }

    // #######################################################################################

    function _sendEther(address _to, uint256 _value) private {
        (bool success, ) = _to.call{ value: _value }("");
        if (!success) {
            // If the transfer fails, we assume the recipient is a contract that does not accept native currency.
            _stageAmount(_value);
            unchecked {
                _unclaimedBalances[_to] += _value;
            }
        }
    }
}
