// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/Constants.sol";

contract ChaosToken is ERC20, ERC20Burnable, Ownable {
    uint256 public totalMinted;
    uint256 public totalBurned;
    address public minter;

    error OnlyMinter();
    error ExceedsCirculatingCap();
    error MinterAlreadySet();

    event MinterSet(address indexed minter);

    constructor() ERC20("Chaoscoin", "CHAOS") Ownable(msg.sender) {}

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
        emit MinterSet(_minter);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        if (totalSupply() + amount > Constants.CIRCULATING_CAP) {
            revert ExceedsCirculatingCap();
        }
        totalMinted += amount;
        _mint(to, amount);
    }

    function burn(uint256 amount) public override {
        super.burn(amount);
        totalBurned += amount;
    }

    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
        totalBurned += amount;
    }
}
