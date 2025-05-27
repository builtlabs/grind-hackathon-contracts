// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILootTable
/// @author @builtbyfrancis
interface ILootTable {
    error InvalidIndexError();

    function getLength() external pure returns (uint256);

    function getMultipliers() external pure returns (uint256[] memory);

    function getProbabilities() external pure returns (uint256[] memory);

    function multiply(uint256 _value, uint256 _index) external pure returns (uint256);

    function isDead(uint256 _rng, uint256 _index) external pure returns (bool);
}
