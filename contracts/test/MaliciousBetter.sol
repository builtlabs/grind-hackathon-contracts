// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HashCrash } from "../HashCrash.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MaliciousBetter {
    HashCrash public game;

    constructor(HashCrash _game) {
        game = _game;
    }

    function multiBet(uint256 _bets, uint256 _totalAmount, uint64 _cashoutIndex) external payable {
        uint256 amount = _totalAmount / _bets;
        for (uint256 i = 0; i < _bets; i++) {
            game.placeBet(amount, _cashoutIndex);
        }
    }

    function multiCancel(uint256[] calldata _bets) external {
        for (uint256 i = 0; i < _bets.length; i++) {
            game.cancelBet(_bets[i]);
        }
    }

    function approve(IERC20 _token, uint256 _amount) external {
        _token.approve(address(game), _amount);
    }
}
