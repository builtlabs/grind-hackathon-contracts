// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";
import { ILootTable } from "../interfaces/ILootTable.sol";
import { ERC20Holder } from "../currency/ERC20Holder.sol";

/// @title HashCrashERC20
/// @author @builtbyfrancis
contract HashCrashERC20 is HashCrash, ERC20Holder {
    constructor(
        ILootTable lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        address owner_,
        address token_
    ) HashCrash(lootTable_, genesisHash_, hashProducer_, owner_) ERC20Holder(token_) {}
}
