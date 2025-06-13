// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20Holder, ValueHolder } from "../currency/ERC20Holder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20HolderHarness is ERC20Holder {
    constructor(
        address token_,
        uint256 minimumValue_
    ) ERC20Holder(token_) ValueHolder(minimumValue_) Ownable(msg.sender) {}

    function getBalance() external view returns (uint256) {
        return _getBalance();
    }

    function receiveValue(address _from, uint256 _value) external {
        _receiveValue(_from, _value);
    }

    function sendValue(address _to, uint256 _value) external {
        _sendValue(_to, _value);
    }
}
