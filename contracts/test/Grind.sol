// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Grind is ERC20 {
    error DontBeGreedy();

    constructor() ERC20("Grind", "GRIND") {
        _mint(msg.sender, 100000 * 10 ** decimals());
    }

    function mint() external {
        if (balanceOf(msg.sender) >= 500 * 10 ** decimals()) {
            revert DontBeGreedy();
        }

        _mint(msg.sender, 100 * 10 ** decimals());
    }
}
