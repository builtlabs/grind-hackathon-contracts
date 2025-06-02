// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "./ValueHolder.sol";

/// @title NativeHolder
/// @notice An implementation of the ValueHolder contract for the native currency.
contract NativeHolder is ValueHolder {
    error NativeHolderInvalidReceive();
    error NativeHolderTransferFailed();

    // #######################################################################################

    function _getBalance() internal view override returns (uint256) {
        return address(this).balance;
    }

    function _receiveValue(address, uint256 _value) internal override {
        if (msg.value != _value) {
            revert NativeHolderInvalidReceive();
        }
    }

    function _sendValue(address _to, uint256 _value) internal override {
        (bool success, ) = _to.call{ value: _value }("");
        if (!success) {
            revert NativeHolderTransferFailed();
        }
    }
}
