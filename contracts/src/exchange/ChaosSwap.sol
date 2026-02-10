// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChaosSwap
 * @notice Two-way swap between in-game pCHAOS (210B supply) and the
 *         nad.fun $CHAOS (1B supply) at a fixed 210:1 rate.
 *
 *         210 pCHAOS = 1 $CHAOS (and vice-versa).
 *
 *         Separate fee rates per direction. Fees are sent to the treasury.
 */
contract ChaosSwap is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable gameChaos;   // In-game pCHAOS (210B supply)
    IERC20 public immutable nadChaos;    // nad.fun $CHAOS (1B supply)
    address public treasury;

    uint256 public constant RATE = 210;  // 210 pCHAOS = 1 $CHAOS

    uint256 public feeToNadBps;          // Fee for pCHAOS → $CHAOS (basis points)
    uint256 public feeToGameBps;         // Fee for $CHAOS → pCHAOS (basis points)
    bool    public paused;

    uint256 public totalSwappedToNad;    // Cumulative $CHAOS out
    uint256 public totalSwappedToGame;   // Cumulative pCHAOS out
    uint256 public totalFeeCollected;    // Cumulative fee sent to treasury

    // ─── Events ──────────────────────────────────────────────────────────
    event SwapToNad(address indexed user, uint256 amountIn, uint256 amountOut, uint256 fee);
    event SwapToGame(address indexed user, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeesUpdated(uint256 toNadBps, uint256 toGameBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event Paused(bool state);
    event ReserveDeposited(address indexed token, uint256 amount);
    event ReserveWithdrawn(address indexed token, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────
    error SwapPaused();
    error ZeroAmount();
    error InsufficientReserve();
    error FeeTooHigh();
    error NotDivisibleByRate();
    error ZeroAddress();

    constructor(address _gameChaos, address _nadChaos, address _treasury) Ownable(msg.sender) {
        gameChaos = IERC20(_gameChaos);
        nadChaos  = IERC20(_nadChaos);
        treasury  = _treasury;
    }

    // ─── Swap: pCHAOS -> $CHAOS (210 pCHAOS → 1 $CHAOS) ────────────────
    function swapToNad(uint256 gameAmount) external {
        if (paused) revert SwapPaused();
        if (gameAmount == 0) revert ZeroAmount();
        if (gameAmount % RATE != 0) revert NotDivisibleByRate();

        uint256 nadOut = gameAmount / RATE;
        uint256 fee = (nadOut * feeToNadBps) / 10_000;
        uint256 nadNet = nadOut - fee;

        if (nadChaos.balanceOf(address(this)) < nadOut) revert InsufficientReserve();

        // Pull pCHAOS from user
        gameChaos.safeTransferFrom(msg.sender, address(this), gameAmount);

        // Send $CHAOS to user
        nadChaos.safeTransfer(msg.sender, nadNet);

        // Send fee to treasury
        if (fee > 0) {
            nadChaos.safeTransfer(treasury, fee);
            totalFeeCollected += fee;
        }

        totalSwappedToNad += nadNet;

        emit SwapToNad(msg.sender, gameAmount, nadNet, fee);
    }

    // ─── Swap: $CHAOS -> pCHAOS (1 $CHAOS → 210 pCHAOS) ────────────────
    function swapToGame(uint256 nadAmount) external {
        if (paused) revert SwapPaused();
        if (nadAmount == 0) revert ZeroAmount();

        uint256 gameOut = nadAmount * RATE;
        uint256 fee = (gameOut * feeToGameBps) / 10_000;
        uint256 gameNet = gameOut - fee;

        if (gameChaos.balanceOf(address(this)) < gameOut) revert InsufficientReserve();

        // Pull $CHAOS from user
        nadChaos.safeTransferFrom(msg.sender, address(this), nadAmount);

        // Send pCHAOS to user
        gameChaos.safeTransfer(msg.sender, gameNet);

        // Send fee to treasury
        if (fee > 0) {
            gameChaos.safeTransfer(treasury, fee);
            totalFeeCollected += fee;
        }

        totalSwappedToGame += gameNet;

        emit SwapToGame(msg.sender, nadAmount, gameNet, fee);
    }

    // ─── View helpers ────────────────────────────────────────────────────
    function gameReserve() external view returns (uint256) {
        return gameChaos.balanceOf(address(this));
    }

    function nadReserve() external view returns (uint256) {
        return nadChaos.balanceOf(address(this));
    }

    /// @notice Preview swap output. toNad=true: pCHAOS→$CHAOS, toNad=false: $CHAOS→pCHAOS
    function getAmountOut(uint256 amountIn, bool toNad) external view returns (uint256) {
        if (toNad) {
            uint256 nadOut = amountIn / RATE;
            uint256 fee = (nadOut * feeToNadBps) / 10_000;
            return nadOut - fee;
        } else {
            uint256 gameOut = amountIn * RATE;
            uint256 fee = (gameOut * feeToGameBps) / 10_000;
            return gameOut - fee;
        }
    }

    // ─── Owner: seed / withdraw reserves ─────────────────────────────────
    function depositGameChaos(uint256 amount) external onlyOwner {
        gameChaos.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveDeposited(address(gameChaos), amount);
    }

    function depositNadChaos(uint256 amount) external onlyOwner {
        nadChaos.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveDeposited(address(nadChaos), amount);
    }

    function withdrawGameChaos(uint256 amount) external onlyOwner {
        gameChaos.safeTransfer(msg.sender, amount);
        emit ReserveWithdrawn(address(gameChaos), amount);
    }

    function withdrawNadChaos(uint256 amount) external onlyOwner {
        nadChaos.safeTransfer(msg.sender, amount);
        emit ReserveWithdrawn(address(nadChaos), amount);
    }

    // ─── Owner: configuration ────────────────────────────────────────────
    function setFees(uint256 _toNadBps, uint256 _toGameBps) external onlyOwner {
        if (_toNadBps > 1_000 || _toGameBps > 1_000) revert FeeTooHigh(); // Max 10%
        feeToNadBps = _toNadBps;
        feeToGameBps = _toGameBps;
        emit FeesUpdated(_toNadBps, _toGameBps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }
}
