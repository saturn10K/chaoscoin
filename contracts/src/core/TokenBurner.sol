// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ChaosToken.sol";

contract TokenBurner is Ownable {
    ChaosToken public chaosToken;

    mapping(uint8 => uint256) public burnsBySource;
    uint256 public cumulativeBurned;
    mapping(address => bool) public authorizedBurners;

    error NotAuthorized();

    event BurnRecorded(uint256 amount, uint8 source);
    event BurnerAuthorized(address indexed burner, bool authorized);

    constructor(address _chaosToken) Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
    }

    modifier onlyAuthorized() {
        if (!authorizedBurners[msg.sender]) revert NotAuthorized();
        _;
    }

    function setAuthorizedBurner(address burner, bool authorized) external onlyOwner {
        authorizedBurners[burner] = authorized;
        emit BurnerAuthorized(burner, authorized);
    }

    /// @notice Record a burn that was performed by the calling contract.
    /// The caller is responsible for actually burning via ChaosToken.burn().
    /// This function only tracks accounting.
    function recordBurn(uint256 amount, uint8 source) external onlyAuthorized {
        burnsBySource[source] += amount;
        cumulativeBurned += amount;
        emit BurnRecorded(amount, source);
    }
}
