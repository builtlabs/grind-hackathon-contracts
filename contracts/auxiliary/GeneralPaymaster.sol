// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPaymasterFlow } from "@matterlabs/zksync-contracts/contracts/l2-contracts/interfaces/IPaymasterFlow.sol";
import { IPaymaster, ExecutionResult, PAYMASTER_VALIDATION_SUCCESS_MAGIC } from "@matterlabs/zksync-contracts/contracts/l2-contracts/interfaces/IPaymaster.sol";
import { BOOTLOADER_ADDRESS, Transaction } from "@matterlabs/zksync-contracts/contracts/l2-contracts/L2ContractHelper.sol";

/// @title GeneralPaymaster
/// @author BuiltByFrancis
/// @notice A general paymaster implementing the ZK IPaymaster, with basic transaction validation.
contract GeneralPaymaster is IPaymaster, Ownable {
    error NotBootloader();
    error BlockedSender();
    error BlockedDestination();
    error InvalidPaymasterInput();
    error FailedToTransferEther();

    event FromBlockedSet(address indexed from, bool blocked);
    event ToAllowedSet(address indexed to, bool allowed);

    // #######################################################################################

    /// @dev By default, all senders are allowed.
    mapping(address => bool) private _fromBlocked;

    /// @dev By default, all destinations are blocked.
    mapping(address => bool) private _toAllowed;

    // #######################################################################################

    modifier onlyBootloader() {
        if (msg.sender != BOOTLOADER_ADDRESS) revert NotBootloader();
        _;
    }

    // #######################################################################################

    /// @notice Constructor initializes the contract with the given parameters.
    /// @param allowedTargets_ The initial allow list for transaction.to values.
    /// @param owner_ The owner of the contract.
    constructor(address[] memory allowedTargets_, address owner_) Ownable(owner_) {
        for (uint256 i = 0; i < allowedTargets_.length; i++) {
            _setAllowedTo(allowedTargets_[i], true);
        }
    }

    // #######################################################################################

    /// @notice Returns whether a from address will be blocked.
    function fromAddressIsBlocked(address _from) external view returns (bool) {
        return _fromBlocked[_from];
    }

    /// @notice Returns whether a to address is allowed.
    function toAddressIsAllowed(address _to) external view returns (bool) {
        return _toAllowed[_to];
    }

    // #######################################################################################

    /// @notice Sets the allowed status for a specific destination address.
    /// @param _to The destination address to set the allowed status for.
    /// @param _allowed The allowed status to set for the destination address.
    function setAllowedTo(address _to, bool _allowed) external onlyOwner {
        _setAllowedTo(_to, _allowed);
    }

    /// @notice Sets the blocked status for a specific sender address.
    /// @param _from The sender address to set the blocked status for.
    /// @param _blocked The blocked status to set for the sender address.
    function setBlockedFrom(address _from, bool _blocked) external onlyOwner {
        _setBlockedFrom(_from, _blocked);
    }

    /// @notice Withdraws a specified amount of Ether from the contract to the owner's address.
    /// @param _amount The amount of Ether to withdraw.
    function withdraw(uint256 _amount) external onlyOwner {
        _sendEther(payable(owner()), _amount);
    }

    /// @notice Withdraws all Ether from the contract to the owner's address.
    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        _sendEther(payable(owner()), balance);
    }

    // #######################################################################################

    /// @inheritdoc IPaymaster
    function validateAndPayForPaymasterTransaction(
        bytes32, // _txHash
        bytes32, // _suggestedSignedHash
        Transaction calldata _transaction
    ) external payable onlyBootloader returns (bytes4 magic, bytes memory context) {
        magic = PAYMASTER_VALIDATION_SUCCESS_MAGIC;
        context = new bytes(0); // No context is needed for this paymaster.

        if (_fromBlocked[address(uint160(_transaction.from))]) {
            revert BlockedSender();
        }

        if (!_toAllowed[address(uint160(_transaction.to))]) {
            revert BlockedDestination();
        }

        if (
            _transaction.paymasterInput.length < 4 ||
            bytes4(_transaction.paymasterInput[0:4]) != IPaymasterFlow.general.selector
        ) {
            revert InvalidPaymasterInput();
        }

        _sendEther(payable(BOOTLOADER_ADDRESS), _transaction.gasLimit * _transaction.maxFeePerGas);
    }

    /// @inheritdoc IPaymaster
    function postTransaction(
        bytes calldata _context,
        Transaction calldata _transaction,
        bytes32 _txHash,
        bytes32 _suggestedSignedHash,
        ExecutionResult _txResult,
        uint256 _maxRefundedGas
    ) external payable onlyBootloader {}

    // #######################################################################################

    receive() external payable {}

    // #######################################################################################

    function _setAllowedTo(address _to, bool _allowed) private {
        _toAllowed[_to] = _allowed;
        emit ToAllowedSet(_to, _allowed);
    }

    function _setBlockedFrom(address _from, bool _blocked) private {
        _fromBlocked[_from] = _blocked;
        emit FromBlockedSet(_from, _blocked);
    }

    function _sendEther(address payable _to, uint256 _amount) private {
        (bool success, ) = _to.call{ value: _amount }("");
        if (!success) revert FailedToTransferEther();
    }
}
