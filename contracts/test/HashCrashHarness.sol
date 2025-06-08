// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";
import { ILootTable } from "../interfaces/ILootTable.sol";
import { ERC20Holder } from "../currency/ERC20Holder.sol";

contract HashCrashHarness is HashCrash, ERC20Holder {
    constructor(
        ILootTable lootTable_,
        bytes32 genesisHash_,
        address hashProducer_,
        uint128 lowLiquidityThreshold_,
        address owner_,
        address token_
    ) HashCrash(lootTable_, genesisHash_, hashProducer_, lowLiquidityThreshold_, owner_) ERC20Holder(token_) {}

    function betOnAll(uint256 _amount, uint256 _length) external {
        for (uint256 i = 0; i < _length; i++) {
            (bool success, bytes memory data) = address(this).delegatecall(
                abi.encodeWithSignature("placeBet(uint256,uint64)", _amount, i)
            );

            if (!success) {
                if (data.length > 0) {
                    assembly {
                        revert(add(data, 32), mload(data))
                    }
                } else {
                    revert("Bet failed with no reason");
                }
            }
        }
    }

    function callOnLowLiquidity() external {
        _onLowLiquidity();
    }
}
