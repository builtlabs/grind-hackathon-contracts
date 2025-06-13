// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "../currency/ValueHolder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ValueHolderHarness is ValueHolder {
    uint256 private _balance;

    // #######################################################################################

    constructor(uint256 minimumValue_) ValueHolder(minimumValue_) Ownable(msg.sender) {}

    // #######################################################################################

    function t_notZero(uint256 _value) external notZero(_value) {
        // This function is just to test the notZero modifier.
    }

    function t_enforceMinimum(uint256 _value) external enforceMinimum(_value) {
        // This function is just to test the hasAvailableBalance modifier.
    }

    function stageAmount(uint256 _amount) external {
        _stageAmount(_amount);
    }

    function unstageAmount(uint256 _amount) external {
        _unstageAmount(_amount);
    }

    function receiveValue(uint256 _value) external {
        _receiveValue(msg.sender, _value);
    }

    function sendValue(uint256 _value) external hasAvailableBalance(_value) {
        _sendValue(msg.sender, _value);
    }

    // #######################################################################################

    function _getBalance() internal view override returns (uint256) {
        return _balance;
    }

    function _receiveValue(address, uint256 _value) internal override {
        _balance += _value;
    }

    function _sendValue(address, uint256 _value) internal override hasAvailableBalance(_value) {
        _balance -= _value;
    }
}
