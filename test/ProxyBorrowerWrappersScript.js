const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const TroveManagerTester = artifacts.require("TroveManagerTester");
const HOGTokenTester = artifacts.require("HOGTokenTester");

const th = testHelpers.TestHelper;

const dec = th.dec;
const toBN = th.toBN;
const mv = testHelpers.MoneyValues;
const timeValues = testHelpers.TimeValues;

const ZERO_ADDRESS = th.ZERO_ADDRESS;
const assertRevert = th.assertRevert;

const GAS_PRICE = 10000000;

const {
  buildUserProxies,
  BorrowerOperationsProxy,
  BorrowerWrappersProxy,
  TroveManagerProxy,
  StabilityPoolProxy,
  SortedTrovesProxy,
  TokenProxy,
  HOGStakingProxy,
} = require("../utils/proxyHelpers.js");

contract("BorrowerWrappers", async (accounts) => {
  const [
    owner,
    alice,
    bob,
    carol,
    dennis,
    whale,
    A,
    B,
    C,
    D,
    E,
    defaulter_1,
    defaulter_2,
    // frontEnd_1, frontEnd_2, frontEnd_3
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  let priceFeed;
  let baseFeeLMAToken;
  let sortedTroves;
  let troveManagerOriginal;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let collSurplusPool;
  let borrowerOperations;
  let borrowerWrappers;
  let hogTokenOriginal;
  let hogToken;
  let hogStaking;

  let contracts;

  let BaseFeeLMA_GAS_COMPENSATION;

  const getOpenTroveBaseFeeLMAAmount = async (totalDebt) =>
    th.getOpenTroveBaseFeeLMAAmount(contracts, totalDebt);
  const getActualDebtFromComposite = async (compositeDebt) =>
    th.getActualDebtFromComposite(compositeDebt, contracts);
  const getNetBorrowingAmount = async (debtWithFee) =>
    th.getNetBorrowingAmount(contracts, debtWithFee);
  const openTrove = async (params) => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts = await deploymentHelper.deployBaseFeeLMAToken(contracts);
    const HOGContracts = await deploymentHelper.deployHOGTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    await deploymentHelper.connectHOGContracts(HOGContracts);
    await deploymentHelper.connectCoreContracts(contracts, HOGContracts);
    await deploymentHelper.connectHOGContractsToCore(HOGContracts, contracts);

    troveManagerOriginal = contracts.troveManager;
    hogTokenOriginal = HOGContracts.hogToken;

    const users = [
      alice,
      bob,
      carol,
      dennis,
      whale,
      A,
      B,
      C,
      D,
      E,
      defaulter_1,
      defaulter_2,
    ];
    await deploymentHelper.deployProxyScripts(
      contracts,
      HOGContracts,
      owner,
      users
    );

    priceFeed = contracts.priceFeedTestnet;
    baseFeeLMAToken = contracts.baseFeeLMAToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    collSurplusPool = contracts.collSurplusPool;
    borrowerOperations = contracts.borrowerOperations;
    borrowerWrappers = contracts.borrowerWrappers;
    hogStaking = HOGContracts.hogStaking;
    hogToken = HOGContracts.hogToken;

    BaseFeeLMA_GAS_COMPENSATION =
      await borrowerOperations.BaseFeeLMA_GAS_COMPENSATION();
  });

  it("proxy owner can recover StETH", async () => {
    const amount = toBN(dec(1, 18));
    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);

    // send some StETH to proxy
    await web3.eth.sendTransaction({
      from: owner,
      to: proxyAddress,
      value: amount,
      gasPrice: GAS_PRICE,
    });
    assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString());

    const balanceBefore = toBN(await web3.eth.getBalance(alice));

    // recover StETH
    const gas_Used = th.gasUsed(
      await borrowerWrappers.transferETH(alice, amount, {
        from: alice,
        gasPrice: GAS_PRICE,
      })
    );

    const balanceAfter = toBN(await web3.eth.getBalance(alice));
    const expectedBalance = toBN(balanceBefore.sub(toBN(gas_Used * GAS_PRICE)));
    assert.equal(balanceAfter.sub(expectedBalance), amount.toString());
  });

  it("non proxy owner cannot recover StETH", async () => {
    const amount = toBN(dec(1, 18));
    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);

    // send some StETH to proxy
    await web3.eth.sendTransaction({
      from: owner,
      to: proxyAddress,
      value: amount,
    });
    assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString());

    const balanceBefore = toBN(await web3.eth.getBalance(alice));

    // try to recover StETH
    const proxy = borrowerWrappers.getProxyFromUser(alice);
    const signature = "transferETH(address,uint256)";
    const calldata = th.getTransactionData(signature, [alice, amount]);
    await assertRevert(
      proxy.methods["execute(address,bytes)"](
        borrowerWrappers.scriptAddress,
        calldata,
        { from: bob }
      ),
      "ds-auth-unauthorized"
    );

    assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString());

    const balanceAfter = toBN(await web3.eth.getBalance(alice));
    assert.equal(balanceAfter, balanceBefore.toString());
  });

  // --- claimCollateralAndOpenTrove ---

  it("claimCollateralAndOpenTrove(): reverts if nothing to claim", async () => {
    // Whale opens Trove
    await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: whale } });

    // alice opens Trove
    const { baseFeeLMAAmount, collateral } = await openTrove({
      ICR: toBN(dec(15, 17)),
      extraParams: { from: alice },
    });

    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // alice claims collateral and re-opens the trove
    await assertRevert(
      borrowerWrappers.claimCollateralAndOpenTrove(
        th._100pct,
        baseFeeLMAAmount,
        alice,
        alice,
        { from: alice }
      ),
      "CollSurplusPool: No collateral available to claim"
    );

    // check everything remain the same
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");
    th.assertIsApproximatelyEqual(
      await collSurplusPool.getCollateral(proxyAddress),
      "0"
    );
    th.assertIsApproximatelyEqual(
      await baseFeeLMAToken.balanceOf(proxyAddress),
      baseFeeLMAAmount
    );
    assert.equal(await troveManager.getTroveStatus(proxyAddress), 1);
    th.assertIsApproximatelyEqual(
      await troveManager.getTroveColl(proxyAddress),
      collateral
    );
  });

  it("claimCollateralAndOpenTrove(): without sending any value", async () => {
    // alice opens Trove
    const {
      baseFeeLMAAmount,
      netDebt: redeemAmount,
      collateral,
    } = await openTrove({
      extraBaseFeeLMAAmount: 0,
      ICR: toBN(dec(3, 18)),
      extraParams: { from: alice },
    });
    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: redeemAmount,
      ICR: toBN(dec(5, 18)),
      extraParams: { from: whale },
    });

    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 150 BaseFeeLMA
    await th.redeemCollateral(whale, contracts, redeemAmount, GAS_PRICE);
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");

    // surplus: 5 - 150/200
    const price = await priceFeed.getPrice();
    const expectedSurplus = collateral.sub(
      redeemAmount.mul(mv._1e18BN).div(price)
    );
    th.assertIsApproximatelyEqual(
      await collSurplusPool.getCollateral(proxyAddress),
      expectedSurplus
    );
    assert.equal(await troveManager.getTroveStatus(proxyAddress), 4); // closed by redemption

    // alice claims collateral and re-opens the trove
    await borrowerWrappers.claimCollateralAndOpenTrove(
      th._100pct,
      baseFeeLMAAmount,
      alice,
      alice,
      { from: alice }
    );

    assert.equal(await web3.eth.getBalance(proxyAddress), "0");
    th.assertIsApproximatelyEqual(
      await collSurplusPool.getCollateral(proxyAddress),
      "0"
    );
    th.assertIsApproximatelyEqual(
      await baseFeeLMAToken.balanceOf(proxyAddress),
      baseFeeLMAAmount.mul(toBN(2))
    );
    assert.equal(await troveManager.getTroveStatus(proxyAddress), 1);
    th.assertIsApproximatelyEqual(
      await troveManager.getTroveColl(proxyAddress),
      expectedSurplus
    );
  });

  it("claimCollateralAndOpenTrove(): sending value in the transaction", async () => {
    // alice opens Trove
    const {
      baseFeeLMAAmount,
      netDebt: redeemAmount,
      collateral,
    } = await openTrove({ extraParams: { from: alice } });
    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: redeemAmount,
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });

    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 150 BaseFeeLMA
    await th.redeemCollateral(whale, contracts, redeemAmount, GAS_PRICE);
    assert.equal(await web3.eth.getBalance(proxyAddress), "0");

    // surplus: 5 - 150/200
    const price = await priceFeed.getPrice();
    const expectedSurplus = collateral.sub(
      redeemAmount.mul(mv._1e18BN).div(price)
    );
    th.assertIsApproximatelyEqual(
      await collSurplusPool.getCollateral(proxyAddress),
      expectedSurplus
    );
    assert.equal(await troveManager.getTroveStatus(proxyAddress), 4); // closed by redemption

    // alice claims collateral and re-opens the trove
    await borrowerWrappers.claimCollateralAndOpenTrove(
      th._100pct,
      baseFeeLMAAmount,
      alice,
      alice,
      { from: alice, value: collateral }
    );

    assert.equal(await web3.eth.getBalance(proxyAddress), "0");
    th.assertIsApproximatelyEqual(
      await collSurplusPool.getCollateral(proxyAddress),
      "0"
    );
    th.assertIsApproximatelyEqual(
      await baseFeeLMAToken.balanceOf(proxyAddress),
      baseFeeLMAAmount.mul(toBN(2))
    );
    assert.equal(await troveManager.getTroveStatus(proxyAddress), 1);
    th.assertIsApproximatelyEqual(
      await troveManager.getTroveColl(proxyAddress),
      expectedSurplus.add(collateral)
    );
  });

  // --- claimSPRewardsAndRecycle ---

  it("claimSPRewardsAndRecycle(): only owner can call it", async () => {
    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });
    // Whale deposits 1850 BaseFeeLMA in StabilityPool
    await stabilityPool.provideToSP(dec(1850, 18), ZERO_ADDRESS, {
      from: whale,
    });

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(150, 18)),
      extraParams: { from: alice },
    });
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, {
      from: alice,
    });

    // Defaulter Trove opened
    await openTrove({
      ICR: toBN(dec(210, 16)),
      extraParams: { from: defaulter_1 },
    });

    // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    // Defaulter trove closed
    const liquidationTX_1 = await troveManager.liquidate(defaulter_1, {
      from: owner,
    });
    const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(
      liquidationTX_1
    );

    // Bob tries to claims SP rewards in behalf of Alice
    const proxy = borrowerWrappers.getProxyFromUser(alice);
    const signature = "claimSPRewardsAndRecycle(uint256,address,address)";
    const calldata = th.getTransactionData(signature, [
      th._100pct,
      alice,
      alice,
    ]);
    await assertRevert(
      proxy.methods["execute(address,bytes)"](
        borrowerWrappers.scriptAddress,
        calldata,
        { from: bob }
      ),
      "ds-auth-unauthorized"
    );
  });

  it("claimSPRewardsAndRecycle():", async () => {
    // Whale opens Trove
    const whaleDeposit = toBN(dec(2350, 18));
    await openTrove({
      extraBaseFeeLMAAmount: whaleDeposit,
      ICR: toBN(dec(4, 18)),
      extraParams: { from: whale },
    });
    // Whale deposits 1850 BaseFeeLMA in StabilityPool
    await stabilityPool.provideToSP(whaleDeposit, ZERO_ADDRESS, {
      from: whale,
    });

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    const aliceDeposit = toBN(dec(150, 18));
    await openTrove({
      extraBaseFeeLMAAmount: aliceDeposit,
      ICR: toBN(dec(3, 18)),
      extraParams: { from: alice },
    });
    await stabilityPool.provideToSP(aliceDeposit, ZERO_ADDRESS, {
      from: alice,
    });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, collateral } = await openTrove({
      ICR: toBN(dec(210, 16)),
      extraParams: { from: defaulter_1 },
    });

    // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
    const price = toBN(dec(100, 18));
    await priceFeed.setPrice(price);

    // Defaulter trove closed
    const liquidationTX_1 = await troveManager.liquidate(defaulter_1, {
      from: owner,
    });
    const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(
      liquidationTX_1
    );

    // Alice BaseFeeLMALoss is ((150/2500) * liquidatedDebt)
    const totalDeposits = whaleDeposit.add(aliceDeposit);
    const expectedBaseFeeLMALoss_A = liquidatedDebt_1
      .mul(aliceDeposit)
      .div(totalDeposits);

    const expectedCompoundedBaseFeeLMADeposit_A = toBN(dec(150, 18)).sub(
      expectedBaseFeeLMALoss_A
    );
    const compoundedBaseFeeLMADeposit_A =
      await stabilityPool.getCompoundedBaseFeeLMADeposit(alice);
    // collateral * 150 / 2500 * 0.995
    const expectedETHGain_A = collateral
      .mul(aliceDeposit)
      .div(totalDeposits)
      .mul(toBN(dec(995, 15)))
      .div(mv._1e18BN);

    assert.isAtMost(
      th.getDifference(
        expectedCompoundedBaseFeeLMADeposit_A,
        compoundedBaseFeeLMADeposit_A
      ),
      1000
    );

    const ethBalanceBefore = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollBefore = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceBefore = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtBefore = await troveManager.getTroveDebt(alice);
    const hogBalanceBefore = await hogToken.balanceOf(alice);
    const ICRBefore = await troveManager.getCurrentICR(alice, price);
    const depositBefore = (await stabilityPool.deposits(alice))[0];
    const stakeBefore = await hogStaking.stakes(alice);

    const proportionalBaseFeeLMA = expectedETHGain_A.mul(price).div(ICRBefore);
    const borrowingRate =
      await troveManagerOriginal.getBorrowingRateWithDecay();
    const netDebtChange = proportionalBaseFeeLMA
      .mul(mv._1e18BN)
      .div(mv._1e18BN.add(borrowingRate));

    // to force HOG issuance
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    const expectedHOGGain_A = toBN("50373424199406504708132");

    await priceFeed.setPrice(price.mul(toBN(2)));

    // Alice claims SP rewards and puts them back in the system through the proxy
    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);
    await borrowerWrappers.claimSPRewardsAndRecycle(th._100pct, alice, alice, {
      from: alice,
    });

    const ethBalanceAfter = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollAfter = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceAfter = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtAfter = await troveManager.getTroveDebt(alice);
    const hogBalanceAfter = await hogToken.balanceOf(alice);
    const ICRAfter = await troveManager.getCurrentICR(alice, price);
    const depositAfter = (await stabilityPool.deposits(alice))[0];
    const stakeAfter = await hogStaking.stakes(alice);

    // check proxy balances remain the same
    assert.equal(ethBalanceAfter.toString(), ethBalanceBefore.toString());
    assert.equal(
      baseFeeLMABalanceAfter.toString(),
      baseFeeLMABalanceBefore.toString()
    );
    assert.equal(hogBalanceAfter.toString(), hogBalanceBefore.toString());
    // check trove has increased debt by the ICR proportional amount to StETH gain
    th.assertIsApproximatelyEqual(
      troveDebtAfter,
      troveDebtBefore.add(proportionalBaseFeeLMA)
    );
    // check trove has increased collateral by the StETH gain
    th.assertIsApproximatelyEqual(
      troveCollAfter,
      troveCollBefore.add(expectedETHGain_A)
    );
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore);
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(
      depositAfter,
      depositBefore.sub(expectedBaseFeeLMALoss_A).add(netDebtChange)
    );
    // check hog balance remains the same
    th.assertIsApproximatelyEqual(hogBalanceAfter, hogBalanceBefore);

    // HOG staking
    th.assertIsApproximatelyEqual(
      stakeAfter,
      stakeBefore.add(expectedHOGGain_A)
    );

    // Expect Alice has withdrawn all StETH gain
    const alice_pendingETHGain = await stabilityPool.getDepositorETHGain(alice);
    assert.equal(alice_pendingETHGain, 0);
  });

  // --- claimStakingGainsAndRecycle ---

  it("claimStakingGainsAndRecycle(): only owner can call it", async () => {
    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });

    // alice opens trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(150, 18)),
      extraParams: { from: alice },
    });

    // mint some HOG
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(whale),
      dec(1850, 18)
    );
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(alice),
      dec(150, 18)
    );

    // stake HOG
    await hogStaking.stake(dec(1850, 18), { from: whale });
    await hogStaking.stake(dec(150, 18), { from: alice });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, totalDebt, collateral } =
      await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: defaulter_1 },
      });

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 100 BaseFeeLMA
    const redeemedAmount = toBN(dec(100, 18));
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE);

    // Bob tries to claims staking gains in behalf of Alice
    const proxy = borrowerWrappers.getProxyFromUser(alice);
    const signature = "claimStakingGainsAndRecycle(uint256,address,address)";
    const calldata = th.getTransactionData(signature, [
      th._100pct,
      alice,
      alice,
    ]);
    await assertRevert(
      proxy.methods["execute(address,bytes)"](
        borrowerWrappers.scriptAddress,
        calldata,
        { from: bob }
      ),
      "ds-auth-unauthorized"
    );
  });

  it("claimStakingGainsAndRecycle(): reverts if user has no trove", async () => {
    const price = toBN(dec(200, 18));

    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });
    // Whale deposits 1850 BaseFeeLMA in StabilityPool
    await stabilityPool.provideToSP(dec(1850, 18), ZERO_ADDRESS, {
      from: whale,
    });

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    //await openTrove({ extraBaseFeeLMAAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
    //await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

    // mint some HOG
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(whale),
      dec(1850, 18)
    );
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(alice),
      dec(150, 18)
    );

    // stake HOG
    await hogStaking.stake(dec(1850, 18), { from: whale });
    await hogStaking.stake(dec(150, 18), { from: alice });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, totalDebt, collateral } =
      await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: defaulter_1 },
      });
    const borrowingFee = netDebt.sub(baseFeeLMAAmount);

    // Alice BaseFeeLMA gain is ((150/2000) * borrowingFee)
    const expectedBaseFeeLMAGain_A = borrowingFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)));

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 100 BaseFeeLMA
    const redeemedAmount = toBN(dec(100, 18));
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE);

    const ethBalanceBefore = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollBefore = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceBefore = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtBefore = await troveManager.getTroveDebt(alice);
    const hogBalanceBefore = await hogToken.balanceOf(alice);
    const ICRBefore = await troveManager.getCurrentICR(alice, price);
    const depositBefore = (await stabilityPool.deposits(alice))[0];
    const stakeBefore = await hogStaking.stakes(alice);

    // Alice claims staking rewards and puts them back in the system through the proxy
    await assertRevert(
      borrowerWrappers.claimStakingGainsAndRecycle(th._100pct, alice, alice, {
        from: alice,
      }),
      "BorrowerWrappersScript: caller must have an active trove"
    );

    const ethBalanceAfter = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollAfter = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceAfter = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtAfter = await troveManager.getTroveDebt(alice);
    const hogBalanceAfter = await hogToken.balanceOf(alice);
    const ICRAfter = await troveManager.getCurrentICR(alice, price);
    const depositAfter = (await stabilityPool.deposits(alice))[0];
    const stakeAfter = await hogStaking.stakes(alice);

    // check everything remains the same
    assert.equal(ethBalanceAfter.toString(), ethBalanceBefore.toString());
    assert.equal(
      baseFeeLMABalanceAfter.toString(),
      baseFeeLMABalanceBefore.toString()
    );
    assert.equal(hogBalanceAfter.toString(), hogBalanceBefore.toString());
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore, 10000);
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore);
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore);
    th.assertIsApproximatelyEqual(depositAfter, depositBefore, 10000);
    th.assertIsApproximatelyEqual(hogBalanceBefore, hogBalanceAfter);
    // HOG staking
    th.assertIsApproximatelyEqual(stakeAfter, stakeBefore);

    // Expect Alice has withdrawn all StETH gain
    const alice_pendingETHGain = await stabilityPool.getDepositorETHGain(alice);
    assert.equal(alice_pendingETHGain, 0);
  });

  it("claimStakingGainsAndRecycle(): with only StETH gain", async () => {
    const price = toBN(dec(200, 18));

    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, collateral } = await openTrove({
      ICR: toBN(dec(210, 16)),
      extraParams: { from: defaulter_1 },
    });
    const borrowingFee = netDebt.sub(baseFeeLMAAmount);

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(150, 18)),
      extraParams: { from: alice },
    });
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, {
      from: alice,
    });

    // mint some HOG
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(whale),
      dec(1850, 18)
    );
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(alice),
      dec(150, 18)
    );

    // stake HOG
    await hogStaking.stake(dec(1850, 18), { from: whale });
    await hogStaking.stake(dec(150, 18), { from: alice });

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 100 BaseFeeLMA
    const redeemedAmount = toBN(dec(100, 18));
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE);

    // Alice StETH gain is ((150/2000) * (redemption fee over redeemedAmount) / price)
    const redemptionFee = await troveManager.getRedemptionFeeWithDecay(
      redeemedAmount
    );
    const expectedETHGain_A = redemptionFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)))
      .mul(mv._1e18BN)
      .div(price);

    const ethBalanceBefore = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollBefore = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceBefore = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtBefore = await troveManager.getTroveDebt(alice);
    const hogBalanceBefore = await hogToken.balanceOf(alice);
    const ICRBefore = await troveManager.getCurrentICR(alice, price);
    const depositBefore = (await stabilityPool.deposits(alice))[0];
    const stakeBefore = await hogStaking.stakes(alice);

    const proportionalBaseFeeLMA = expectedETHGain_A.mul(price).div(ICRBefore);
    const borrowingRate =
      await troveManagerOriginal.getBorrowingRateWithDecay();
    const netDebtChange = proportionalBaseFeeLMA
      .mul(toBN(dec(1, 18)))
      .div(toBN(dec(1, 18)).add(borrowingRate));

    const expectedHOGGain_A = toBN("839557069990108416000000");

    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice);
    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(
      th._100pct,
      alice,
      alice,
      { from: alice }
    );

    // Alice new BaseFeeLMA gain due to her own Trove adjustment: ((150/2000) * (borrowing fee over netDebtChange))
    const newBorrowingFee = await troveManagerOriginal.getBorrowingFeeWithDecay(
      netDebtChange
    );
    const expectedNewBaseFeeLMAGain_A = newBorrowingFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)));

    const ethBalanceAfter = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollAfter = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceAfter = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtAfter = await troveManager.getTroveDebt(alice);
    const hogBalanceAfter = await hogToken.balanceOf(alice);
    const ICRAfter = await troveManager.getCurrentICR(alice, price);
    const depositAfter = (await stabilityPool.deposits(alice))[0];
    const stakeAfter = await hogStaking.stakes(alice);

    // check proxy balances remain the same
    assert.equal(ethBalanceAfter.toString(), ethBalanceBefore.toString());
    assert.equal(hogBalanceAfter.toString(), hogBalanceBefore.toString());
    // check proxy baseFeeLMA balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(
      baseFeeLMABalanceAfter,
      baseFeeLMABalanceBefore.add(expectedNewBaseFeeLMAGain_A)
    );
    // check trove has increased debt by the ICR proportional amount to StETH gain
    th.assertIsApproximatelyEqual(
      troveDebtAfter,
      troveDebtBefore.add(proportionalBaseFeeLMA),
      10000
    );
    // check trove has increased collateral by the StETH gain
    th.assertIsApproximatelyEqual(
      troveCollAfter,
      troveCollBefore.add(expectedETHGain_A)
    );
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore);
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(
      depositAfter,
      depositBefore.add(netDebtChange),
      10000
    );
    // check hog balance remains the same
    th.assertIsApproximatelyEqual(hogBalanceBefore, hogBalanceAfter);

    // HOG staking
    th.assertIsApproximatelyEqual(
      stakeAfter,
      stakeBefore.add(expectedHOGGain_A)
    );

    // Expect Alice has withdrawn all StETH gain
    const alice_pendingETHGain = await stabilityPool.getDepositorETHGain(alice);
    assert.equal(alice_pendingETHGain, 0);
  });

  it("claimStakingGainsAndRecycle(): with only BaseFeeLMA gain", async () => {
    const price = toBN(dec(200, 18));

    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(150, 18)),
      extraParams: { from: alice },
    });
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, {
      from: alice,
    });

    // mint some HOG
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(whale),
      dec(1850, 18)
    );
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(alice),
      dec(150, 18)
    );

    // stake HOG
    await hogStaking.stake(dec(1850, 18), { from: whale });
    await hogStaking.stake(dec(150, 18), { from: alice });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, collateral } = await openTrove({
      ICR: toBN(dec(210, 16)),
      extraParams: { from: defaulter_1 },
    });
    const borrowingFee = netDebt.sub(baseFeeLMAAmount);

    // Alice BaseFeeLMA gain is ((150/2000) * borrowingFee)
    const expectedBaseFeeLMAGain_A = borrowingFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)));

    const ethBalanceBefore = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollBefore = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceBefore = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtBefore = await troveManager.getTroveDebt(alice);
    const hogBalanceBefore = await hogToken.balanceOf(alice);
    const ICRBefore = await troveManager.getCurrentICR(alice, price);
    const depositBefore = (await stabilityPool.deposits(alice))[0];
    const stakeBefore = await hogStaking.stakes(alice);

    const borrowingRate =
      await troveManagerOriginal.getBorrowingRateWithDecay();

    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(
      th._100pct,
      alice,
      alice,
      { from: alice }
    );

    const ethBalanceAfter = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollAfter = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceAfter = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtAfter = await troveManager.getTroveDebt(alice);
    const hogBalanceAfter = await hogToken.balanceOf(alice);
    const ICRAfter = await troveManager.getCurrentICR(alice, price);
    const depositAfter = (await stabilityPool.deposits(alice))[0];
    const stakeAfter = await hogStaking.stakes(alice);

    // check proxy balances remain the same
    assert.equal(ethBalanceAfter.toString(), ethBalanceBefore.toString());
    assert.equal(hogBalanceAfter.toString(), hogBalanceBefore.toString());
    // check proxy baseFeeLMA balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(
      baseFeeLMABalanceAfter,
      baseFeeLMABalanceBefore
    );
    // check trove has increased debt by the ICR proportional amount to StETH gain
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore, 10000);
    // check trove has increased collateral by the StETH gain
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore);
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore);
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(
      depositAfter,
      depositBefore.add(expectedBaseFeeLMAGain_A),
      10000
    );
    // check hog balance remains the same
    th.assertIsApproximatelyEqual(hogBalanceBefore, hogBalanceAfter);

    // Expect Alice has withdrawn all StETH gain
    const alice_pendingETHGain = await stabilityPool.getDepositorETHGain(alice);
    assert.equal(alice_pendingETHGain, 0);
  });

  it("claimStakingGainsAndRecycle(): with both StETH and BaseFeeLMA gains", async () => {
    const price = toBN(dec(200, 18));

    // Whale opens Trove
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(1850, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });

    // alice opens trove and provides 150 BaseFeeLMA to StabilityPool
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(150, 18)),
      extraParams: { from: alice },
    });
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, {
      from: alice,
    });

    // mint some HOG
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(whale),
      dec(1850, 18)
    );
    await hogTokenOriginal.unprotectedMint(
      borrowerOperations.getProxyAddressFromUser(alice),
      dec(150, 18)
    );

    // stake HOG
    await hogStaking.stake(dec(1850, 18), { from: whale });
    await hogStaking.stake(dec(150, 18), { from: alice });

    // Defaulter Trove opened
    const { baseFeeLMAAmount, netDebt, collateral } = await openTrove({
      ICR: toBN(dec(210, 16)),
      extraParams: { from: defaulter_1 },
    });
    const borrowingFee = netDebt.sub(baseFeeLMAAmount);

    // Alice BaseFeeLMA gain is ((150/2000) * borrowingFee)
    const expectedBaseFeeLMAGain_A = borrowingFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)));

    // skip bootstrapping phase
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_WEEK * 2,
      web3.currentProvider
    );

    // whale redeems 100 BaseFeeLMA
    const redeemedAmount = toBN(dec(100, 18));
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE);

    // Alice StETH gain is ((150/2000) * (redemption fee over redeemedAmount) / price)
    const redemptionFee = await troveManager.getRedemptionFeeWithDecay(
      redeemedAmount
    );
    const expectedETHGain_A = redemptionFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)))
      .mul(mv._1e18BN)
      .div(price);

    const ethBalanceBefore = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollBefore = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceBefore = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtBefore = await troveManager.getTroveDebt(alice);
    const hogBalanceBefore = await hogToken.balanceOf(alice);
    const ICRBefore = await troveManager.getCurrentICR(alice, price);
    const depositBefore = (await stabilityPool.deposits(alice))[0];
    const stakeBefore = await hogStaking.stakes(alice);

    const proportionalBaseFeeLMA = expectedETHGain_A.mul(price).div(ICRBefore);
    const borrowingRate =
      await troveManagerOriginal.getBorrowingRateWithDecay();
    const netDebtChange = proportionalBaseFeeLMA
      .mul(toBN(dec(1, 18)))
      .div(toBN(dec(1, 18)).add(borrowingRate));
    const expectedTotalBaseFeeLMA = expectedBaseFeeLMAGain_A.add(netDebtChange);

    const expectedHOGGain_A = toBN("839557069990108416000000");

    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(
      th._100pct,
      alice,
      alice,
      { from: alice }
    );

    // Alice new BaseFeeLMA gain due to her own Trove adjustment: ((150/2000) * (borrowing fee over netDebtChange))
    const newBorrowingFee = await troveManagerOriginal.getBorrowingFeeWithDecay(
      netDebtChange
    );
    const expectedNewBaseFeeLMAGain_A = newBorrowingFee
      .mul(toBN(dec(150, 18)))
      .div(toBN(dec(2000, 18)));

    const ethBalanceAfter = await web3.eth.getBalance(
      borrowerOperations.getProxyAddressFromUser(alice)
    );
    const troveCollAfter = await troveManager.getTroveColl(alice);
    const baseFeeLMABalanceAfter = await baseFeeLMAToken.balanceOf(alice);
    const troveDebtAfter = await troveManager.getTroveDebt(alice);
    const hogBalanceAfter = await hogToken.balanceOf(alice);
    const ICRAfter = await troveManager.getCurrentICR(alice, price);
    const depositAfter = (await stabilityPool.deposits(alice))[0];
    const stakeAfter = await hogStaking.stakes(alice);

    // check proxy balances remain the same
    assert.equal(ethBalanceAfter.toString(), ethBalanceBefore.toString());
    assert.equal(hogBalanceAfter.toString(), hogBalanceBefore.toString());
    // check proxy baseFeeLMA balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(
      baseFeeLMABalanceAfter,
      baseFeeLMABalanceBefore.add(expectedNewBaseFeeLMAGain_A)
    );
    // check trove has increased debt by the ICR proportional amount to StETH gain
    th.assertIsApproximatelyEqual(
      troveDebtAfter,
      troveDebtBefore.add(proportionalBaseFeeLMA),
      10000
    );
    // check trove has increased collateral by the StETH gain
    th.assertIsApproximatelyEqual(
      troveCollAfter,
      troveCollBefore.add(expectedETHGain_A)
    );
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore);
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(
      depositAfter,
      depositBefore.add(expectedTotalBaseFeeLMA),
      10000
    );
    // check hog balance remains the same
    th.assertIsApproximatelyEqual(hogBalanceBefore, hogBalanceAfter);

    // HOG staking
    th.assertIsApproximatelyEqual(
      stakeAfter,
      stakeBefore.add(expectedHOGGain_A)
    );

    // Expect Alice has withdrawn all StETH gain
    const alice_pendingETHGain = await stabilityPool.getDepositorETHGain(alice);
    assert.equal(alice_pendingETHGain, 0);
  });
});
