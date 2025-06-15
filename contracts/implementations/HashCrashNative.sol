// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";
import { NativeHolder } from "../currency/NativeHolder.sol";

/// @title HashCrashNative
/// @notice A hashcrash implementation using the chains native token.
contract HashCrashNative is HashCrash, NativeHolder {
    constructor(
        address lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        uint128 lowLiquidityThreshold_,
        uint256 minimumValue_,
        address owner_
    )
        HashCrash(lootTable_, genesisHash_, hashProducer_, lowLiquidityThreshold_, minimumValue_, owner_)
        NativeHolder()
    {}
}
