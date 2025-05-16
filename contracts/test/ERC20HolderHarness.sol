// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20Holder } from "../currency/ERC20Holder.sol";

contract ERC20HolderHarness is ERC20Holder {
    constructor(address token_) ERC20Holder(token_) {}

    function receiveValue(address _from, uint256 _value) external {
        _receiveValue(_from, _value);
    }

    function sendValue(address _to, uint256 _value) external {
        _sendValue(_to, _value);
    }
}
