// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract HashCrashHarness is HashCrash {
    constructor(IERC20 grind_) HashCrash(grind_) {}

    mapping(uint256 => uint256) private _mockRandom;

    struct RandomMock {
        uint256 blockNumber;
        uint256 randomNumber;
    }

    function mockLoss(uint256 _amount) external {
        SafeERC20.safeTransfer(GRIND, address(GRIND), _amount);
    }

    function setMockRandom(RandomMock[] memory randoms) external {
        for (uint256 i = 0; i < randoms.length; i++) {
            _mockRandom[randoms[i].blockNumber] = randoms[i].randomNumber;
        }
    }

    function _getRNG(uint256 blockNumber) internal view override returns (uint256) {
        uint256 _mock = _mockRandom[blockNumber];
        if (_mock != 0) {
            return _mock;
        } else {
            return super._getRNG(blockNumber);
        }
    }
}
