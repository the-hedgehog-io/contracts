const deploymentHelper = require("../utils/deploymentHelpers.js");
const testHelpers = require("../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const dec = th.dec;
const toBN = th.toBN;
const getDifference = th.getDifference;
const mv = testHelpers.MoneyValues;

const TroveManagerTester = artifacts.require("TroveManagerTester");
const BaseFeeLMAToken = artifacts.require("BaseFeeLMAToken");

contract(
  "TroveManager - Redistribution reward calculations",
  async (accounts) => {
    const [
      owner,
      alice,
      bob,
      carol,
      dennis,
      erin,
      freddy,
      greta,
      harry,
      ida,
      A,
      B,
      C,
      D,
      E,
      whale,
      defaulter_1,
      defaulter_2,
      defaulter_3,
      defaulter_4,
    ] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(
      997,
      1000
    );

    let priceFeed;
    let baseFeeLMAToken;
    let sortedTroves;
    let troveManager;
    let nameRegistry;
    let activePool;
    let stabilityPool;
    let defaultPool;
    let functionCaller;
    let borrowerOperations;

    let contracts;

    const getOpenTroveBaseFeeLMAAmount = async (totalDebt) =>
      th.getOpenTroveBaseFeeLMAAmount(contracts, totalDebt);
    const getNetBorrowingAmount = async (debtWithFee) =>
      th.getNetBorrowingAmount(contracts, debtWithFee);
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
      baseFeeLMAToken = contracts.baseFeeLMAToken;
      sortedTroves = contracts.sortedTroves;
      troveManager = contracts.troveManager;
      nameRegistry = contracts.nameRegistry;
      activePool = contracts.activePool;
      stabilityPool = contracts.stabilityPool;
      defaultPool = contracts.defaultPool;
      functionCaller = contracts.functionCaller;
      borrowerOperations = contracts.borrowerOperations;

      await deploymentHelper.connectHOGContracts(HOGContracts);
      await deploymentHelper.connectCoreContracts(contracts, HOGContracts);
      await deploymentHelper.connectHOGContractsToCore(HOGContracts, contracts);
    });

    it("redistribution: A, B Open. B Liquidated. C, D Open. D Liquidated. Distributes correct rewards", async () => {
      // A, B open trove
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: bob },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Confirm not in Recovery Mode
      assert.isFalse(await th.checkRecoveryMode(contracts));

      // L1: B liquidated
      const txB = await troveManager.liquidate(bob);
      assert.isTrue(txB.receipt.status);
      assert.isFalse(await sortedTroves.contains(bob));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // C, D open troves
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: carol },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: dennis },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Confirm not in Recovery Mode
      assert.isFalse(await th.checkRecoveryMode(contracts));

      // L2: D Liquidated
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txB.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Get entire coll of A and C
      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();
      const carol_Coll = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      /* Expected collateral:
    A: Alice receives 0.995 WStETH from L1, and ~3/5*0.995 WStETH from L2.
    expect aliceColl = 2 + 0.995 + 2.995/4.995 * 0.995 = 3.5916 WStETH

    C: Carol receives ~2/5 WStETH from L2
    expect carolColl = 2 + 2/4.995 * 0.995 = 2.398 WStETH

    Total coll = 4 + 2 * 0.995 WStETH
    */
      const A_collAfterL1 = A_coll.add(th.applyLiquidationFee(B_coll));
      assert.isAtMost(
        th.getDifference(
          alice_Coll,
          A_collAfterL1.add(
            A_collAfterL1.mul(th.applyLiquidationFee(D_coll)).div(
              A_collAfterL1.add(C_coll)
            )
          )
        ),
        1000
      );
      assert.isAtMost(
        th.getDifference(
          carol_Coll,
          C_coll.add(
            C_coll.mul(th.applyLiquidationFee(D_coll)).div(
              A_collAfterL1.add(C_coll)
            )
          )
        ),
        1000
      );

      const entireSystemColl = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      assert.equal(
        entireSystemColl,
        A_coll.add(C_coll).add(th.applyLiquidationFee(B_coll.add(D_coll)))
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: A, B, C Open. C Liquidated. D, E, F Open. F Liquidated. Distributes correct rewards", async () => {
      // A, B C open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Confirm not in Recovery Mode
      assert.isFalse(await th.checkRecoveryMode(contracts));

      // L1: C liquidated
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // D, E, F open troves
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: dennis },
      });
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: erin },
      });
      const { collateral: F_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: freddy },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Confirm not in Recovery Mode
      assert.isFalse(await th.checkRecoveryMode(contracts));

      // L2: F Liquidated
      const txF = await troveManager.liquidate(freddy);
      assert.isTrue(txF.receipt.status);
      assert.isFalse(await sortedTroves.contains(freddy));

      // Get entire coll of A, B, D and E
      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();
      const dennis_Coll = (await troveManager.Troves(dennis))[1]
        .add(await troveManager.getPendingWStETHReward(dennis))
        .toString();
      const erin_Coll = (await troveManager.Troves(erin))[1]
        .add(await troveManager.getPendingWStETHReward(erin))
        .toString();

      /* Expected collateral:
    A and B receives 1/2 WStETH * 0.995 from L1.
    total Coll: 3

    A, B, receive (2.4975)/8.995 * 0.995 WStETH from L2.
    
    D, E receive 2/8.995 * 0.995 WStETH from L2.

    expect A, B coll  = 2 +  0.4975 + 0.2763  =  WStETH
    expect D, E coll  = 2 + 0.2212  =  WStETH

    Total coll = 8 (non-liquidated) + 2 * 0.995 (liquidated and redistributed)
    */
      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      );
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      );
      const totalBeforeL2 = A_collAfterL1.add(B_collAfterL1)
        .add(D_coll)
        .add(E_coll);
      const expected_A = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(F_coll)).div(totalBeforeL2)
      );
      const expected_B = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(F_coll)).div(totalBeforeL2)
      );
      const expected_D = D_coll.add(
        D_coll.mul(th.applyLiquidationFee(F_coll)).div(totalBeforeL2)
      );
      const expected_E = E_coll.add(
        E_coll.mul(th.applyLiquidationFee(F_coll)).div(totalBeforeL2)
      );
      assert.isAtMost(th.getDifference(alice_Coll, expected_A), 1000);
      assert.isAtMost(th.getDifference(bob_Coll, expected_B), 1000);
      assert.isAtMost(th.getDifference(dennis_Coll, expected_D), 1000);
      assert.isAtMost(th.getDifference(erin_Coll, expected_E), 1000);

      const entireSystemColl = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      assert.equal(
        entireSystemColl,
        A_coll.add(B_coll)
          .add(D_coll)
          .add(E_coll)
          .add(th.applyLiquidationFee(C_coll.add(F_coll)))
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });
    ////

    it("redistribution: Sequence of alternate opening/liquidation: final surviving trove has WStETH from all previously liquidated troves", async () => {
      // A, B  open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: bob },
      });

      // Price drops to 1 $/E
      await priceFeed.setPrice(dec(1, 18));

      // L1: A liquidated
      const txA = await troveManager.liquidate(alice);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(alice));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));
      // C, opens trove
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(1, 18));

      // L2: B Liquidated
      const txB = await troveManager.liquidate(bob);
      assert.isTrue(txB.receipt.status);
      assert.isFalse(await sortedTroves.contains(bob));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));
      // D opens trove
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: dennis },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(1, 18));

      // L3: C Liquidated
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));
      // E opens trove
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: erin },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(1, 18));

      // L4: D Liquidated
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txD.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));
      // F opens trove
      const { collateral: F_coll } = await openTrove({
        ICR: toBN(dec(210, 16)),
        extraParams: { from: freddy },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(1, 18));

      // L5: E Liquidated
      const txE = await troveManager.liquidate(erin);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(erin));

      // Get entire coll of A, B, D, E and F
      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();
      const carol_Coll = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();
      const dennis_Coll = (await troveManager.Troves(dennis))[1]
        .add(await troveManager.getPendingWStETHReward(dennis))
        .toString();
      const erin_Coll = (await troveManager.Troves(erin))[1]
        .add(await troveManager.getPendingWStETHReward(erin))
        .toString();

      const freddy_rawColl = (await troveManager.Troves(freddy))[1].toString();
      const freddy_ETHReward = (
        await troveManager.getPendingWStETHReward(freddy)
      ).toString();

      /* Expected collateral:
     A-E should have been liquidated
     trove F should have acquired all WStETH in the system: 1 WStETH initial coll, and 0.995^5+0.995^4+0.995^3+0.995^2+0.995 from rewards = 5.925 WStETH
    */
      assert.isAtMost(th.getDifference(alice_Coll, "0"), 1000);
      assert.isAtMost(th.getDifference(bob_Coll, "0"), 1000);
      assert.isAtMost(th.getDifference(carol_Coll, "0"), 1000);
      assert.isAtMost(th.getDifference(dennis_Coll, "0"), 1000);
      assert.isAtMost(th.getDifference(erin_Coll, "0"), 1000);

      assert.isAtMost(th.getDifference(freddy_rawColl, F_coll), 1000);
      const gainedETH = th.applyLiquidationFee(
        E_coll.add(
          th.applyLiquidationFee(
            D_coll.add(
              th.applyLiquidationFee(
                C_coll.add(
                  th.applyLiquidationFee(
                    B_coll.add(th.applyLiquidationFee(A_coll))
                  )
                )
              )
            )
          )
        )
      );
      assert.isAtMost(th.getDifference(freddy_ETHReward, gainedETH), 1000);

      const entireSystemColl = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      assert.isAtMost(
        th.getDifference(entireSystemColl, F_coll.add(gainedETH)),
        1000
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(1000, 18)
      );
    });

    // ---Trove adds collateral ---

    // Test based on scenario in: https://docs.google.com/spreadsheets/d/1F5p3nZy749K5jwO-bwJeTsRoY7ewMfWIQ3QHtokxqzo/edit?usp=sharing
    it("redistribution: A,B,C,D,E open. Liq(A). B adds coll. Liq(C). B and D have correct coll and debt", async () => {
      // A, B, C, D, E open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: A },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: B },
      });
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: C },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(20000, 16)),
        extraBaseFeeLMAAmount: dec(10, 18),
        extraParams: { from: D },
      });
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: E },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate A
      // console.log(`ICR A: ${await troveManager.getCurrentICR(A, price)}`)
      const txA = await troveManager.liquidate(A);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(A));

      // Check entireColl for each trove:
      const B_entireColl_1 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const C_entireColl_1 = (await th.getEntireCollAndDebt(contracts, C))
        .entireColl;
      const D_entireColl_1 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;
      const E_entireColl_1 = (await th.getEntireCollAndDebt(contracts, E))
        .entireColl;

      const totalCollAfterL1 = B_coll.add(C_coll).add(D_coll).add(E_coll);
      const B_collAfterL1 = B_coll.add(
        th.applyLiquidationFee(A_coll).mul(B_coll).div(totalCollAfterL1)
      );
      const C_collAfterL1 = C_coll.add(
        th.applyLiquidationFee(A_coll).mul(C_coll).div(totalCollAfterL1)
      );
      const D_collAfterL1 = D_coll.add(
        th.applyLiquidationFee(A_coll).mul(D_coll).div(totalCollAfterL1)
      );
      const E_collAfterL1 = E_coll.add(
        th.applyLiquidationFee(A_coll).mul(E_coll).div(totalCollAfterL1)
      );
      assert.isAtMost(getDifference(B_entireColl_1, B_collAfterL1), 1e8);
      assert.isAtMost(getDifference(C_entireColl_1, C_collAfterL1), 1e8);
      assert.isAtMost(getDifference(D_entireColl_1, D_collAfterL1), 1e8);
      assert.isAtMost(getDifference(E_entireColl_1, E_collAfterL1), 1e8);

      // Bob adds 1 WStETH to his trove
      const addedColl1 = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(B, B, { from: B, value: addedColl1 });

      // Liquidate C
      const txC = await troveManager.liquidate(C);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(C));

      const B_entireColl_2 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const D_entireColl_2 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;
      const E_entireColl_2 = (await th.getEntireCollAndDebt(contracts, E))
        .entireColl;

      const totalCollAfterL2 = B_collAfterL1.add(addedColl1)
        .add(D_collAfterL1)
        .add(E_collAfterL1);
      const B_collAfterL2 = B_collAfterL1.add(addedColl1).add(
        th
          .applyLiquidationFee(C_collAfterL1)
          .mul(B_collAfterL1.add(addedColl1))
          .div(totalCollAfterL2)
      );
      const D_collAfterL2 = D_collAfterL1.add(
        th
          .applyLiquidationFee(C_collAfterL1)
          .mul(D_collAfterL1)
          .div(totalCollAfterL2)
      );
      const E_collAfterL2 = E_collAfterL1.add(
        th
          .applyLiquidationFee(C_collAfterL1)
          .mul(E_collAfterL1)
          .div(totalCollAfterL2)
      );
      // console.log(`D_entireColl_2: ${D_entireColl_2}`)
      // console.log(`E_entireColl_2: ${E_entireColl_2}`)
      //assert.isAtMost(getDifference(B_entireColl_2, B_collAfterL2), 1e8)
      assert.isAtMost(getDifference(D_entireColl_2, D_collAfterL2), 1e8);
      assert.isAtMost(getDifference(E_entireColl_2, E_collAfterL2), 1e8);

      // Bob adds 1 WStETH to his trove
      const addedColl2 = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(B, B, { from: B, value: addedColl2 });

      // Liquidate E
      const txE = await troveManager.liquidate(E);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(E));

      const totalCollAfterL3 = B_collAfterL2.add(addedColl2).add(D_collAfterL2);
      const B_collAfterL3 = B_collAfterL2.add(addedColl2).add(
        th
          .applyLiquidationFee(E_collAfterL2)
          .mul(B_collAfterL2.add(addedColl2))
          .div(totalCollAfterL3)
      );
      const D_collAfterL3 = D_collAfterL2.add(
        th
          .applyLiquidationFee(E_collAfterL2)
          .mul(D_collAfterL2)
          .div(totalCollAfterL3)
      );

      const B_entireColl_3 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const D_entireColl_3 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;

      const diff_entireColl_B = getDifference(B_entireColl_3, B_collAfterL3);
      const diff_entireColl_D = getDifference(D_entireColl_3, D_collAfterL3);

      assert.isAtMost(diff_entireColl_B, 1e8);
      assert.isAtMost(diff_entireColl_D, 1e8);
    });

    // Test based on scenario in: https://docs.google.com/spreadsheets/d/1F5p3nZy749K5jwO-bwJeTsRoY7ewMfWIQ3QHtokxqzo/edit?usp=sharing
    it("redistribution: A,B,C,D open. Liq(A). B adds coll. Liq(C). B and D have correct coll and debt", async () => {
      // A, B, C, D, E open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: A },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: B },
      });
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: C },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(20000, 16)),
        extraBaseFeeLMAAmount: dec(10, 18),
        extraParams: { from: D },
      });
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100000, 18),
        extraParams: { from: E },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Check entireColl for each trove:
      const A_entireColl_0 = (await th.getEntireCollAndDebt(contracts, A))
        .entireColl;
      const B_entireColl_0 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const C_entireColl_0 = (await th.getEntireCollAndDebt(contracts, C))
        .entireColl;
      const D_entireColl_0 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;
      const E_entireColl_0 = (await th.getEntireCollAndDebt(contracts, E))
        .entireColl;

      // entireSystemColl, excluding A
      const denominatorColl_1 = (await troveManager.getEntireSystemColl()).sub(
        A_entireColl_0
      );

      // Liquidate A
      // console.log(`ICR A: ${await troveManager.getCurrentICR(A, price)}`)
      const txA = await troveManager.liquidate(A);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(A));

      const A_collRedistribution = A_entireColl_0.mul(toBN(995)).div(
        toBN(1000)
      ); // remove the gas comp

      // console.log(`A_collRedistribution: ${A_collRedistribution}`)
      // Check accumulated WStETH gain for each trove
      const B_ETHGain_1 = await troveManager.getPendingWStETHReward(B);
      const C_ETHGain_1 = await troveManager.getPendingWStETHReward(C);
      const D_ETHGain_1 = await troveManager.getPendingWStETHReward(D);
      const E_ETHGain_1 = await troveManager.getPendingWStETHReward(E);

      // Check gains are what we'd expect from a distribution proportional to each trove's entire coll
      const B_expectedPendingETH_1 =
        A_collRedistribution.mul(B_entireColl_0).div(denominatorColl_1);
      const C_expectedPendingETH_1 =
        A_collRedistribution.mul(C_entireColl_0).div(denominatorColl_1);
      const D_expectedPendingETH_1 =
        A_collRedistribution.mul(D_entireColl_0).div(denominatorColl_1);
      const E_expectedPendingETH_1 =
        A_collRedistribution.mul(E_entireColl_0).div(denominatorColl_1);

      assert.isAtMost(getDifference(B_expectedPendingETH_1, B_ETHGain_1), 1e8);
      assert.isAtMost(getDifference(C_expectedPendingETH_1, C_ETHGain_1), 1e8);
      assert.isAtMost(getDifference(D_expectedPendingETH_1, D_ETHGain_1), 1e8);
      assert.isAtMost(getDifference(E_expectedPendingETH_1, E_ETHGain_1), 1e8);

      // // Bob adds 1 WStETH to his trove
      await borrowerOperations.addColl(B, B, {
        from: B,
        value: dec(1, "ether"),
      });

      // Check entireColl for each trove
      const B_entireColl_1 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const C_entireColl_1 = (await th.getEntireCollAndDebt(contracts, C))
        .entireColl;
      const D_entireColl_1 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;
      const E_entireColl_1 = (await th.getEntireCollAndDebt(contracts, E))
        .entireColl;

      // entireSystemColl, excluding C
      const denominatorColl_2 = (await troveManager.getEntireSystemColl()).sub(
        C_entireColl_1
      );

      // Liquidate C
      const txC = await troveManager.liquidate(C);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(C));

      const C_collRedistribution = C_entireColl_1.mul(toBN(995)).div(
        toBN(1000)
      ); // remove the gas comp
      // console.log(`C_collRedistribution: ${C_collRedistribution}`)

      const B_ETHGain_2 = await troveManager.getPendingWStETHReward(B);
      const D_ETHGain_2 = await troveManager.getPendingWStETHReward(D);
      const E_ETHGain_2 = await troveManager.getPendingWStETHReward(E);

      // Since B topped up, he has no previous pending WStETH gain
      const B_expectedPendingETH_2 =
        C_collRedistribution.mul(B_entireColl_1).div(denominatorColl_2);

      // D & E's accumulated pending WStETH gain includes their previous gain
      const D_expectedPendingETH_2 = C_collRedistribution.mul(D_entireColl_1)
        .div(denominatorColl_2)
        .add(D_expectedPendingETH_1);

      const E_expectedPendingETH_2 = C_collRedistribution.mul(E_entireColl_1)
        .div(denominatorColl_2)
        .add(E_expectedPendingETH_1);

      assert.isAtMost(getDifference(B_expectedPendingETH_2, B_ETHGain_2), 1e8);
      assert.isAtMost(getDifference(D_expectedPendingETH_2, D_ETHGain_2), 1e8);
      assert.isAtMost(getDifference(E_expectedPendingETH_2, E_ETHGain_2), 1e8);

      // // Bob adds 1 WStETH to his trove
      await borrowerOperations.addColl(B, B, {
        from: B,
        value: dec(1, "ether"),
      });

      // Check entireColl for each trove
      const B_entireColl_2 = (await th.getEntireCollAndDebt(contracts, B))
        .entireColl;
      const D_entireColl_2 = (await th.getEntireCollAndDebt(contracts, D))
        .entireColl;
      const E_entireColl_2 = (await th.getEntireCollAndDebt(contracts, E))
        .entireColl;

      // entireSystemColl, excluding E
      const denominatorColl_3 = (await troveManager.getEntireSystemColl()).sub(
        E_entireColl_2
      );

      // Liquidate E
      const txE = await troveManager.liquidate(E);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(E));

      const E_collRedistribution = E_entireColl_2.mul(toBN(995)).div(
        toBN(1000)
      ); // remove the gas comp
      // console.log(`E_collRedistribution: ${E_collRedistribution}`)

      const B_ETHGain_3 = await troveManager.getPendingWStETHReward(B);
      const D_ETHGain_3 = await troveManager.getPendingWStETHReward(D);

      // Since B topped up, he has no previous pending WStETH gain
      const B_expectedPendingETH_3 =
        E_collRedistribution.mul(B_entireColl_2).div(denominatorColl_3);

      // D'S accumulated pending WStETH gain includes their previous gain
      const D_expectedPendingETH_3 = E_collRedistribution.mul(D_entireColl_2)
        .div(denominatorColl_3)
        .add(D_expectedPendingETH_2);

      assert.isAtMost(getDifference(B_expectedPendingETH_3, B_ETHGain_3), 1e8);
      assert.isAtMost(getDifference(D_expectedPendingETH_3, D_ETHGain_3), 1e8);
    });

    it("redistribution: A,B,C Open. Liq(C). B adds coll. Liq(A). B acquires all coll and debt", async () => {
      // A, B, C open troves
      const { collateral: A_coll, totalDebt: A_totalDebt } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll, totalDebt: B_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll, totalDebt: C_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Carol
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      //Bob adds WStETH to his trove
      const addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(bob, bob, {
        from: bob,
        value: addedColl,
      });

      // Alice withdraws BaseFeeLMA
      await borrowerOperations.withdrawBaseFeeLMA(
        th._100pct,
        await getNetBorrowingAmount(A_totalDebt),
        alice,
        alice,
        { from: alice }
      );

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Alice
      const txA = await troveManager.liquidate(alice);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(alice));

      // Expect Bob now holds all Ether and BaseFeeLMADebt in the system: 2 + 0.4975+0.4975*0.995+0.995 Ether and 110*3 BaseFeeLMA (10 each for gas compensation)
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const bob_BaseFeeLMADebt = (await troveManager.Troves(bob))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(bob))
        .toString();

      const expected_B_coll = B_coll.add(addedColl)
        .add(th.applyLiquidationFee(A_coll))
        .add(th.applyLiquidationFee(C_coll).mul(B_coll).div(A_coll.add(B_coll)))
        .add(
          th.applyLiquidationFee(
            th.applyLiquidationFee(C_coll).mul(A_coll).div(A_coll.add(B_coll))
          )
        );
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(
        th.getDifference(
          bob_BaseFeeLMADebt,
          A_totalDebt.mul(toBN(2)).add(B_totalDebt).add(C_totalDebt)
        ),
        1000
      );
    });

    it("redistribution: A,B,C Open. Liq(C). B tops up coll. D Opens. Liq(D). Distributes correct rewards.", async () => {
      // A, B, C open troves
      const { collateral: A_coll, totalDebt: A_totalDebt } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll, totalDebt: B_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll, totalDebt: C_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Carol
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      //Bob adds WStETH to his trove
      const addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(bob, bob, {
        from: bob,
        value: addedColl,
      });

      // D opens trove
      const { collateral: D_coll, totalDebt: D_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate D
      const txA = await troveManager.liquidate(dennis);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      /* Bob rewards:
     L1: 1/2*0.995 WStETH, 55 BaseFeeLMA
     L2: (2.4975/3.995)*0.995 = 0.622 WStETH , 110*(2.4975/3.995)= 68.77 BaseFeeLMADebt

    coll: 3.1195 WStETH
    debt: 233.77 BaseFeeLMADebt

     Alice rewards:
    L1 1/2*0.995 WStETH, 55 BaseFeeLMA
    L2 (1.4975/3.995)*0.995 = 0.3730 WStETH, 110*(1.4975/3.995) = 41.23 BaseFeeLMADebt

    coll: 1.8705 WStETH
    debt: 146.23 BaseFeeLMADebt

    totalColl: 4.99 WStETH
    totalDebt 380 BaseFeeLMA (includes 50 each for gas compensation)
    */
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const bob_BaseFeeLMADebt = (await troveManager.Troves(bob))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(bob))
        .toString();

      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const alice_BaseFeeLMADebt = (await troveManager.Troves(alice))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(alice))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .add(addedColl)
        .add(th.applyLiquidationFee(C_coll));
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      ).add(addedColl);
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(D_coll)).div(totalCollAfterL1)
      );
      const expected_B_debt = B_totalDebt.add(
        B_coll.mul(C_totalDebt).div(A_coll.add(B_coll))
      ).add(B_collAfterL1.mul(D_totalDebt).div(totalCollAfterL1));
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(
        th.getDifference(bob_BaseFeeLMADebt, expected_B_debt),
        10000
      );

      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      );
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(D_coll)).div(totalCollAfterL1)
      );
      const expected_A_debt = A_totalDebt.add(
        A_coll.mul(C_totalDebt).div(A_coll.add(B_coll))
      ).add(A_collAfterL1.mul(D_totalDebt).div(totalCollAfterL1));
      assert.isAtMost(th.getDifference(alice_Coll, expected_A_coll), 1000);
      assert.isAtMost(
        th.getDifference(alice_BaseFeeLMADebt, expected_A_debt),
        10000
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: Trove with the majority stake tops up. A,B,C, D open. Liq(D). C tops up. E Enters, Liq(E). Distributes correct rewards", async () => {
      const _998_Ether = toBN("998000000000000000000");
      // A, B, C, D open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol, value: _998_Ether },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis, value: dec(1000, "ether") },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Dennis
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txD.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // Expected rewards:  alice: 1 WStETH, bob: 1 WStETH, carol: 998 WStETH
      const alice_ETHReward_1 = await troveManager.getPendingWStETHReward(
        alice
      );
      const bob_ETHReward_1 = await troveManager.getPendingWStETHReward(bob);
      const carol_ETHReward_1 = await troveManager.getPendingWStETHReward(
        carol
      );

      //Expect 1000 + 1000*0.995 WStETH in system now
      const entireSystemColl_1 = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      assert.equal(
        entireSystemColl_1,
        A_coll.add(B_coll).add(C_coll).add(th.applyLiquidationFee(D_coll))
      );

      const totalColl = A_coll.add(B_coll).add(C_coll);
      th.assertIsApproximatelyEqual(
        alice_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(A_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        bob_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(B_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        carol_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(C_coll).div(totalColl)
      );

      //Carol adds 1 WStETH to her trove, brings it to 1992.01 total coll
      const C_addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(carol, carol, {
        from: carol,
        value: dec(1, "ether"),
      });

      //Expect 1996 WStETH in system now
      const entireSystemColl_2 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_2,
        totalColl.add(th.applyLiquidationFee(D_coll)).add(C_addedColl)
      );

      // E opens with another 1996 WStETH
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraParams: { from: erin, value: entireSystemColl_2 },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Erin
      const txE = await troveManager.liquidate(erin);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(erin));

      /* Expected WStETH rewards: 
     Carol = 1992.01/1996 * 1996*0.995 = 1982.05 WStETH
     Alice = 1.995/1996 * 1996*0.995 = 1.985025 WStETH
     Bob = 1.995/1996 * 1996*0.995 = 1.985025 WStETH

    therefore, expected total collateral:

    Carol = 1991.01 + 1991.01 = 3974.06
    Alice = 1.995 + 1.985025 = 3.980025 WStETH
    Bob = 1.995 + 1.985025 = 3.980025 WStETH

    total = 3982.02 WStETH
    */

      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const carol_Coll = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .add(C_coll)
        .add(th.applyLiquidationFee(D_coll))
        .add(C_addedColl);
      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      );
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      );
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const C_collAfterL1 = C_coll.add(
        C_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).add(C_addedColl);
      const expected_C_coll = C_collAfterL1.add(
        C_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );

      assert.isAtMost(th.getDifference(alice_Coll, expected_A_coll), 1000);
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(th.getDifference(carol_Coll, expected_C_coll), 1000);

      //Expect 3982.02 WStETH in system now
      const entireSystemColl_3 = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      th.assertIsApproximatelyEqual(
        entireSystemColl_3,
        totalCollAfterL1.add(th.applyLiquidationFee(E_coll))
      );

      // check BaseFeeLMA gas compensation
      th.assertIsApproximatelyEqual(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: Trove with the majority stake tops up. A,B,C, D open. Liq(D). A, B, C top up. E Enters, Liq(E). Distributes correct rewards", async () => {
      const _998_Ether = toBN("998000000000000000000");
      // A, B, C open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol, value: _998_Ether },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis, value: dec(1000, "ether") },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Dennis
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txD.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // Expected rewards:  alice: 1 WStETH, bob: 1 WStETH, carol: 998 WStETH (*0.995)
      const alice_ETHReward_1 = await troveManager.getPendingWStETHReward(
        alice
      );
      const bob_ETHReward_1 = await troveManager.getPendingWStETHReward(bob);
      const carol_ETHReward_1 = await troveManager.getPendingWStETHReward(
        carol
      );

      //Expect 1995 WStETH in system now
      const entireSystemColl_1 = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      assert.equal(
        entireSystemColl_1,
        A_coll.add(B_coll).add(C_coll).add(th.applyLiquidationFee(D_coll))
      );

      const totalColl = A_coll.add(B_coll).add(C_coll);
      th.assertIsApproximatelyEqual(
        alice_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(A_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        bob_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(B_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        carol_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(C_coll).div(totalColl)
      );

      /* Alice, Bob, Carol each adds 1 WStETH to their troves, 
    bringing them to 2.995, 2.995, 1992.01 total coll each. */

      const addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(alice, alice, {
        from: alice,
        value: addedColl,
      });
      await borrowerOperations.addColl(bob, bob, {
        from: bob,
        value: addedColl,
      });
      await borrowerOperations.addColl(carol, carol, {
        from: carol,
        value: addedColl,
      });

      //Expect 1998 WStETH in system now
      const entireSystemColl_2 = (await activePool.getWStETH())
        .add(await defaultPool.getWStETH())
        .toString();
      th.assertIsApproximatelyEqual(
        entireSystemColl_2,
        totalColl
          .add(th.applyLiquidationFee(D_coll))
          .add(addedColl.mul(toBN(3)))
      );

      // E opens with another 1998 WStETH
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraParams: { from: erin, value: entireSystemColl_2 },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Erin
      const txE = await troveManager.liquidate(erin);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(erin));

      /* Expected WStETH rewards: 
     Carol = 1992.01/1998 * 1998*0.995 = 1982.04995 WStETH
     Alice = 2.995/1998 * 1998*0.995 = 2.980025 WStETH
     Bob = 2.995/1998 * 1998*0.995 = 2.980025 WStETH

    therefore, expected total collateral:

    Carol = 1992.01 + 1982.04995 = 3974.05995
    Alice = 2.995 + 2.980025 = 5.975025 WStETH
    Bob = 2.995 + 2.980025 = 5.975025 WStETH

    total = 3986.01 WStETH
    */

      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const carol_Coll = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .add(C_coll)
        .add(th.applyLiquidationFee(D_coll))
        .add(addedColl.mul(toBN(3)));
      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).add(addedColl);
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).add(addedColl);
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const C_collAfterL1 = C_coll.add(
        C_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).add(addedColl);
      const expected_C_coll = C_collAfterL1.add(
        C_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );

      assert.isAtMost(th.getDifference(alice_Coll, expected_A_coll), 1000);
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(th.getDifference(carol_Coll, expected_C_coll), 1000);

      //Expect 3986.01 WStETH in system now
      const entireSystemColl_3 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_3,
        totalCollAfterL1.add(th.applyLiquidationFee(E_coll))
      );

      // check BaseFeeLMA gas compensation
      th.assertIsApproximatelyEqual(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    // --- Trove withdraws collateral ---

    it("redistribution: A,B,C Open. Liq(C). B withdraws coll. Liq(A). B acquires all coll and debt", async () => {
      // A, B, C open troves
      const { collateral: A_coll, totalDebt: A_totalDebt } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll, totalDebt: B_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll, totalDebt: C_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Carol
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      //Bob withdraws 0.5 WStETH from his trove
      const withdrawnColl = toBN(dec(500, "finney"));
      await borrowerOperations.withdrawColl(withdrawnColl, bob, bob, {
        from: bob,
      });

      // Alice withdraws BaseFeeLMA
      await borrowerOperations.withdrawBaseFeeLMA(
        th._100pct,
        await getNetBorrowingAmount(A_totalDebt),
        alice,
        alice,
        { from: alice }
      );

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Alice
      const txA = await troveManager.liquidate(alice);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(alice));

      // Expect Bob now holds all Ether and BaseFeeLMADebt in the system: 2.5 Ether and 300 BaseFeeLMA
      // 1 + 0.995/2 - 0.5 + 1.4975*0.995
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const bob_BaseFeeLMADebt = (await troveManager.Troves(bob))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(bob))
        .toString();

      const expected_B_coll = B_coll.sub(withdrawnColl)
        .add(th.applyLiquidationFee(A_coll))
        .add(th.applyLiquidationFee(C_coll).mul(B_coll).div(A_coll.add(B_coll)))
        .add(
          th.applyLiquidationFee(
            th.applyLiquidationFee(C_coll).mul(A_coll).div(A_coll.add(B_coll))
          )
        );
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(
        th.getDifference(
          bob_BaseFeeLMADebt,
          A_totalDebt.mul(toBN(2)).add(B_totalDebt).add(C_totalDebt)
        ),
        1000
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: A,B,C Open. Liq(C). B withdraws coll. D Opens. Liq(D). Distributes correct rewards.", async () => {
      // A, B, C open troves
      const { collateral: A_coll, totalDebt: A_totalDebt } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll, totalDebt: B_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll, totalDebt: C_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Carol
      const txC = await troveManager.liquidate(carol);
      assert.isTrue(txC.receipt.status);
      assert.isFalse(await sortedTroves.contains(carol));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      //Bob  withdraws 0.5 WStETH from his trove
      const withdrawnColl = toBN(dec(500, "finney"));
      await borrowerOperations.withdrawColl(withdrawnColl, bob, bob, {
        from: bob,
      });

      // D opens trove
      const { collateral: D_coll, totalDebt: D_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate D
      const txA = await troveManager.liquidate(dennis);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      /* Bob rewards:
     L1: 0.4975 WStETH, 55 BaseFeeLMA
     L2: (0.9975/2.495)*0.995 = 0.3978 WStETH , 110*(0.9975/2.495)= 43.98 BaseFeeLMADebt

    coll: (1 + 0.4975 - 0.5 + 0.3968) = 1.3953 WStETH
    debt: (110 + 55 + 43.98 = 208.98 BaseFeeLMADebt 

     Alice rewards:
    L1 0.4975, 55 BaseFeeLMA
    L2 (1.4975/2.495)*0.995 = 0.5972 WStETH, 110*(1.4975/2.495) = 66.022 BaseFeeLMADebt

    coll: (1 + 0.4975 + 0.5972) = 2.0947 WStETH
    debt: (50 + 55 + 66.022) = 171.022 BaseFeeLMA Debt

    totalColl: 3.49 WStETH
    totalDebt 380 BaseFeeLMA (Includes 50 in each trove for gas compensation)
    */
      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const bob_BaseFeeLMADebt = (await troveManager.Troves(bob))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(bob))
        .toString();

      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const alice_BaseFeeLMADebt = (await troveManager.Troves(alice))[0]
        .add(await troveManager.getPendingBaseFeeLMADebtReward(alice))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .sub(withdrawnColl)
        .add(th.applyLiquidationFee(C_coll));
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      ).sub(withdrawnColl);
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(D_coll)).div(totalCollAfterL1)
      );
      const expected_B_debt = B_totalDebt.add(
        B_coll.mul(C_totalDebt).div(A_coll.add(B_coll))
      ).add(B_collAfterL1.mul(D_totalDebt).div(totalCollAfterL1));
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(
        th.getDifference(bob_BaseFeeLMADebt, expected_B_debt),
        10000
      );

      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(C_coll)).div(A_coll.add(B_coll))
      );
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(D_coll)).div(totalCollAfterL1)
      );
      const expected_A_debt = A_totalDebt.add(
        A_coll.mul(C_totalDebt).div(A_coll.add(B_coll))
      ).add(A_collAfterL1.mul(D_totalDebt).div(totalCollAfterL1));
      assert.isAtMost(th.getDifference(alice_Coll, expected_A_coll), 1000);
      assert.isAtMost(
        th.getDifference(alice_BaseFeeLMADebt, expected_A_debt),
        10000
      );

      const entireSystemColl = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl,
        A_coll.add(B_coll)
          .add(th.applyLiquidationFee(C_coll))
          .sub(withdrawnColl)
          .add(th.applyLiquidationFee(D_coll))
      );
      const entireSystemDebt = (await activePool.getBaseFeeLMADebt()).add(
        await defaultPool.getBaseFeeLMADebt()
      );
      th.assertIsApproximatelyEqual(
        entireSystemDebt,
        A_totalDebt.add(B_totalDebt).add(C_totalDebt).add(D_totalDebt)
      );

      // check BaseFeeLMA gas compensation
      th.assertIsApproximatelyEqual(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: Trove with the majority stake withdraws. A,B,C,D open. Liq(D). C withdraws some coll. E Enters, Liq(E). Distributes correct rewards", async () => {
      const _998_Ether = toBN("998000000000000000000");
      // A, B, C, D open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol, value: _998_Ether },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis, value: dec(1000, "ether") },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Dennis
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txD.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // Expected rewards:  alice: 1 WStETH, bob: 1 WStETH, carol: 998 WStETH (*0.995)
      const alice_ETHReward_1 = await troveManager.getPendingWStETHReward(
        alice
      );
      const bob_ETHReward_1 = await troveManager.getPendingWStETHReward(bob);
      const carol_ETHReward_1 = await troveManager.getPendingWStETHReward(
        carol
      );

      //Expect 1995 WStETH in system now
      const entireSystemColl_1 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_1,
        A_coll.add(B_coll).add(C_coll).add(th.applyLiquidationFee(D_coll))
      );

      const totalColl = A_coll.add(B_coll).add(C_coll);
      th.assertIsApproximatelyEqual(
        alice_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(A_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        bob_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(B_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        carol_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(C_coll).div(totalColl)
      );

      //Carol wthdraws 1 WStETH from her trove, brings it to 1990.01 total coll
      const C_withdrawnColl = toBN(dec(1, "ether"));
      await borrowerOperations.withdrawColl(C_withdrawnColl, carol, carol, {
        from: carol,
      });

      //Expect 1994 WStETH in system now
      const entireSystemColl_2 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_2,
        totalColl.add(th.applyLiquidationFee(D_coll)).sub(C_withdrawnColl)
      );

      // E opens with another 1994 WStETH
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraParams: { from: erin, value: entireSystemColl_2 },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Erin
      const txE = await troveManager.liquidate(erin);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(erin));

      /* Expected WStETH rewards: 
     Carol = 1990.01/1994 * 1994*0.995 = 1980.05995 WStETH
     Alice = 1.995/1994 * 1994*0.995 = 1.985025 WStETH
     Bob = 1.995/1994 * 1994*0.995 = 1.985025 WStETH

    therefore, expected total collateral:

    Carol = 1990.01 + 1980.05995 = 3970.06995
    Alice = 1.995 + 1.985025 = 3.980025 WStETH
    Bob = 1.995 + 1.985025 = 3.980025 WStETH

    total = 3978.03 WStETH
    */

      const alice_Coll = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const bob_Coll = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const carol_Coll = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .add(C_coll)
        .add(th.applyLiquidationFee(D_coll))
        .sub(C_withdrawnColl);
      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      );
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      );
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const C_collAfterL1 = C_coll.add(
        C_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).sub(C_withdrawnColl);
      const expected_C_coll = C_collAfterL1.add(
        C_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );

      assert.isAtMost(th.getDifference(alice_Coll, expected_A_coll), 1000);
      assert.isAtMost(th.getDifference(bob_Coll, expected_B_coll), 1000);
      assert.isAtMost(th.getDifference(carol_Coll, expected_C_coll), 1000);

      //Expect 3978.03 WStETH in system now
      const entireSystemColl_3 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_3,
        totalCollAfterL1.add(th.applyLiquidationFee(E_coll))
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    it("redistribution: Trove with the majority stake withdraws. A,B,C,D open. Liq(D). A, B, C withdraw. E Enters, Liq(E). Distributes correct rewards", async () => {
      const _998_Ether = toBN("998000000000000000000");
      // A, B, C, D open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(400, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: carol, value: _998_Ether },
      });
      const { collateral: D_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis, value: dec(1000, "ether") },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Dennis
      const txD = await troveManager.liquidate(dennis);
      assert.isTrue(txD.receipt.status);
      assert.isFalse(await sortedTroves.contains(dennis));

      // Price bounces back to 200 $/E
      await priceFeed.setPrice(dec(200, 18));

      // Expected rewards:  alice: 1 WStETH, bob: 1 WStETH, carol: 998 WStETH (*0.995)
      const alice_ETHReward_1 = await troveManager.getPendingWStETHReward(
        alice
      );
      const bob_ETHReward_1 = await troveManager.getPendingWStETHReward(bob);
      const carol_ETHReward_1 = await troveManager.getPendingWStETHReward(
        carol
      );

      //Expect 1995 WStETH in system now
      const entireSystemColl_1 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_1,
        A_coll.add(B_coll).add(C_coll).add(th.applyLiquidationFee(D_coll))
      );

      const totalColl = A_coll.add(B_coll).add(C_coll);
      th.assertIsApproximatelyEqual(
        alice_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(A_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        bob_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(B_coll).div(totalColl)
      );
      th.assertIsApproximatelyEqual(
        carol_ETHReward_1.toString(),
        th.applyLiquidationFee(D_coll).mul(C_coll).div(totalColl)
      );

      /* Alice, Bob, Carol each withdraw 0.5 WStETH to their troves, 
    bringing them to 1.495, 1.495, 1990.51 total coll each. */
      const withdrawnColl = toBN(dec(500, "finney"));
      await borrowerOperations.withdrawColl(withdrawnColl, alice, alice, {
        from: alice,
      });
      await borrowerOperations.withdrawColl(withdrawnColl, bob, bob, {
        from: bob,
      });
      await borrowerOperations.withdrawColl(withdrawnColl, carol, carol, {
        from: carol,
      });

      const alice_Coll_1 = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const bob_Coll_1 = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const carol_Coll_1 = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      const totalColl_1 = A_coll.add(B_coll).add(C_coll);
      assert.isAtMost(
        th.getDifference(
          alice_Coll_1,
          A_coll.add(
            th.applyLiquidationFee(D_coll).mul(A_coll).div(totalColl_1)
          ).sub(withdrawnColl)
        ),
        1000
      );
      assert.isAtMost(
        th.getDifference(
          bob_Coll_1,
          B_coll.add(
            th.applyLiquidationFee(D_coll).mul(B_coll).div(totalColl_1)
          ).sub(withdrawnColl)
        ),
        1000
      );
      assert.isAtMost(
        th.getDifference(
          carol_Coll_1,
          C_coll.add(
            th.applyLiquidationFee(D_coll).mul(C_coll).div(totalColl_1)
          ).sub(withdrawnColl)
        ),
        1000
      );

      //Expect 1993.5 WStETH in system now
      const entireSystemColl_2 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_2,
        totalColl
          .add(th.applyLiquidationFee(D_coll))
          .sub(withdrawnColl.mul(toBN(3)))
      );

      // E opens with another 1993.5 WStETH
      const { collateral: E_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraParams: { from: erin, value: entireSystemColl_2 },
      });

      // Price drops to 100 $/E
      await priceFeed.setPrice(dec(100, 18));

      // Liquidate Erin
      const txE = await troveManager.liquidate(erin);
      assert.isTrue(txE.receipt.status);
      assert.isFalse(await sortedTroves.contains(erin));

      /* Expected WStETH rewards: 
     Carol = 1990.51/1993.5 * 1993.5*0.995 = 1980.55745 WStETH
     Alice = 1.495/1993.5 * 1993.5*0.995 = 1.487525 WStETH
     Bob = 1.495/1993.5 * 1993.5*0.995 = 1.487525 WStETH

    therefore, expected total collateral:

    Carol = 1990.51 + 1980.55745 = 3971.06745
    Alice = 1.495 + 1.487525 = 2.982525 WStETH
    Bob = 1.495 + 1.487525 = 2.982525 WStETH

    total = 3977.0325 WStETH
    */

      const alice_Coll_2 = (await troveManager.Troves(alice))[1]
        .add(await troveManager.getPendingWStETHReward(alice))
        .toString();

      const bob_Coll_2 = (await troveManager.Troves(bob))[1]
        .add(await troveManager.getPendingWStETHReward(bob))
        .toString();

      const carol_Coll_2 = (await troveManager.Troves(carol))[1]
        .add(await troveManager.getPendingWStETHReward(carol))
        .toString();

      const totalCollAfterL1 = A_coll.add(B_coll)
        .add(C_coll)
        .add(th.applyLiquidationFee(D_coll))
        .sub(withdrawnColl.mul(toBN(3)));
      const A_collAfterL1 = A_coll.add(
        A_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).sub(withdrawnColl);
      const expected_A_coll = A_collAfterL1.add(
        A_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const B_collAfterL1 = B_coll.add(
        B_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).sub(withdrawnColl);
      const expected_B_coll = B_collAfterL1.add(
        B_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );
      const C_collAfterL1 = C_coll.add(
        C_coll.mul(th.applyLiquidationFee(D_coll)).div(
          A_coll.add(B_coll).add(C_coll)
        )
      ).sub(withdrawnColl);
      const expected_C_coll = C_collAfterL1.add(
        C_collAfterL1.mul(th.applyLiquidationFee(E_coll)).div(totalCollAfterL1)
      );

      assert.isAtMost(th.getDifference(alice_Coll_2, expected_A_coll), 1000);
      assert.isAtMost(th.getDifference(bob_Coll_2, expected_B_coll), 1000);
      assert.isAtMost(th.getDifference(carol_Coll_2, expected_C_coll), 1000);

      //Expect 3977.0325 WStETH in system now
      const entireSystemColl_3 = (await activePool.getWStETH()).add(
        await defaultPool.getWStETH()
      );
      th.assertIsApproximatelyEqual(
        entireSystemColl_3,
        totalCollAfterL1.add(th.applyLiquidationFee(E_coll))
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(400, 18)
      );
    });

    // For calculations of correct values used in test, see scenario 1:
    // https://docs.google.com/spreadsheets/d/1F5p3nZy749K5jwO-bwJeTsRoY7ewMfWIQ3QHtokxqzo/edit?usp=sharing
    it("redistribution, all operations: A,B,C open. Liq(A). D opens. B adds, C withdraws. Liq(B). E & F open. D adds. Liq(F). Distributes correct rewards", async () => {
      // A, B, C open troves
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: alice },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: bob },
      });
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: carol },
      });

      // Price drops to 1 $/E
      await priceFeed.setPrice(dec(1, 18));

      // Liquidate A
      const txA = await troveManager.liquidate(alice);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(alice));

      // Check rewards for B and C
      const B_pendingRewardsAfterL1 = th
        .applyLiquidationFee(A_coll)
        .mul(B_coll)
        .div(B_coll.add(C_coll));
      const C_pendingRewardsAfterL1 = th
        .applyLiquidationFee(A_coll)
        .mul(C_coll)
        .div(B_coll.add(C_coll));
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(bob),
          B_pendingRewardsAfterL1
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(carol),
          C_pendingRewardsAfterL1
        ),
        1000000
      );

      const totalStakesSnapshotAfterL1 = B_coll.add(C_coll);
      const totalCollateralSnapshotAfterL1 = totalStakesSnapshotAfterL1.add(
        th.applyLiquidationFee(A_coll)
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalStakesSnapshot(),
        totalStakesSnapshotAfterL1
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalCollateralSnapshot(),
        totalCollateralSnapshotAfterL1
      );

      // Price rises to 1000
      await priceFeed.setPrice(dec(1000, 18));

      // D opens trove
      const { collateral: D_coll, totalDebt: D_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: dennis },
      });

      //Bob adds 1 WStETH to his trove
      const B_addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(bob, bob, {
        from: bob,
        value: B_addedColl,
      });

      //Carol  withdraws 1 WStETH from her trove
      const C_withdrawnColl = toBN(dec(1, "ether"));
      await borrowerOperations.withdrawColl(C_withdrawnColl, carol, carol, {
        from: carol,
      });

      const B_collAfterL1 = B_coll.add(B_pendingRewardsAfterL1).add(
        B_addedColl
      );
      const C_collAfterL1 = C_coll.add(C_pendingRewardsAfterL1).sub(
        C_withdrawnColl
      );

      // Price drops
      await priceFeed.setPrice(dec(1, 18));

      // Liquidate B
      const txB = await troveManager.liquidate(bob);
      assert.isTrue(txB.receipt.status);
      assert.isFalse(await sortedTroves.contains(bob));

      // Check rewards for C and D
      const C_pendingRewardsAfterL2 = C_collAfterL1.mul(
        th.applyLiquidationFee(B_collAfterL1)
      ).div(C_collAfterL1.add(D_coll));
      const D_pendingRewardsAfterL2 = D_coll.mul(
        th.applyLiquidationFee(B_collAfterL1)
      ).div(C_collAfterL1.add(D_coll));
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(carol),
          C_pendingRewardsAfterL2
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(dennis),
          D_pendingRewardsAfterL2
        ),
        1000000
      );

      const totalStakesSnapshotAfterL2 = totalStakesSnapshotAfterL1
        .add(
          D_coll.mul(totalStakesSnapshotAfterL1).div(
            totalCollateralSnapshotAfterL1
          )
        )
        .sub(B_coll)
        .sub(
          C_withdrawnColl.mul(totalStakesSnapshotAfterL1).div(
            totalCollateralSnapshotAfterL1
          )
        );
      const defaultedAmountAfterL2 = th
        .applyLiquidationFee(
          B_coll.add(B_addedColl).add(B_pendingRewardsAfterL1)
        )
        .add(C_pendingRewardsAfterL1);
      const totalCollateralSnapshotAfterL2 = C_coll.sub(C_withdrawnColl)
        .add(D_coll)
        .add(defaultedAmountAfterL2);
      th.assertIsApproximatelyEqual(
        await troveManager.totalStakesSnapshot(),
        totalStakesSnapshotAfterL2
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalCollateralSnapshot(),
        totalCollateralSnapshotAfterL2
      );

      // Price rises to 1000
      await priceFeed.setPrice(dec(1000, 18));

      // E and F open troves
      const { collateral: E_coll, totalDebt: E_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: erin },
      });
      const { collateral: F_coll, totalDebt: F_totalDebt } = await openTrove({
        ICR: toBN(dec(200, 16)),
        extraBaseFeeLMAAmount: dec(110, 18),
        extraParams: { from: freddy },
      });

      // D tops up
      const D_addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(dennis, dennis, {
        from: dennis,
        value: D_addedColl,
      });

      // Price drops to 1
      await priceFeed.setPrice(dec(1, 18));

      // Liquidate F
      const txF = await troveManager.liquidate(freddy);
      assert.isTrue(txF.receipt.status);
      assert.isFalse(await sortedTroves.contains(freddy));

      // Grab remaining troves' collateral
      const carol_rawColl = (await troveManager.Troves(carol))[1].toString();
      const carol_pendingETHReward = (
        await troveManager.getPendingWStETHReward(carol)
      ).toString();

      const dennis_rawColl = (await troveManager.Troves(dennis))[1].toString();
      const dennis_pendingETHReward = (
        await troveManager.getPendingWStETHReward(dennis)
      ).toString();

      const erin_rawColl = (await troveManager.Troves(erin))[1].toString();
      const erin_pendingETHReward = (
        await troveManager.getPendingWStETHReward(erin)
      ).toString();

      // Check raw collateral of C, D, E
      const C_collAfterL2 = C_collAfterL1.add(C_pendingRewardsAfterL2);
      const D_collAfterL2 = D_coll.add(D_pendingRewardsAfterL2).add(
        D_addedColl
      );
      const totalCollForL3 = C_collAfterL2.add(D_collAfterL2).add(E_coll);
      const C_collAfterL3 = C_collAfterL2.add(
        C_collAfterL2.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      const D_collAfterL3 = D_collAfterL2.add(
        D_collAfterL2.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      const E_collAfterL3 = E_coll.add(
        E_coll.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      assert.isAtMost(th.getDifference(carol_rawColl, C_collAfterL1), 1000);
      assert.isAtMost(th.getDifference(dennis_rawColl, D_collAfterL2), 1000000);
      assert.isAtMost(th.getDifference(erin_rawColl, E_coll), 1000);

      // Check pending WStETH rewards of C, D, E
      assert.isAtMost(
        th.getDifference(
          carol_pendingETHReward,
          C_collAfterL3.sub(C_collAfterL1)
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          dennis_pendingETHReward,
          D_collAfterL3.sub(D_collAfterL2)
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(erin_pendingETHReward, E_collAfterL3.sub(E_coll)),
        1000000
      );

      // Check systemic collateral
      const activeColl = (await activePool.getWStETH()).toString();
      const defaultColl = (await defaultPool.getWStETH()).toString();

      assert.isAtMost(
        th.getDifference(
          activeColl,
          C_collAfterL1.add(D_collAfterL2.add(E_coll))
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          defaultColl,
          C_collAfterL3.sub(C_collAfterL1)
            .add(D_collAfterL3.sub(D_collAfterL2))
            .add(E_collAfterL3.sub(E_coll))
        ),
        1000000
      );

      // Check system snapshots
      const totalStakesSnapshotAfterL3 = totalStakesSnapshotAfterL2.add(
        D_addedColl.add(E_coll)
          .mul(totalStakesSnapshotAfterL2)
          .div(totalCollateralSnapshotAfterL2)
      );
      const totalCollateralSnapshotAfterL3 = C_coll.sub(C_withdrawnColl)
        .add(D_coll)
        .add(D_addedColl)
        .add(E_coll)
        .add(defaultedAmountAfterL2)
        .add(th.applyLiquidationFee(F_coll));
      const totalStakesSnapshot = (
        await troveManager.totalStakesSnapshot()
      ).toString();
      const totalCollateralSnapshot = (
        await troveManager.totalCollateralSnapshot()
      ).toString();
      th.assertIsApproximatelyEqual(
        totalStakesSnapshot,
        totalStakesSnapshotAfterL3
      );
      th.assertIsApproximatelyEqual(
        totalCollateralSnapshot,
        totalCollateralSnapshotAfterL3
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(600, 18)
      );
    });

    // For calculations of correct values used in test, see scenario 2:
    // https://docs.google.com/spreadsheets/d/1F5p3nZy749K5jwO-bwJeTsRoY7ewMfWIQ3QHtokxqzo/edit?usp=sharing
    it("redistribution, all operations: A,B,C open. Liq(A). D opens. B adds, C withdraws. Liq(B). E & F open. D adds. Liq(F). Varying coll. Distributes correct rewards", async () => {
      /* A, B, C open troves.
    A: 450 WStETH
    B: 8901 WStETH
    C: 23.902 WStETH
    */
      const { collateral: A_coll } = await openTrove({
        ICR: toBN(dec(90000, 16)),
        extraParams: { from: alice, value: toBN("450000000000000000000") },
      });
      const { collateral: B_coll } = await openTrove({
        ICR: toBN(dec(1800000, 16)),
        extraParams: { from: bob, value: toBN("8901000000000000000000") },
      });
      const { collateral: C_coll } = await openTrove({
        ICR: toBN(dec(4600, 16)),
        extraParams: { from: carol, value: toBN("23902000000000000000") },
      });

      // Price drops
      await priceFeed.setPrice("1");

      // Liquidate A
      const txA = await troveManager.liquidate(alice);
      assert.isTrue(txA.receipt.status);
      assert.isFalse(await sortedTroves.contains(alice));

      // Check rewards for B and C
      const B_pendingRewardsAfterL1 = th
        .applyLiquidationFee(A_coll)
        .mul(B_coll)
        .div(B_coll.add(C_coll));
      const C_pendingRewardsAfterL1 = th
        .applyLiquidationFee(A_coll)
        .mul(C_coll)
        .div(B_coll.add(C_coll));
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(bob),
          B_pendingRewardsAfterL1
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(carol),
          C_pendingRewardsAfterL1
        ),
        1000000
      );

      const totalStakesSnapshotAfterL1 = B_coll.add(C_coll);
      const totalCollateralSnapshotAfterL1 = totalStakesSnapshotAfterL1.add(
        th.applyLiquidationFee(A_coll)
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalStakesSnapshot(),
        totalStakesSnapshotAfterL1
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalCollateralSnapshot(),
        totalCollateralSnapshotAfterL1
      );

      // Price rises
      await priceFeed.setPrice(dec(1, 27));

      // D opens trove: 0.035 WStETH
      const { collateral: D_coll, totalDebt: D_totalDebt } = await openTrove({
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: dennis, value: toBN(dec(35, 15)) },
      });

      // Bob adds 11.33909 WStETH to his trove
      const B_addedColl = toBN("11339090000000000000");
      await borrowerOperations.addColl(bob, bob, {
        from: bob,
        value: B_addedColl,
      });

      // Carol withdraws 15 WStETH from her trove
      const C_withdrawnColl = toBN(dec(15, "ether"));
      await borrowerOperations.withdrawColl(C_withdrawnColl, carol, carol, {
        from: carol,
      });

      const B_collAfterL1 = B_coll.add(B_pendingRewardsAfterL1).add(
        B_addedColl
      );
      const C_collAfterL1 = C_coll.add(C_pendingRewardsAfterL1).sub(
        C_withdrawnColl
      );

      // Price drops
      await priceFeed.setPrice("1");

      // Liquidate B
      const txB = await troveManager.liquidate(bob);
      assert.isTrue(txB.receipt.status);
      assert.isFalse(await sortedTroves.contains(bob));

      // Check rewards for C and D
      const C_pendingRewardsAfterL2 = C_collAfterL1.mul(
        th.applyLiquidationFee(B_collAfterL1)
      ).div(C_collAfterL1.add(D_coll));
      const D_pendingRewardsAfterL2 = D_coll.mul(
        th.applyLiquidationFee(B_collAfterL1)
      ).div(C_collAfterL1.add(D_coll));
      const C_collAfterL2 = C_collAfterL1.add(C_pendingRewardsAfterL2);
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(carol),
          C_pendingRewardsAfterL2
        ),
        10000000
      );
      assert.isAtMost(
        th.getDifference(
          await troveManager.getPendingWStETHReward(dennis),
          D_pendingRewardsAfterL2
        ),
        10000000
      );

      const totalStakesSnapshotAfterL2 = totalStakesSnapshotAfterL1
        .add(
          D_coll.mul(totalStakesSnapshotAfterL1).div(
            totalCollateralSnapshotAfterL1
          )
        )
        .sub(B_coll)
        .sub(
          C_withdrawnColl.mul(totalStakesSnapshotAfterL1).div(
            totalCollateralSnapshotAfterL1
          )
        );
      const defaultedAmountAfterL2 = th
        .applyLiquidationFee(
          B_coll.add(B_addedColl).add(B_pendingRewardsAfterL1)
        )
        .add(C_pendingRewardsAfterL1);
      const totalCollateralSnapshotAfterL2 = C_coll.sub(C_withdrawnColl)
        .add(D_coll)
        .add(defaultedAmountAfterL2);
      th.assertIsApproximatelyEqual(
        await troveManager.totalStakesSnapshot(),
        totalStakesSnapshotAfterL2
      );
      th.assertIsApproximatelyEqual(
        await troveManager.totalCollateralSnapshot(),
        totalCollateralSnapshotAfterL2
      );

      // Price rises
      await priceFeed.setPrice(dec(1, 27));

      /* E and F open troves.
    E: 10000 WStETH
    F: 0.0007 WStETH
    */
      const { collateral: E_coll, totalDebt: E_totalDebt } = await openTrove({
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: erin, value: toBN(dec(1, 22)) },
      });
      const { collateral: F_coll, totalDebt: F_totalDebt } = await openTrove({
        extraBaseFeeLMAAmount: dec(100, 18),
        extraParams: { from: freddy, value: toBN("700000000000000") },
      });

      // D tops up
      const D_addedColl = toBN(dec(1, "ether"));
      await borrowerOperations.addColl(dennis, dennis, {
        from: dennis,
        value: D_addedColl,
      });

      const D_collAfterL2 = D_coll.add(D_pendingRewardsAfterL2).add(
        D_addedColl
      );

      // Price drops
      await priceFeed.setPrice("1");

      // Liquidate F
      const txF = await troveManager.liquidate(freddy);
      assert.isTrue(txF.receipt.status);
      assert.isFalse(await sortedTroves.contains(freddy));

      // Grab remaining troves' collateral
      const carol_rawColl = (await troveManager.Troves(carol))[1].toString();
      const carol_pendingETHReward = (
        await troveManager.getPendingWStETHReward(carol)
      ).toString();
      const carol_Stake = (await troveManager.Troves(carol))[2].toString();

      const dennis_rawColl = (await troveManager.Troves(dennis))[1].toString();
      const dennis_pendingETHReward = (
        await troveManager.getPendingWStETHReward(dennis)
      ).toString();
      const dennis_Stake = (await troveManager.Troves(dennis))[2].toString();

      const erin_rawColl = (await troveManager.Troves(erin))[1].toString();
      const erin_pendingETHReward = (
        await troveManager.getPendingWStETHReward(erin)
      ).toString();
      const erin_Stake = (await troveManager.Troves(erin))[2].toString();

      // Check raw collateral of C, D, E
      const totalCollForL3 = C_collAfterL2.add(D_collAfterL2).add(E_coll);
      const C_collAfterL3 = C_collAfterL2.add(
        C_collAfterL2.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      const D_collAfterL3 = D_collAfterL2.add(
        D_collAfterL2.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      const E_collAfterL3 = E_coll.add(
        E_coll.mul(th.applyLiquidationFee(F_coll)).div(totalCollForL3)
      );
      assert.isAtMost(th.getDifference(carol_rawColl, C_collAfterL1), 1000);
      assert.isAtMost(th.getDifference(dennis_rawColl, D_collAfterL2), 1000000);
      assert.isAtMost(th.getDifference(erin_rawColl, E_coll), 1000);

      // Check pending WStETH rewards of C, D, E
      assert.isAtMost(
        th.getDifference(
          carol_pendingETHReward,
          C_collAfterL3.sub(C_collAfterL1)
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          dennis_pendingETHReward,
          D_collAfterL3.sub(D_collAfterL2)
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(erin_pendingETHReward, E_collAfterL3.sub(E_coll)),
        1000000
      );

      // Check systemic collateral
      const activeColl = (await activePool.getWStETH()).toString();
      const defaultColl = (await defaultPool.getWStETH()).toString();

      assert.isAtMost(
        th.getDifference(
          activeColl,
          C_collAfterL1.add(D_collAfterL2.add(E_coll))
        ),
        1000000
      );
      assert.isAtMost(
        th.getDifference(
          defaultColl,
          C_collAfterL3.sub(C_collAfterL1)
            .add(D_collAfterL3.sub(D_collAfterL2))
            .add(E_collAfterL3.sub(E_coll))
        ),
        1000000
      );

      // Check system snapshots
      const totalStakesSnapshotAfterL3 = totalStakesSnapshotAfterL2.add(
        D_addedColl.add(E_coll)
          .mul(totalStakesSnapshotAfterL2)
          .div(totalCollateralSnapshotAfterL2)
      );
      const totalCollateralSnapshotAfterL3 = C_coll.sub(C_withdrawnColl)
        .add(D_coll)
        .add(D_addedColl)
        .add(E_coll)
        .add(defaultedAmountAfterL2)
        .add(th.applyLiquidationFee(F_coll));
      const totalStakesSnapshot = (
        await troveManager.totalStakesSnapshot()
      ).toString();
      const totalCollateralSnapshot = (
        await troveManager.totalCollateralSnapshot()
      ).toString();
      th.assertIsApproximatelyEqual(
        totalStakesSnapshot,
        totalStakesSnapshotAfterL3
      );
      th.assertIsApproximatelyEqual(
        totalCollateralSnapshot,
        totalCollateralSnapshotAfterL3
      );

      // check BaseFeeLMA gas compensation
      assert.equal(
        (await baseFeeLMAToken.balanceOf(owner)).toString(),
        dec(600, 18)
      );
    });
  }
);
