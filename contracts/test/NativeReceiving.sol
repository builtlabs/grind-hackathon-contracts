// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NativeReceiving {
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
