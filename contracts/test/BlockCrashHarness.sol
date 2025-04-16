// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BlockCrash } from "../BlockCrash.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BlockCrashHarness is BlockCrash {
    constructor(IERC20 grind_, address runner_) BlockCrash(grind_, runner_) {}
}
