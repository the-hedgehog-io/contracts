const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");
const NonPayable = artifacts.require("NonPayable.sol");

const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;
const mv = testHelpers.MoneyValues;
const timeValues = testHelpers.TimeValues;

const TroveManagerTester = artifacts.require("TroveManagerTester");
const BaseFeeLMAToken = artifacts.require("BaseFeeLMAToken");

contract("CollSurplusPool", async (accounts) => {
  const [owner, A, B, C, D, E] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  let borrowerOperations;
  let priceFeed;
  let collSurplusPool;

  let contracts;

  const getOpenTroveBaseFeeLMAAmount = async (totalDebt) =>
    th.getOpenTroveBaseFeeLMAAmount(contracts, totalDebt);
  const openTrove = async (params) => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts.baseFeeLMAToken = await BaseFeeLMAToken.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    );
    const HOGContracts = await deploymentHelper.deployHOGContracts(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    priceFeed = contracts.priceFeedTestnet;
    collSurplusPool = contracts.collSurplusPool;
    borrowerOperations = contracts.borrowerOperations;

    await deploymentHelper.connectCoreContracts(contracts, HOGContracts);
    await deploymentHelper.connectHOGContracts(HOGContracts);
    await deploymentHelper.connectHOGContractsToCore(HOGContracts, contracts);
  });

  it("CollSurplusPool::getWStETH(): Returns the WStETH balance of the CollSurplusPool after redemption", async () => {
    const ETH_1 = await collSurplusPool.getWStETH();
    assert.equal(ETH_1, "0");

    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    const { collateral: B_coll, netDebt: B_netDebt } = await openTrove({
      ICR: toBN(dec(200, 16)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: B_netDebt,
      extraParams: { from: A, value: dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // At WStETH:USD = 100, this redemption should leave 1 eth of coll surplus
    await th.redeemCollateralAndGetTxObject(A, contracts, B_netDebt);

    const ETH_2 = await collSurplusPool.getWStETH();
    th.assertIsApproximatelyEqual(
      ETH_2,
      B_coll.sub(B_netDebt.mul(mv._1e18BN).div(price))
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if caller is not Borrower Operations", async () => {
    await th.assertRevert(
      collSurplusPool.claimColl(A, { from: A }),
      "CollSurplusPool: Caller is not Borrower Operations"
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if nothing to claim", async () => {
    await th.assertRevert(
      borrowerOperations.claimCollateral({ from: A }),
      "CollSurplusPool: No collateral available to claim"
    );
  });

  it("CollSurplusPool: claimColl(): Reverts if owner cannot receive WStETH surplus", async () => {
    const nonPayable = await NonPayable.new();

    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    // open trove from NonPayable proxy contract
    const B_coll = toBN(dec(60, 18));
    const B_baseFeeLMAAmount = toBN(dec(3000, 18));
    const B_netDebt = await th.getAmountWithBorrowingFee(
      contracts,
      B_baseFeeLMAAmount
    );
    const openTroveData = th.getTransactionData(
      "openTrove(uint256,uint256,address,address)",
      ["0xde0b6b3a7640000", web3.utils.toHex(B_baseFeeLMAAmount), B, B]
    );
    await nonPayable.forward(borrowerOperations.address, openTroveData, {
      value: B_coll,
    });
    await openTrove({
      extraBaseFeeLMAAmount: B_netDebt,
      extraParams: { from: A, value: dec(3000, "ether") },
    });

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // At WStETH:USD = 100, this redemption should leave 1 eth of coll surplus for B
    await th.redeemCollateralAndGetTxObject(A, contracts, B_netDebt);

    const ETH_2 = await collSurplusPool.getWStETH();
    th.assertIsApproximatelyEqual(
      ETH_2,
      B_coll.sub(B_netDebt.mul(mv._1e18BN).div(price))
    );

    const claimCollateralData = th.getTransactionData("claimCollateral()", []);
    await th.assertRevert(
      nonPayable.forward(borrowerOperations.address, claimCollateralData),
      "CollSurplusPool: sending WStETH failed"
    );
  });

  it("CollSurplusPool: reverts trying to send WStETH to it", async () => {
    await th.assertRevert(
      web3.eth.sendTransaction({
        from: A,
        to: collSurplusPool.address,
        value: 1,
      }),
      "CollSurplusPool: Caller is not Active Pool"
    );
  });

  it("CollSurplusPool: accountSurplus: reverts if caller is not Trove Manager", async () => {
    await th.assertRevert(
      collSurplusPool.accountSurplus(A, 1),
      "CollSurplusPool: Caller is not TroveManager"
    );
  });
});

contract("Reset chain state", async (accounts) => {});
