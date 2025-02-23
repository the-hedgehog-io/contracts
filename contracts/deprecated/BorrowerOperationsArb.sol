// SPDX-License-Identifier: MIT
/*
pragma solidity 0.8.19;

import "./BorrowerOperations.sol";

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}
/*

/**
 * @notice Fork of Liquity's BorrowerOperations. . Most of the Logic remains unchanged..
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of IBorrowerOperations Interface
 * - Collateral is now an ERC20 token instead of a native one
 * - Updated variable names and docs to refer to BaseFeeLMA token and wwstETH as a collateral
 * - Logic updates with borrowing fees calculation and their distribution
 * - Removed Native Liquity Protocol Token Staking
 * - Remove _getUSDValue view method as it's not used anymore
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 */

/*
contract BorrowerOperationsArb is BorrowerOperations {

    // HEDGEHOG UPDATES: New constant interface ArbSys - enabling retrieval of block number
    ArbSys constant arbsys = ArbSys(address(100));

    // HedgehogUpdates: new private function, that checks if there was a transaction with a trove in the current block
    function _checkAndSetUpdateBlock(address _borrower) internal override {
        if (
            troveManager.getTroveUpdateBlock(_borrower) ==
            arbsys.arbBlockNumber()
        ) {
            revert TroveAdjustedThisBlock();
        }
        troveManager.setTroveLastUpdatedBlock(_borrower);
    }
}
*/
