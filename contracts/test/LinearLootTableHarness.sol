// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LinearLootTable } from "../loot/LinearLootTable.sol";

contract LinearLootTableHarness {
    function multiply(uint256 _value, uint256 _index) external pure returns (uint256) {
        return LinearLootTable.multiply(_value, _index);
    }

    function isDead(uint256 _rng, uint256 _index) external pure returns (bool) {
        return LinearLootTable.isDead(_rng, _index);
    }

    function deadOn(uint256[50] memory _rngs) external pure returns (uint256) {
        for (uint256 i = 0; i < 50; i++) {
            if (LinearLootTable.isDead(_rngs[i], i)) {
                return i;
            }
        }
        return 50;
    }
}
