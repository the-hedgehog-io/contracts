// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import "hardhat/console.sol";

interface IIFeesRouter {
    function distributeDebtFee(uint256 _debt, uint256 _fee) external;

    function distributeCollFee(uint256 _debt, uint256 _fee) external;
}

contract FeesRouterTester {
    IIFeesRouter public feesRouter;

    constructor(address _feesRouter) {
        feesRouter = IIFeesRouter(_feesRouter);
    }

    function triggerCollFee(uint256 _debt, uint256 _fee) public {
        console.log("trigerring coll fee");
        console.log("fees router: ", address(feesRouter));
        feesRouter.distributeCollFee(_debt, _fee);
    }

    function triggerDebtFee(uint256 _debt, uint256 _fee) public {
        console.log("fees router: ", address(feesRouter));
        feesRouter.distributeDebtFee(_debt, _fee);
    }
}
