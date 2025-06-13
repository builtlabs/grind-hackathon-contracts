// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ValueHolder } from "./ValueHolder.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ERC20Holder
/// @notice An implementation of the ValueHolder contract for a given ERC20 token.
abstract contract ERC20Holder is ValueHolder {
    IERC20 private immutable _token;

    // #######################################################################################

    constructor(address token_) {
        _token = IERC20(token_);
    }

    // #######################################################################################

    /// @notice Returns the address of the ERC20 token used by this contract.
    function token() external view returns (address) {
        return address(_token);
    }

    // #######################################################################################

    function _getBalance() internal view override returns (uint256) {
        return _token.balanceOf(address(this));
    }

    function _receiveValue(address _from, uint256 _value) internal override {
        SafeERC20.safeTransferFrom(_token, _from, address(this), _value);
    }

    function _sendValue(address _to, uint256 _value) internal override hasAvailableBalance(_value) {
        SafeERC20.safeTransfer(_token, _to, _value);
    }
}
