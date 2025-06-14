// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Liquidity } from "../liquidity/Liquidity.sol";
import { ERC20Holder } from "../currency/ERC20Holder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityHarness is Liquidity, ERC20Holder {
    event OnLowLiquidity();

    bool public canChangeLiquidity;
    uint64 public round;

    // #######################################################################################

    constructor(
        uint128 lowLiquidityThreshold_,
        uint256 minimumValue_,
        address token_
    ) Liquidity(lowLiquidityThreshold_, minimumValue_) ERC20Holder(token_) Ownable(msg.sender) {
        round = 1;
    }

    // #######################################################################################

    function fillLiquidityQueue(uint256 _amount, uint256 _queueLength) external {
        bool prev = canChangeLiquidity;
        canChangeLiquidity = false;

        for (uint256 i = 0; i < _queueLength; i++) {
            (bool success, bytes memory data) = address(this).delegatecall(
                abi.encodeWithSignature("deposit(uint256)", _amount, i)
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

            round++;
        }

        canChangeLiquidity = prev;
    }

    function getMockRound() external view returns (uint64) {
        return round;
    }

    function mockRound(uint64 _round) external {
        round = _round;
    }

    function mockLoss(uint256 _amount) external {
        _sendValue(msg.sender, _amount);
    }

    function mockCanChangeLiquidity(bool _value) external {
        canChangeLiquidity = _value;
    }

    function clearLiquidityQueue() external {
        _clearLiquidityQueue();
    }

    function useRoundLiquidity(uint256 _amount) external {
        _useRoundLiquidity(_amount);
    }

    function releaseRoundLiquidity(uint256 _amount) external {
        _releaseRoundLiquidity(_amount);
    }

    // #######################################################################################

    function _canChangeLiquidity() internal view override returns (bool) {
        return canChangeLiquidity;
    }

    function _getRound() internal view override returns (uint64) {
        return round;
    }

    function _onLowLiquidity() internal override {
        emit OnLowLiquidity();
        super._onLowLiquidity();
    }
}
