// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "./ValueHolder.sol";

/// @title NativeHolder
/// @notice An implementation of the ValueHolder contract for the native currency.
abstract contract NativeHolder is ValueHolder {
    error NativeHolderFailedToClaim();
    error NativeHolderInvalidReceive();

    event UnclaimedBalanceClaimed(address indexed user, uint256 amount);
    event UnclaimedBalanceIncreased(address indexed user, uint256 amount);

    // #######################################################################################

    mapping(address => uint256) private _unclaimedBalances;
    uint256 private _sendGasLimit = 120000;

    // #######################################################################################

    /// @notice Sets the gas limit for sending native currency.
    /// @param _gasLimit The gas limit to set for sending native currency.
    /// @dev Setting this to a low number will cause all sends to be staged.
    function setSendGasLimit(uint256 _gasLimit) external onlyOwner {
        _sendGasLimit = _gasLimit;
    }

    // #######################################################################################

    /// @notice Returns the current gas limit for sending native currency.
    function getSendGasLimit() external view returns (uint256) {
        return _sendGasLimit;
    }

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
            (bool success, ) = payable(msg.sender).call{ value: amount }("");
            if (!success) {
                // Since this won't harm anyone else, we can safely revert.
                revert NativeHolderFailedToClaim();
            }

            // Emit an event for the claimed balance.
            emit UnclaimedBalanceClaimed(msg.sender, amount);
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
        (bool success, ) = _to.call{ value: _value, gas: _sendGasLimit }("");
        if (!success) {
            // If the transfer fails, we assume the recipient is a contract that does not accept native currency.
            _stageAmount(_value);

            unchecked {
                _unclaimedBalances[_to] += _value;
            }

            emit UnclaimedBalanceIncreased(_to, _value);
        }
    }
}
