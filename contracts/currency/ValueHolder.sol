// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ValueHolder
/// @author @builtbyfrancis
abstract contract ValueHolder {
    function balance() external view returns (uint256) {
        return _getBalance();
    }

    // #######################################################################################

    function _getBalance() internal view virtual returns (uint256);

    function _receiveValue(address _from, uint256 _value) internal virtual;

    function _sendValue(address _to, uint256 _value) internal virtual;
}
