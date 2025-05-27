// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ILootTable } from "../interfaces/ILootTable.sol";

/// @title LootTable
/// @author @builtbyfrancis
abstract contract LootTable is ILootTable {
    uint256 private constant MULTIPLIER_DENOMINATOR = 1e6;
    uint256 private constant PROBABILITY_DENOMINATOR = 1e18;

    // #######################################################################################

    modifier validIndex(uint256 _index) {
        if (_index + 1 > _getLength()) revert InvalidIndexError();
        _;
    }

    // #######################################################################################

    function getLength() external pure returns (uint256) {
        return _getLength();
    }

    function getMultipliers() external pure returns (uint256[] memory) {
        uint256 length = _getLength();

        uint256[] memory multipliers = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            multipliers[i] = _multiplier(i);
        }
        return multipliers;
    }

    function getProbabilities() external pure returns (uint256[] memory) {
        uint256 length = _getLength();

        uint256[] memory probabilities = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            probabilities[i] = _probability(i);
        }
        return probabilities;
    }

    function multiply(uint256 _value, uint256 _index) external pure validIndex(_index) returns (uint256) {
        return (_value * _multiplier(_index)) / MULTIPLIER_DENOMINATOR;
    }

    function isDead(uint256 _rng, uint256 _index) external pure validIndex(_index) returns (bool) {
        return _rng % PROBABILITY_DENOMINATOR < _probability(_index);
    }

    // #######################################################################################

    function _getLength() internal pure virtual returns (uint256);

    function _multiplier(uint256 _index) internal pure virtual returns (uint256);

    function _probability(uint256 _index) internal pure virtual returns (uint256);
}
