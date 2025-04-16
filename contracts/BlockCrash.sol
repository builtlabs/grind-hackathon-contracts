// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BlockCrash
/// @author @builtbyfrancis
contract BlockCrash {
    uint256 public constant MULTIPLIER_DENOMINATOR = 1e6;
    uint256 public constant PROBABILITY_DENOMINATOR = 1e18;

    uint64 public constant ROUND_LENGTH = 50;
    uint64 public constant ROUND_BUFFER = 20;

    address public immutable RUNNER;
    IERC20 public immutable GRIND;

    // #######################################################################################

    error ZeroAmountError();
    error InvalidBlockError();
    error InvalidActionError();
    error InvalidSenderError();
    error InvalidAccessError();
    error InvalidCashoutError();

    error BetsClosedError();
    error BetTooLargeError();
    error NotYourBetError();

    error GameNotStartedError();
    error GameNotOverError();
    error GameOverError();

    // #######################################################################################

    event LiquidityChangeQueued(uint8 indexed action, address indexed user, uint256 amount);
    event LiquidityAdded(address indexed user, uint256 tokenDelta, uint256 shareDelta);
    event LiquidityRemoved(address indexed user, uint256 tokenDelta, uint256 shareDelta);

    // #######################################################################################

    struct User {
        uint256 shares;
    }

    struct Bet {
        uint256 amount;
        address user;
        uint64 cashoutIndex;
    }

    struct LiquidityDelta {
        uint8 action; // 0 = add, 1 = remove
        address user;
        uint256 amount;
    }

    // #######################################################################################

    uint256 private _totalShares;

    uint256 private _roundLiquidity;
    uint64 private _roundStartBlock;

    mapping(address => User) private _users;

    LiquidityDelta[] private _liquidityQueue;
    Bet[] private _bets;

    uint32[] private _history; // TODO: move onto graph

    // #######################################################################################

    modifier NotZero(uint256 _amount) {
        if (_amount == 0) revert ZeroAmountError();
        _;
    }

    modifier OnlyRunner() {
        if (msg.sender != RUNNER) revert InvalidSenderError();
        _;
    }

    // #######################################################################################

    constructor(IERC20 grind_, address runner_) {
        GRIND = grind_;
        RUNNER = runner_;
    }

    // #######################################################################################

    function getHistory(uint256 _start, uint256 _stop) external view returns (uint32[] memory) {
        if (_start > _stop) revert InvalidAccessError();
        if (_stop > _history.length) revert InvalidAccessError();

        uint256 length = _stop - _start;
        uint32[] memory history = new uint32[](length);

        for (uint256 i = 0; i < length; i++) {
            history[i] = _history[_start + i];
        }

        return history;
    }

    function getBets() external view returns (Bet[] memory) {
        return _bets;
    }

    function getBetsFor(address _user) external view returns (Bet[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < _bets.length; i++) {
            if (_bets[i].user == _user) {
                count++;
            }
        }

        Bet[] memory userBets = new Bet[](count);

        count = 0;
        for (uint256 i = 0; i < _bets.length; i++) {
            if (_bets[i].user == _user) {
                userBets[count] = _bets[i];
                count++;
            }
        }

        return userBets;
    }

    function getRoundInfo() external view returns (uint256 c, uint256 sb, uint256 lq) {
        return (_history.length, _roundStartBlock, _roundLiquidity);
    }

    function getTotalShares() external view returns (uint256) {
        return _totalShares;
    }

    function getShares(address _user) external view returns (uint256) {
        return _users[_user].shares;
    }

    function getLiquidityQueue() external view returns (LiquidityDelta[] memory) {
        return _liquidityQueue;
    }

    // #######################################################################################

    // TODO: Do we want a cancel bet? Kinda annoying with the array but is possible

    function placeBet(uint256 _amount, uint64 _autoCashout) external NotZero(_amount) {
        // Start the round if it hasn't started yet
        if (_roundStartBlock == 0) {
            _roundStartBlock = uint64(block.number) + ROUND_BUFFER;
        }

        // Ensure the bet is valid
        if (ROUND_LENGTH <= _autoCashout) revert InvalidCashoutError();
        if (_roundStartBlock <= block.number) revert BetsClosedError();

        // Store the funds
        SafeERC20.safeTransferFrom(GRIND, msg.sender, address(this), _amount);

        // Reduce the _roundLiquidity by the amount of the bet
        uint256 maxWin = (_amount * _multiplier(_autoCashout)) / MULTIPLIER_DENOMINATOR;
        if (maxWin > _roundLiquidity) {
            revert BetTooLargeError();
        }

        unchecked {
            _roundLiquidity -= maxWin;
        }

        // Store the bet
        _bets.push(Bet(_amount, msg.sender, _autoCashout));
    }

    function cashEarly(uint256 _index) external {
        Bet storage bet = _bets[_index];
        uint64 _bn = uint64(block.number);

        // Ensure the caller owns the bet
        if (bet.user != msg.sender) revert NotYourBetError();

        // Ensure the game has started
        if (_bn < _roundStartBlock) revert GameNotStartedError();

        // Ensure the game is still running
        uint64 blockIndex = _bn - _roundStartBlock;

        if (blockIndex > bet.cashoutIndex || _roundIsOver(_roundDeadBlock())) revert GameOverError();

        // Update the cashout
        bet.cashoutIndex = blockIndex;
    }

    function reset() external OnlyRunner {
        // Ensure the game can be reset
        if (_roundStartBlock > 0) {
            uint64 deadBlock = _roundDeadBlock();

            if (!_roundIsOver(deadBlock)) revert GameNotOverError();

            uint64 deadIndex = deadBlock == 0 ? ROUND_LENGTH : deadBlock - _roundStartBlock;
            _history.push(uint32(deadIndex == 0 ? 0 : _multiplier(deadIndex - 1)));

            _processBets(deadIndex);
            _roundStartBlock = 0;
        }

        // Clean up queues
        _processLiquidityQueue();

        // Reset round state
        _roundLiquidity = (GRIND.balanceOf(address(this)) * 40) / 100; // 40% of LP risked per round
    }

    function queueLiquidityChange(uint8 _action, uint256 _amount) external NotZero(_amount) {
        if (_action > 1) revert InvalidActionError();

        _liquidityQueue.push(LiquidityDelta(_action, msg.sender, _amount));
        emit LiquidityChangeQueued(_action, msg.sender, _amount);
    }

    // #######################################################################################

    function _processBets(uint64 _deadIndex) private {
        for (uint256 i = 0; i < _bets.length; i++) {
            Bet storage bet = _bets[i];

            if (bet.cashoutIndex < _deadIndex) {
                uint256 winAmount = (bet.amount * _multiplier(bet.cashoutIndex)) / MULTIPLIER_DENOMINATOR;
                SafeERC20.safeTransfer(GRIND, bet.user, winAmount);
            }
        }

        delete _bets;
    }

    function _processLiquidityQueue() private {
        uint256 _balance = GRIND.balanceOf(address(this));

        for (uint256 i = 0; i < _liquidityQueue.length; i++) {
            LiquidityDelta memory delta = _liquidityQueue[i];

            if (delta.action == 0) {
                _balance += _addLiquidity(delta.user, delta.amount, _balance);
            } else {
                _balance -= _removeLiquidity(delta.user, delta.amount, _balance);
            }
        }

        delete _liquidityQueue;
    }

    function _addLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        if (GRIND.balanceOf(_user) < _amount || GRIND.allowance(_user, address(this)) < _amount) {
            return 0;
        }

        SafeERC20.safeTransferFrom(GRIND, _user, address(this), _amount);

        uint256 newShares = _totalShares == 0 ? _amount : (_amount * _totalShares) / _balance;
        unchecked {
            _users[_user].shares += newShares;
            _totalShares += newShares;
        }

        emit LiquidityAdded(_user, _amount, newShares);

        return _amount;
    }

    function _removeLiquidity(address _user, uint256 _amount, uint256 _balance) private returns (uint256) {
        User storage user = _users[_user];

        if (user.shares < _amount) {
            return 0;
        }

        uint256 withdrawAmount = (_amount * _balance) / _totalShares;

        unchecked {
            user.shares -= _amount;
            _totalShares -= _amount;
        }

        SafeERC20.safeTransfer(GRIND, _user, withdrawAmount);

        emit LiquidityRemoved(_user, withdrawAmount, _amount);

        return withdrawAmount;
    }

    // #######################################################################################

    function _getRNG(uint256 _index) internal view virtual returns (uint256) {
        return uint256(blockhash(_index));
    }

    // #######################################################################################

    function _roundIsOver(uint64 _deadBlock) private view returns (bool) {
        return block.number >= _roundStartBlock + ROUND_LENGTH || _deadBlock > 0;
    }

    function _roundDeadBlock() private view returns (uint64) {
        uint64 _max = _roundStartBlock + ROUND_LENGTH;
        return _findDeadHash(_roundStartBlock, _max < block.number ? _max : uint64(block.number));
    }

    function _findDeadHash(uint64 _startBlock, uint64 _endBlock) private view returns (uint64) {
        for (uint64 i = _startBlock; i < _endBlock; i++) {
            if (_hashIsDead(uint256(_getRNG(i)), i - _startBlock)) {
                return i;
            }
        }

        return 0;
    }

    function _hashIsDead(uint256 _rng, uint256 _index) private pure returns (bool) {
        return _rng % PROBABILITY_DENOMINATOR < _probability(_index);
    }

    function _multiplier(uint256 _index) private pure returns (uint256) {
        return
            [
                500000,
                750000,
                1000000,
                1250000,
                1500000,
                2000000,
                2500000,
                3000000,
                4000000,
                5000000,
                6000000,
                7000000,
                9000000,
                10000000,
                12500000,
                15000000,
                17500000,
                20000000,
                22500000,
                25000000,
                27500000,
                30000000,
                32500000,
                35000000,
                37500000,
                40000000,
                42500000,
                45000000,
                47500000,
                50000000,
                52500000,
                55000000,
                57500000,
                60000000,
                62500000,
                65000000,
                67500000,
                70000000,
                72500000,
                75000000,
                77500000,
                80000000,
                82500000,
                85000000,
                87500000,
                90000000,
                92500000,
                95000000,
                97500000,
                100000000
            ][_index];
    }

    function _probability(uint256 _index) private pure returns (uint256) {
        return
            [
                10000000000000008,
                10101010101010056,
                10204081632653072,
                199999999999999968,
                166752577319587712,
                249922672440457728,
                199999999999999968,
                166752577319587712,
                249922672440457728,
                199999999999999968,
                167010309278350592,
                142945544554455296,
                222382671480144448,
                99350046425255360,
                199999999999999968,
                167525773195876256,
                142414860681114640,
                124548736462093856,
                111340206185567056,
                99767981438515056,
                92783505154639184,
                82386363636363648,
                77399380804953680,
                70469798657718184,
                68592057761732824,
                62015503875968992,
                57851239669421408,
                57017543859649192,
                51162790697674264,
                49019607843137304,
                51546391752577360,
                43478260869565192,
                45454545454545528,
                41666666666666632,
                37267080745341576,
                38709677419354824,
                40268456375838872,
                34965034965035004,
                36231884057971064,
                30075187969924812,
                31007751937984440,
                32000000000000028,
                33057851239669312,
                25641025641025660,
                35087719298245724,
                27272727272727228,
                28037383177570096,
                19230769230769164,
                29411764705882360,
                20202020202020220
            ][_index];
    }
}
