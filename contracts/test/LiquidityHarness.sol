// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Liquidity } from "../liquidity/Liquidity.sol";
import { ERC20Holder } from "../currency/ERC20Holder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityHarness is Liquidity, ERC20Holder {
    bool public canChangeLiquidity;

    // #######################################################################################

    constructor(address _token) Liquidity() ERC20Holder(_token) Ownable(msg.sender) {}

    // #######################################################################################

    function harnessGetStagedBalance() external view returns (uint256) {
        return _readSlot(2);
    }

    function harnessGetAvailableLiquidity() external view returns (uint256) {
        return _getRoundLiquidity();
    }

    // #######################################################################################

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

    function _readSlot(uint256 _s) private view returns (uint256 result) {
        assembly {
            result := sload(_s)
        }
    }
}
