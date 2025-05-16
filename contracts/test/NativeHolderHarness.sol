// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { NativeHolder } from "../currency/NativeHolder.sol";

contract NativeHolderHarness is NativeHolder {
    function receiveValue(uint256 _value) external payable {
        _receiveValue(msg.sender, _value);
    }

    function sendValue(address _to, uint256 _value) external {
        _sendValue(_to, _value);
    }
}
