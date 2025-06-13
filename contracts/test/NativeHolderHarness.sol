// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { NativeHolder, ValueHolder } from "../currency/NativeHolder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract NativeHolderHarness is NativeHolder {
    constructor(uint256 minimumValue_) ValueHolder(minimumValue_) Ownable(msg.sender) {}

    function getBalance() external view returns (uint256) {
        return _getBalance();
    }

    function receiveValue(uint256 _value) external payable {
        _receiveValue(msg.sender, _value);
    }

    function sendValue(address _to, uint256 _value) external {
        _sendValue(_to, _value);
    }
}
