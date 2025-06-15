// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";
import { ERC20Holder } from "../currency/ERC20Holder.sol";

/// @title HashCrashERC20
/// @notice A hashcrash implementation using a given ERC20 Token.
contract HashCrashERC20 is HashCrash, ERC20Holder {
    constructor(
        address lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        uint128 lowLiquidityThreshold_,
        uint256 minimumValue_,
        address owner_,
        address token_
    )
        HashCrash(lootTable_, genesisHash_, hashProducer_, lowLiquidityThreshold_, minimumValue_, owner_)
        ERC20Holder(token_)
    {}
}
