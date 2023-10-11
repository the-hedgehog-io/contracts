//SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract FeesRouter is AccessControl {
    struct FeeConfig {
        uint256 minFee;
        uint256 maxFee;
        uint256 amountToA;
        uint256 amountToB;
        address walletA;
        address walletB;
    }

    mapping(uint256 => FeeConfig) public feeConfigs;
    uint256 public feeCount;

    constructor() {
        // Add dummy data or initiate with default fee configurations if necessary
    }

    function addFeeConfig(
        uint256 minFee,
        uint256 maxFee,
        uint256 amountToA,
        uint256 amountToB,
        address walletA,
        address walletB
    ) external {
        feeConfigs[feeCount++] = FeeConfig(
            minFee,
            maxFee,
            amountToA,
            amountToB,
            walletA,
            walletB
        );
    }

    function modifyFeeConfig(
        uint256 index,
        uint256 minFee,
        uint256 maxFee,
        uint256 amountToA,
        uint256 amountToB,
        address walletA,
        address walletB
    ) external {
        require(index < feeCount, "Invalid index");
        feeConfigs[index] = FeeConfig(
            minFee,
            maxFee,
            amountToA,
            amountToB,
            walletA,
            walletB
        );
    }

    function distributeFee(uint256 _debt, uint256 _fee) external {
        // Determine the fee structure based on the provided fee
        FeeConfig memory config;
        bool found = false;
        for (uint256 i = 0; i < feeCount; i++) {
            if (fee >= feeConfigs[i].minFee && fee <= feeConfigs[i].maxFee) {
                config = feeConfigs[i];
                found = true;
                break;
            }
        }

        require(found, "Fee configuration not found");

        // Perform the transfers
        IERC20(address(this)).transferFrom(
            msg.sender,
            config.walletA,
            config.amountToA
        );
        IERC20(address(this)).transferFrom(
            msg.sender,
            config.walletB,
            config.amountToB
        );
        IERC20(address(this)).transferFrom(msg.sender, recipient, amount - fee);
    }
}
