// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PlatformInterface
/// @author @builtbyfrancis
contract PlatformInterface is Ownable {
    uint256 private constant DENOMINATOR = 10000;
    address private constant NATIVE = address(0);

    // #######################################################################################

    error InvalidValueError();
    error ReservedIndexError();
    error AlreadyReferredError();
    error FailedToSendNativeError();

    event PlatformSet(address indexed platform);

    event Referral(address indexed user, address indexed referrer);
    event ReferralRewardSet(uint256 indexed level, uint256 bps);

    event RewardEarned(address indexed user, address indexed token, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);

    // #######################################################################################

    address private _platform;

    mapping(address => address) private _referredBy;
    mapping(uint256 => uint256) private _referralBPS;

    mapping(address => mapping(address => uint256)) private _tokenUserRewards;

    // #######################################################################################

    constructor(address platform_, address owner_) Ownable(owner_) {
        _platform = platform_;
        emit PlatformSet(platform_);

        _referralBPS[1] = 1500; // 15%
        emit ReferralRewardSet(1, 1500);

        _referralBPS[2] = 500; // 5%
        emit ReferralRewardSet(2, 500);
    }

    // #######################################################################################

    function getPlatform() external view returns (address) {
        return _platform;
    }

    function getReferredBy(address _user) external view returns (address) {
        return _referredBy[_user];
    }

    function getReferralBPS(uint256 _index) external view returns (uint256) {
        return _referralBPS[_index];
    }

    function getReward(address _token, address _user) external view returns (uint256) {
        return _tokenUserRewards[_token][_user];
    }

    function getRewards(address[] calldata tokens, address _user) external view returns (uint256[] memory) {
        uint256[] memory rewards = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            rewards[i] = _tokenUserRewards[tokens[i]][_user];
        }
        return rewards;
    }

    // #######################################################################################

    function setPlatform(address platform_) external onlyOwner {
        _platform = platform_;
        emit PlatformSet(platform_);
    }

    function setReferralBPS(uint256 _index, uint256 _bps) external onlyOwner {
        if (_index == 0) revert ReservedIndexError();
        if (_bps > DENOMINATOR) revert InvalidValueError();

        _referralBPS[_index] = _bps;
        emit ReferralRewardSet(_index, _bps);
    }

    // #######################################################################################

    function setReferredBy(address _referrer) external {
        if (_referrer == address(0) || _referrer == msg.sender || _isCyclical(_referrer)) revert InvalidValueError();
        if (_referredBy[msg.sender] != address(0)) revert AlreadyReferredError();

        _referredBy[msg.sender] = _referrer;
        emit Referral(msg.sender, _referrer);
    }

    function claimRewards(address[] calldata _tokens) external {
        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            uint256 reward = _tokenUserRewards[token][msg.sender];

            if (reward > 0) {
                _tokenUserRewards[token][msg.sender] = 0;

                if (token == NATIVE) {
                    (bool success, ) = payable(msg.sender).call{ value: reward }("");
                    if (!success) revert FailedToSendNativeError();
                } else {
                    SafeERC20.safeTransfer(IERC20(token), msg.sender, reward);
                }

                emit RewardClaimed(msg.sender, token, reward);
            }
        }
    }

    // #######################################################################################

    function receiveToken(address _token, uint256 _value) external {
        SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _value);
        _setupRewards(_token, _value);
    }

    receive() external payable {
        _setupRewards(NATIVE, msg.value);
    }

    // #######################################################################################

    function _setupRewards(address _token, uint256 _value) private {
        uint256 depth = _getDepth(msg.sender);

        uint256[] memory numerators = _getNumerators(depth);
        address[] memory receivers = _getReceivers(msg.sender, depth);

        for (uint256 i = 0; i < depth; i++) {
            uint256 reward = (_value * numerators[i]) / DENOMINATOR;
            _tokenUserRewards[_token][receivers[i]] += reward;
            emit RewardEarned(receivers[i], _token, reward);
        }
    }

    function _getDepth(address user) private view returns (uint256) {
        uint256 depth = 1; // Start with the platform.

        address referrer = _referredBy[user];
        while (referrer != address(0) && _referralBPS[depth] > 0) {
            referrer = _referredBy[referrer];
            unchecked {
                depth++;
            }
        }

        return depth;
    }

    function _getNumerators(uint256 _depth) private view returns (uint256[] memory) {
        uint256[] memory numerators = new uint256[](_depth);
        uint256 remainder = DENOMINATOR;

        for (uint256 i = 1; i < _depth; i++) {
            numerators[i] = _referralBPS[i];

            unchecked {
                remainder -= numerators[i];
            }
        }

        numerators[0] = remainder;

        return numerators;
    }

    function _getReceivers(address user, uint256 _depth) private view returns (address[] memory) {
        address[] memory receivers = new address[](_depth);
        receivers[0] = _platform;

        address referrer = _referredBy[user];
        for (uint256 i = 1; i < _depth; i++) {
            receivers[i] = referrer;
            referrer = _referredBy[referrer];
        }

        return receivers;
    }

    function _isCyclical(address _referrer) private view returns (bool) {
        address current = _referrer;
        while (current != address(0)) {
            if (current == msg.sender) {
                return true;
            }
            current = _referredBy[current];
        }
        return false;
    }
}
