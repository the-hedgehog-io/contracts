const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js");
const { BNConverter } = require("../utils/BNConverter.js");
const testHelpers = require("../utils/testHelpers.js");

const HOGStakingTester = artifacts.require("HOGStakingTester");
const TroveManagerTester = artifacts.require("TroveManagerTester");
const NonPayable = artifacts.require("./NonPayable.sol");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const dec = th.dec;
const assertRevert = th.assertRevert;

const toBN = th.toBN;
const ZERO = th.toBN("0");

const GAS_PRICE = 10000000;

/* NOTE: These tests do not test for specific StETH and BaseFeeLMA gain values. They only test that the
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake.
 *
 * Specific StETH/BaseFeeLMA gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 *
 */

contract("HOGStaking revenue share tests", async (accounts) => {
  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed;
  let baseFeeLMAToken;
  let sortedTroves;
  let troveManager;
  let activePool;
  let stabilityPool;
  let defaultPool;
  let borrowerOperations;
  let hogStaking;
  let hogToken;

  let contracts;

  const openTrove = async (params) => th.openTrove(contracts, params);

  beforeEach(async () => {
    contracts = await deploymentHelper.deployLiquityCore();
    contracts.troveManager = await TroveManagerTester.new();
    contracts = await deploymentHelper.deployBaseFeeLMATokenTester(contracts);
    const HOGContracts = await deploymentHelper.deployHOGTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

    await deploymentHelper.connectHOGContracts(HOGContracts);
    await deploymentHelper.connectCoreContracts(contracts, HOGContracts);
    await deploymentHelper.connectHOGContractsToCore(HOGContracts, contracts);

    nonPayable = await NonPayable.new();
    priceFeed = contracts.priceFeedTestnet;
    baseFeeLMAToken = contracts.baseFeeLMAToken;
    sortedTroves = contracts.sortedTroves;
    troveManager = contracts.troveManager;
    activePool = contracts.activePool;
    stabilityPool = contracts.stabilityPool;
    defaultPool = contracts.defaultPool;
    borrowerOperations = contracts.borrowerOperations;
    hintHelpers = contracts.hintHelpers;

    hogToken = HOGContracts.hogToken;
    hogStaking = HOGContracts.hogStaking;
  });

  it("stake(): reverts if amount is zero", async () => {
    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // console.log(`A hog bal: ${await hogToken.balanceOf(A)}`)

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await assertRevert(
      hogStaking.stake(0, { from: A }),
      "HOGStaking: Amount must be non-zero"
    );
  });

  it("StETH fee per HOG staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), {
      from: multisig,
      gasPrice: GAS_PRICE,
    });

    // console.log(`A hog bal: ${await hogToken.balanceOf(A)}`)

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(100, 18), { from: A });

    // Check StETH fee per unit staked is zero
    const F_ETH_Before = await hogStaking.F_ETH();
    assert.equal(F_ETH_Before, "0");

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee emitted in event is non-zero
    const emittedETHFee = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx))[3]
    );
    assert.isTrue(emittedETHFee.gt(toBN("0")));

    // Check StETH fee per unit staked has increased by correct amount
    const F_ETH_After = await hogStaking.F_ETH();

    // Expect fee per unit staked = fee/100, since there is 100 BaseFeeLMA totalStaked
    const expected_F_ETH_After = emittedETHFee.div(toBN("100"));

    assert.isTrue(expected_F_ETH_After.eq(F_ETH_After));
  });

  it("StETH fee per HOG staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), {
      from: multisig,
      gasPrice: GAS_PRICE,
    });

    // Check StETH fee per unit staked is zero
    const F_ETH_Before = await hogStaking.F_ETH();
    assert.equal(F_ETH_Before, "0");

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      GAS_PRICE
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee emitted in event is non-zero
    const emittedETHFee = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx))[3]
    );
    assert.isTrue(emittedETHFee.gt(toBN("0")));

    // Check StETH fee per unit staked has not increased
    const F_ETH_After = await hogStaking.F_ETH();
    assert.equal(F_ETH_After, "0");
  });

  it("BaseFeeLMA fee per HOG staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(100, 18), { from: A });

    // Check BaseFeeLMA fee per unit staked is zero
    const F_BaseFeeLMA_Before = await hogStaking.F_ETH();
    assert.equal(F_BaseFeeLMA_Before, "0");

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(27, 18),
      D,
      D,
      { from: D }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(tx)
    );
    assert.isTrue(emittedBaseFeeLMAFee.gt(toBN("0")));

    // Check BaseFeeLMA fee per unit staked has increased by correct amount
    const F_BaseFeeLMA_After = await hogStaking.F_BaseFeeLMA();

    // Expect fee per unit staked = fee/100, since there is 100 BaseFeeLMA totalStaked
    const expected_F_BaseFeeLMA_After = emittedBaseFeeLMAFee.div(toBN("100"));

    assert.isTrue(expected_F_BaseFeeLMA_After.eq(F_BaseFeeLMA_After));
  });

  it("BaseFeeLMA fee per HOG staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // Check BaseFeeLMA fee per unit staked is zero
    const F_BaseFeeLMA_Before = await hogStaking.F_ETH();
    assert.equal(F_BaseFeeLMA_Before, "0");

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate();
    assert.isTrue(baseRate.gt(toBN("0")));

    // D draws debt
    const tx = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(27, 18),
      D,
      D,
      { from: D }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(tx)
    );
    assert.isTrue(emittedBaseFeeLMAFee.gt(toBN("0")));

    // Check BaseFeeLMA fee per unit staked did not increase, is still zero
    const F_BaseFeeLMA_After = await hogStaking.F_BaseFeeLMA();
    assert.equal(F_BaseFeeLMA_After, "0");
  });

  it("HOG Staking: A single staker earns all StETH and HOG fees that occur", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(100, 18), { from: A });

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedETHFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await baseFeeLMAToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check StETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedETHFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_1 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedBaseFeeLMAFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_2 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedBaseFeeLMAFee_2.gt(toBN("0")));

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2);
    const expectedTotalBaseFeeLMAGain = emittedBaseFeeLMAFee_1.add(
      emittedBaseFeeLMAFee_2
    );

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(A));

    // A un-stakes
    const GAS_Used = th.gasUsed(
      await hogStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(A));

    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before).add(
      toBN(GAS_Used * GAS_PRICE)
    );
    const A_BaseFeeLMAGain = A_BaseFeeLMABalance_After.sub(
      A_BaseFeeLMABalance_Before
    );

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedTotalBaseFeeLMAGain, A_BaseFeeLMAGain),
      1000
    );
  });

  it("stake(): Top-up sends out all accumulated StETH and BaseFeeLMA gains to the staker", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedETHFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await baseFeeLMAToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check StETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedETHFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_1 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedBaseFeeLMAFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_2 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedBaseFeeLMAFee_2.gt(toBN("0")));

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2);
    const expectedTotalBaseFeeLMAGain = emittedBaseFeeLMAFee_1.add(
      emittedBaseFeeLMAFee_2
    );

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(A));

    // A tops up
    const GAS_Used = th.gasUsed(
      await hogStaking.stake(dec(50, 18), { from: A, gasPrice: GAS_PRICE })
    );

    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(A));

    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before).add(
      toBN(GAS_Used * GAS_PRICE)
    );
    const A_BaseFeeLMAGain = A_BaseFeeLMABalance_After.sub(
      A_BaseFeeLMABalance_Before
    );

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedTotalBaseFeeLMAGain, A_BaseFeeLMAGain),
      1000
    );
  });

  it("getPendingETHGain(): Returns the staker's correct pending StETH gain", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedETHFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await baseFeeLMAToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check StETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedETHFee_2.gt(toBN("0")));

    const expectedTotalETHGain = emittedETHFee_1.add(emittedETHFee_2);

    const A_ETHGain = await hogStaking.getPendingETHGain(A);

    assert.isAtMost(th.getDifference(expectedTotalETHGain, A_ETHGain), 1000);
  });

  it("getPendingBaseFeeLMAGain(): Returns the staker's correct pending BaseFeeLMA gain", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A
    await hogToken.transfer(A, dec(100, 18), { from: multisig });

    // A makes stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogStaking.stake(dec(50, 18), { from: A });

    const B_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(B);
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const B_BalAfterRedemption = await baseFeeLMAToken.balanceOf(B);
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption));

    // check StETH fee 1 emitted in event is non-zero
    const emittedETHFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedETHFee_1.gt(toBN("0")));

    const C_BalBeforeREdemption = await baseFeeLMAToken.balanceOf(C);
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(100, 18),
      (gasPrice = GAS_PRICE)
    );

    const C_BalAfterRedemption = await baseFeeLMAToken.balanceOf(C);
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption));

    // check StETH fee 2 emitted in event is non-zero
    const emittedETHFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedETHFee_2.gt(toBN("0")));

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(104, 18),
      D,
      D,
      { from: D }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_1 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedBaseFeeLMAFee_1.gt(toBN("0")));

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(17, 18),
      B,
      B,
      { from: B }
    );

    // Check BaseFeeLMA fee value in event is non-zero
    const emittedBaseFeeLMAFee_2 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedBaseFeeLMAFee_2.gt(toBN("0")));

    const expectedTotalBaseFeeLMAGain = emittedBaseFeeLMAFee_1.add(
      emittedBaseFeeLMAFee_2
    );
    const A_BaseFeeLMAGain = await hogStaking.getPendingBaseFeeLMAGain(A);

    assert.isAtMost(
      th.getDifference(expectedTotalBaseFeeLMAGain, A_BaseFeeLMAGain),
      1000
    );
  });

  // - multi depositors, several rewards
  it("HOG Staking: Multiple stakers earn the correct share of all StETH and HOG fees, based on their stake size", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(10000, 18)),
      ICR: toBN(dec(10, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: E },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: F },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: G },
    });

    // FF time one year so owner can transfer HOG
    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A, B, C
    await hogToken.transfer(A, dec(100, 18), { from: multisig });
    await hogToken.transfer(B, dec(200, 18), { from: multisig });
    await hogToken.transfer(C, dec(300, 18), { from: multisig });

    // A, B, C make stake
    await hogToken.approve(hogStaking.address, dec(100, 18), { from: A });
    await hogToken.approve(hogStaking.address, dec(200, 18), { from: B });
    await hogToken.approve(hogStaking.address, dec(300, 18), { from: C });
    await hogStaking.stake(dec(100, 18), { from: A });
    await hogStaking.stake(dec(200, 18), { from: B });
    await hogStaking.stake(dec(300, 18), { from: C });

    // Confirm staking contract holds 600 HOG
    // console.log(`hog staking HOG bal: ${await hogToken.balanceOf(hogStaking.address)}`)
    assert.equal(await hogToken.balanceOf(hogStaking.address), dec(600, 18));
    assert.equal(await hogStaking.totalHOGStaked(), dec(600, 18));

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      F,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedETHFee_1 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_1))[3]
    );
    assert.isTrue(emittedETHFee_1.gt(toBN("0")));

    // G redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(
      G,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedETHFee_2 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_2))[3]
    );
    assert.isTrue(emittedETHFee_2.gt(toBN("0")));

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(104, 18),
      F,
      F,
      { from: F }
    );
    const emittedBaseFeeLMAFee_1 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_1)
    );
    assert.isTrue(emittedBaseFeeLMAFee_1.gt(toBN("0")));

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    );
    const emittedBaseFeeLMAFee_2 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_2)
    );
    assert.isTrue(emittedBaseFeeLMAFee_2.gt(toBN("0")));

    // D obtains HOG from owner and makes a stake
    await hogToken.transfer(D, dec(50, 18), { from: multisig });
    await hogToken.approve(hogStaking.address, dec(50, 18), { from: D });
    await hogStaking.stake(dec(50, 18), { from: D });

    // Confirm staking contract holds 650 HOG
    assert.equal(await hogToken.balanceOf(hogStaking.address), dec(650, 18));
    assert.equal(await hogStaking.totalHOGStaked(), dec(650, 18));

    // G redeems
    const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(
      C,
      contracts,
      dec(197, 18),
      (gasPrice = GAS_PRICE)
    );
    const emittedETHFee_3 = toBN(
      (await th.getEmittedRedemptionValues(redemptionTx_3))[3]
    );
    assert.isTrue(emittedETHFee_3.gt(toBN("0")));

    // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawBaseFeeLMA(
      th._100pct,
      dec(17, 18),
      G,
      G,
      { from: G }
    );
    const emittedBaseFeeLMAFee_3 = toBN(
      th.getBaseFeeLMAFeeFromBaseFeeLMABorrowingEvent(borrowingTx_3)
    );
    assert.isTrue(emittedBaseFeeLMAFee_3.gt(toBN("0")));

    /*  
    Expected rewards:

    A_ETH: (100* ETHFee_1)/600 + (100* ETHFee_2)/600 + (100*ETH_Fee_3)/650
    B_ETH: (200* ETHFee_1)/600 + (200* ETHFee_2)/600 + (200*ETH_Fee_3)/650
    C_ETH: (300* ETHFee_1)/600 + (300* ETHFee_2)/600 + (300*ETH_Fee_3)/650
    D_ETH:                                             (100*ETH_Fee_3)/650

    A_BaseFeeLMA: (100*BaseFeeLMAFee_1 )/600 + (100* BaseFeeLMAFee_2)/600 + (100*BaseFeeLMAFee_3)/650
    B_BaseFeeLMA: (200* BaseFeeLMAFee_1)/600 + (200* BaseFeeLMAFee_2)/600 + (200*BaseFeeLMAFee_3)/650
    C_BaseFeeLMA: (300* BaseFeeLMAFee_1)/600 + (300* BaseFeeLMAFee_2)/600 + (300*BaseFeeLMAFee_3)/650
    D_BaseFeeLMA:                                               (100*BaseFeeLMAFee_3)/650
    */

    // Expected StETH gains
    const expectedETHGain_A = toBN("100")
      .mul(emittedETHFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedETHFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedETHFee_3).div(toBN("650")));

    const expectedETHGain_B = toBN("200")
      .mul(emittedETHFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedETHFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedETHFee_3).div(toBN("650")));

    const expectedETHGain_C = toBN("300")
      .mul(emittedETHFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedETHFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedETHFee_3).div(toBN("650")));

    const expectedETHGain_D = toBN("50").mul(emittedETHFee_3).div(toBN("650"));

    // Expected BaseFeeLMA gains:
    const expectedBaseFeeLMAGain_A = toBN("100")
      .mul(emittedBaseFeeLMAFee_1)
      .div(toBN("600"))
      .add(toBN("100").mul(emittedBaseFeeLMAFee_2).div(toBN("600")))
      .add(toBN("100").mul(emittedBaseFeeLMAFee_3).div(toBN("650")));

    const expectedBaseFeeLMAGain_B = toBN("200")
      .mul(emittedBaseFeeLMAFee_1)
      .div(toBN("600"))
      .add(toBN("200").mul(emittedBaseFeeLMAFee_2).div(toBN("600")))
      .add(toBN("200").mul(emittedBaseFeeLMAFee_3).div(toBN("650")));

    const expectedBaseFeeLMAGain_C = toBN("300")
      .mul(emittedBaseFeeLMAFee_1)
      .div(toBN("600"))
      .add(toBN("300").mul(emittedBaseFeeLMAFee_2).div(toBN("600")))
      .add(toBN("300").mul(emittedBaseFeeLMAFee_3).div(toBN("650")));

    const expectedBaseFeeLMAGain_D = toBN("50")
      .mul(emittedBaseFeeLMAFee_3)
      .div(toBN("650"));

    const A_ETHBalance_Before = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(A));
    const B_ETHBalance_Before = toBN(await web3.eth.getBalance(B));
    const B_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(B));
    const C_ETHBalance_Before = toBN(await web3.eth.getBalance(C));
    const C_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(C));
    const D_ETHBalance_Before = toBN(await web3.eth.getBalance(D));
    const D_BaseFeeLMABalance_Before = toBN(await baseFeeLMAToken.balanceOf(D));

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(
      await hogStaking.unstake(dec(100, 18), { from: A, gasPrice: GAS_PRICE })
    );
    const B_GAS_Used = th.gasUsed(
      await hogStaking.unstake(dec(200, 18), { from: B, gasPrice: GAS_PRICE })
    );
    const C_GAS_Used = th.gasUsed(
      await hogStaking.unstake(dec(400, 18), { from: C, gasPrice: GAS_PRICE })
    );
    const D_GAS_Used = th.gasUsed(
      await hogStaking.unstake(dec(50, 18), { from: D, gasPrice: GAS_PRICE })
    );

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal(await hogToken.balanceOf(hogStaking.address), "0");
    assert.equal(await hogStaking.totalHOGStaked(), "0");

    // Get A-D StETH and BaseFeeLMA balances
    const A_ETHBalance_After = toBN(await web3.eth.getBalance(A));
    const A_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(A));
    const B_ETHBalance_After = toBN(await web3.eth.getBalance(B));
    const B_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(B));
    const C_ETHBalance_After = toBN(await web3.eth.getBalance(C));
    const C_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(C));
    const D_ETHBalance_After = toBN(await web3.eth.getBalance(D));
    const D_BaseFeeLMABalance_After = toBN(await baseFeeLMAToken.balanceOf(D));

    // Get StETH and BaseFeeLMA gains
    const A_ETHGain = A_ETHBalance_After.sub(A_ETHBalance_Before).add(
      toBN(A_GAS_Used * GAS_PRICE)
    );
    const A_BaseFeeLMAGain = A_BaseFeeLMABalance_After.sub(
      A_BaseFeeLMABalance_Before
    );
    const B_ETHGain = B_ETHBalance_After.sub(B_ETHBalance_Before).add(
      toBN(B_GAS_Used * GAS_PRICE)
    );
    const B_BaseFeeLMAGain = B_BaseFeeLMABalance_After.sub(
      B_BaseFeeLMABalance_Before
    );
    const C_ETHGain = C_ETHBalance_After.sub(C_ETHBalance_Before).add(
      toBN(C_GAS_Used * GAS_PRICE)
    );
    const C_BaseFeeLMAGain = C_BaseFeeLMABalance_After.sub(
      C_BaseFeeLMABalance_Before
    );
    const D_ETHGain = D_ETHBalance_After.sub(D_ETHBalance_Before).add(
      toBN(D_GAS_Used * GAS_PRICE)
    );
    const D_BaseFeeLMAGain = D_BaseFeeLMABalance_After.sub(
      D_BaseFeeLMABalance_Before
    );

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedETHGain_A, A_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedBaseFeeLMAGain_A, A_BaseFeeLMAGain),
      1000
    );
    assert.isAtMost(th.getDifference(expectedETHGain_B, B_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedBaseFeeLMAGain_B, B_BaseFeeLMAGain),
      1000
    );
    assert.isAtMost(th.getDifference(expectedETHGain_C, C_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedBaseFeeLMAGain_C, C_BaseFeeLMAGain),
      1000
    );
    assert.isAtMost(th.getDifference(expectedETHGain_D, D_ETHGain), 1000);
    assert.isAtMost(
      th.getDifference(expectedBaseFeeLMAGain_D, D_BaseFeeLMAGain),
      1000
    );
  });

  it("unstake(): reverts if caller has StETH gains and can't receive StETH", async () => {
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: whale },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(20000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: A },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(30000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: B },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(40000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: C },
    });
    await openTrove({
      extraBaseFeeLMAAmount: toBN(dec(50000, 18)),
      ICR: toBN(dec(2, 18)),
      extraParams: { from: D },
    });

    await th.fastForwardTime(
      timeValues.SECONDS_IN_ONE_YEAR,
      web3.currentProvider
    );

    // multisig transfers HOG to staker A and the non-payable proxy
    await hogToken.transfer(A, dec(100, 18), { from: multisig });
    await hogToken.transfer(nonPayable.address, dec(100, 18), {
      from: multisig,
    });

    //  A makes stake
    const A_stakeTx = await hogStaking.stake(dec(100, 18), { from: A });
    assert.isTrue(A_stakeTx.receipt.status);

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData("stake(uint256)", [
      "0x56bc75e2d63100000",
    ]); // proxy stakes 100 HOG
    await nonPayable.forward(hogStaking.address, proxystakeTxData, { from: A });

    // B makes a redemption, creating StETH gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(
      B,
      contracts,
      dec(45, 18),
      (gasPrice = GAS_PRICE)
    );

    const proxy_ETHGain = await hogStaking.getPendingETHGain(
      nonPayable.address
    );
    assert.isTrue(proxy_ETHGain.gt(toBN("0")));

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated StETH gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData("unstake(uint256)", [
      "0x56bc75e2d63100000",
    ]); // proxy stakes 100 HOG
    const proxyUnstakeTxPromise = nonPayable.forward(
      hogStaking.address,
      proxyUnStakeTxData,
      { from: A }
    );

    // but nonPayable proxy can not accept StETH - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise);
  });

  it("receive(): reverts when it receives StETH from an address that is not the Active Pool", async () => {
    const ethSendTxPromise1 = web3.eth.sendTransaction({
      to: hogStaking.address,
      from: A,
      value: dec(1, "eth"),
    });
    const ethSendTxPromise2 = web3.eth.sendTransaction({
      to: hogStaking.address,
      from: owner,
      value: dec(1, "eth"),
    });

    await assertRevert(ethSendTxPromise1);
    await assertRevert(ethSendTxPromise2);
  });

  it("unstake(): reverts if user has no stake", async () => {
    const unstakeTxPromise1 = hogStaking.unstake(1, { from: A });
    const unstakeTxPromise2 = hogStaking.unstake(1, { from: owner });

    await assertRevert(unstakeTxPromise1);
    await assertRevert(unstakeTxPromise2);
  });

  it("Test requireCallerIsTroveManager", async () => {
    const hogStakingTester = await HOGStakingTester.new();
    await assertRevert(
      hogStakingTester.requireCallerIsTroveManager(),
      "HOGStaking: caller is not TroveM"
    );
  });
});
