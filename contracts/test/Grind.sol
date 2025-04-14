// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Grind is ERC20 {
    constructor() ERC20("Grind", "GRIND") {
    }

    function mint(address to) external {
        _mint(to, 100 * 10 ** decimals());
    }
}