// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PlatformInterface
/// @author BuiltByFrancis
/// @notice A generic contract used for fee collection, referral, and reward distribution.
contract PlatformInterface is Ownable {
    uint256 private constant DENOMINATOR = 10000;
    address private constant NATIVE = address(0);

    // #######################################################################################

    error InvalidValueError();
    error ReservedIndexError();
    error AlreadyReferredError();
    error FailedToSendNativeError();

    event PlatformSet(address indexed platform);
    event StartSeason(uint64 indexed season, address[] gamemodes);

    event Referral(address indexed user, address indexed referrer);
    event ReferralRewardSet(uint256 indexed index, uint256 numerator);

    event RewardEarned(address indexed user, address indexed token, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);

    // #######################################################################################

    address private _platform;
    uint64 private _season;

    mapping(address => address) private _referredBy;
    mapping(uint256 => uint256) private _referralReward;

    mapping(address => mapping(address => uint256)) private _tokenUserRewards;

    // #######################################################################################

    /// @notice Constructor.
    /// @param platform_ The platform wallet for fee collection.
    /// @param owner_ The initial owner of the contract.
    constructor(address platform_, address owner_) Ownable(owner_) {
        _setPlatform(platform_);

        _setReferralReward(0, 1500); // 15%
        _setReferralReward(1, 500); // 5%
    }

    // #######################################################################################

    /// @notice Returns the next season number.
    function getNextSeason() external view returns (uint64) {
        return _season;
    }

    /// @notice Returns the current platform address.
    function getPlatform() external view returns (address) {
        return _platform;
    }

    /// @notice Returns the referrer of a user, address(0) is returned if they do not have one.
    function getReferredBy(address _user) external view returns (address) {
        return _referredBy[_user];
    }

    /// @notice Returns the referral reward numerator for a given index.
    function getReferralReward(uint256 _index) external view returns (uint256) {
        return _referralReward[_index];
    }

    /// @notice Returns the reward for a user in a specific token.
    function getReward(address _token, address _user) external view returns (uint256) {
        return _tokenUserRewards[_token][_user];
    }

    /// @notice Returns the rewards for a list of tokens for a specific user.
    function getRewards(address[] calldata tokens, address _user) external view returns (uint256[] memory) {
        uint256[] memory rewards = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            rewards[i] = _tokenUserRewards[tokens[i]][_user];
        }
        return rewards;
    }

    // #######################################################################################

    /// @notice Starts a new season.
    /// @param _gamemodes The list of game contracts tracked in this season.
    function startSeason(address[] calldata _gamemodes) external onlyOwner {
        emit StartSeason(_season, _gamemodes);
        unchecked {
            _season++;
        }
    }

    /// @notice Sets the platform address.
    /// @param platform_ The new platform address.
    function setPlatform(address platform_) external onlyOwner {
        _setPlatform(platform_);
    }

    /// @notice Sets the referral reward numerator for a given index.
    /// @param _index The index of the referral reward.
    /// @param _numerator The numerator for the referral reward, must be less than or equal to DENOMINATOR.
    /// @dev It is the callers responsibility to ensure the sum of all numerators does not exceed DENOMINATOR.
    function setReferralReward(uint256 _index, uint256 _numerator) external onlyOwner {
        if (_numerator > DENOMINATOR) revert InvalidValueError();

        _setReferralReward(_index, _numerator);
    }

    // #######################################################################################

    /// @notice Sets the referrer for the caller. The referrer must not be the caller, must not be address(0), and must not create a cycle.
    /// @param _referrer The address of the referrer.
    /// @dev This function can only be called once per user. If the user already has a referrer, it will revert.
    function setReferredBy(address _referrer) external {
        if (_referrer == address(0) || _referrer == msg.sender || _isCyclical(_referrer)) revert InvalidValueError();
        if (_referredBy[msg.sender] != address(0)) revert AlreadyReferredError();

        _referredBy[msg.sender] = _referrer;
        emit Referral(msg.sender, _referrer);
    }

    /// @notice Claims rewards for the caller in a list of tokens.
    /// @param _tokens The list of token addresses for which to claim rewards.
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

    /// @notice Receives tokens from the caller and sets up the rewards.
    /// @param _token The address of the token to receive.
    /// @param _value The amount of tokens to receive. Must be non-zero.
    function receiveToken(address _token, uint256 _value) external {
        if (_value == 0) revert InvalidValueError();

        SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _value);
        _setupRewards(_token, _value);
    }

    /// @notice Receives native currency from the caller and sets up rewards.
    /// @dev This function can only be called with a non-zero value.
    receive() external payable {
        if (msg.value == 0) revert InvalidValueError();

        _setupRewards(NATIVE, msg.value);
    }

    // #######################################################################################

    function _setPlatform(address platform_) private {
        _platform = platform_;
        emit PlatformSet(_platform);
    }

    function _setReferralReward(uint256 _index, uint256 _numerator) private {
        _referralReward[_index] = _numerator;
        emit ReferralRewardSet(_index, _numerator);
    }

    function _setupRewards(address _token, uint256 _value) private {
        // Find the number of referrers (depth) for the caller.
        uint256 depth = _getDepth(msg.sender);

        // Find the referrers and their corresponding numerators.
        address[] memory referrers = _getReferrers(msg.sender, depth);
        uint256[] memory numerators = _getNumerators(depth);

        // Assign rewards to the referrers.
        uint256 remainder = _value;
        for (uint256 i = 0; i < depth; i++) {
            uint256 reward = (_value * numerators[i]) / DENOMINATOR;

            remainder -= reward;

            _tokenUserRewards[_token][referrers[i]] += reward;
            emit RewardEarned(referrers[i], _token, reward);
        }

        // Assign the remaining value to the platform.
        if (remainder > 0) {
            _tokenUserRewards[_token][_platform] += remainder;
            emit RewardEarned(_platform, _token, remainder);
        }
    }

    function _getDepth(address _user) private view returns (uint256) {
        uint256 depth = 0;

        address referrer = _referredBy[_user];
        // Count how many referrers there are until we reach address(0) or a referrer with no reward.
        while (referrer != address(0) && _referralReward[depth] > 0) {
            referrer = _referredBy[referrer];
            unchecked {
                depth++;
            }
        }

        return depth;
    }

    function _getNumerators(uint256 _depth) private view returns (uint256[] memory) {
        uint256[] memory numerators = new uint256[](_depth);

        for (uint256 i = 0; i < _depth; i++) {
            numerators[i] = _referralReward[i];
        }

        return numerators;
    }

    function _getReferrers(address _user, uint256 _depth) private view returns (address[] memory) {
        address[] memory receivers = new address[](_depth);

        address referrer = _referredBy[_user];
        for (uint256 i = 0; i < _depth; i++) {
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
