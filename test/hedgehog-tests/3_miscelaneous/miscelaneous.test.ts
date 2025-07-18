// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
// import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
// import { expect } from "chai";
// import { BigNumberish } from "ethers";
// import { ethers } from "hardhat";
// import {
//   CommunityIssuance,
//   ERC20Mock,
//   HOGToken,
//   TestPriceFeed,
// } from "../../../typechain-types";
// import {
//   ActivePool,
//   BaseFeeLMAToken,
//   BaseFeeOracle,
//   BorrowerOperations,
//   CollSurplusPool,
//   DefaultPool,
//   HintHelpers,
//   SortedTroves,
//   StabilityPool,
//   TroveManager,
// } from "../../../typechain-types/contracts";
// import { getSigners, setupContracts } from "../../utils";

// const { latestBlock, increase, advanceBlock } = time;

// const compareWithFault = (
//   arg1: bigint | number,
//   arg2: bigint | number,
//   faultScale = 100000
// ) => {
//   expect(arg1).to.be.lessThanOrEqual(
//     BigInt(arg2) / BigInt(faultScale) + BigInt(arg2)
//   );

//   expect(arg1).to.be.greaterThanOrEqual(
//     BigInt(arg2) / BigInt(faultScale) - BigInt(arg2)
//   );
// };

// describe("Hedgehog Core Contracts Smoke tests", () => {
//   context("Base functionality and Access Control", () => {
//     let deployer: SignerWithAddress, //ultimate admin
//       setter: SignerWithAddress,
//       hacker: SignerWithAddress,
//       alice: SignerWithAddress,
//       bob: SignerWithAddress,
//       carol: SignerWithAddress,
//       dave: SignerWithAddress;
//     let oracle: BaseFeeOracle;
//     let priceFeed: TestPriceFeed;
//     let sortedTroves: SortedTroves;
//     let troveManager: TroveManager;
//     let activePool: ActivePool;
//     let stabilityPool: StabilityPool;
//     let defaultPool: DefaultPool;
//     let gasPool: any;
//     let collSurplusPool: CollSurplusPool;
//     let borrowerOperations: BorrowerOperations;
//     let hintHelpers: HintHelpers;
//     let baseFeeLMAToken: BaseFeeLMAToken;
//     let communityIssuance: CommunityIssuance;
//     let hogToken: HOGToken;
//     let payToken: ERC20Mock;
//     let mainOracle: BaseFeeOracle, secondaryOracle: BaseFeeOracle;

//     const gasCompensationReserve = BigInt("50000");
//     const gasPrice010 = "30000000000";
//     const gasPrice1114 = "60000000000";

//     const AliceTroveColl = BigInt("301000000000000000");
//     const AliceTroveDebtWithError = BigInt("100000000");
//     const AliceTroveDebt = BigInt("2000000");
//     const AliceTroveOpeningFee = BigInt("10000");
//     const AliceBFEBalanceAtOpening = BigInt("1940000");
//     const AliceInitialCR = BigInt("5016666666666666666");
//     const AliceTroveIncreaseDebt = BigInt("1800000");
//     const AliceDebtAfterFirstIncrease = BigInt("3800000");
//     const AliceCollAfterFirstIncrease = BigInt("301000000000000000");
//     const AliceCRAfterFirstIncrease = BigInt("2640350877192982456");
//     const AliceTroveCollAfterBobRedemption = BigInt("287650000000000000");
//     const AliceTroveDebtAfterBobRedemption = BigInt("3355000");
//     const AliceCRAfterBobRedemption = BigInt("2857923497267759562");
//     const AliceRedemptionFirst = BigInt("39751");
//     const AliceReceivedWStEthForRedemption = BigInt("2363479375669996");
//     const AliceCRAtLiquidation = BigInt("1428961748633879781");

//     const BobTroveColl = BigInt("1500000000000000000");
//     const BobTroveDebt = BigInt("1000000");
//     const BobInitialCR = BigInt("50000000000000000000");
//     const BobTroveOpeningFee = BigInt("505000");
//     const BobIdealBFEBalanceAtOpening = BigInt("445000");
//     const BobActualBFEBalanceAtOpening = BigInt("445000");
//     const BobUnstakeFirst = BigInt("445000");
//     const BobRedemptionFirst = BigInt("445000");
//     const BobCollBalanceAfterRedemption = BigInt("13236361681136544");
//     const BobTroveIncreaseCollFirst = BigInt("900000000000000000");
//     const BobTroveCollAfterIncrease = BigInt("2400000000000000000");
//     const BobTroveDebtAfterIncrease = BigInt("1000000");
//     const BobCRAfterIncrease = BigInt("40000000000000000000");
//     const BobTroveCollAfterLiquid = BigInt("2426046952164232488");
//     const BobTroveDebtAfterLiquid = BigInt("1305323");
//     const BobCRAfterLiquid = BigInt("30976329896434732859");

//     const BobTroveCollAfterRedemption = BigInt("2019320733470193740");
//     const BobTroveDebtAfterRedemption = BigInt("3214685");
//     const BobTroveIncreaseDebtSecond = BigInt("10000000");
//     const BobTroveCollAfterSecondIncrease = BigInt("2426046952164232488");
//     const BobTroveDebtAfterSecondIncrease = BigInt("1305323");
//     const BobCRAfterSecondIncrease = BigInt("3576555563198315943");

//     const CarolTroveColl = BigInt("2000000000000000000");
//     const CarolTroveDebt = BigInt("3000000");
//     const CarolTroveOpeningFee = BigInt("2094762");
//     const CarolInitialCR = BigInt("22222222222222222222");
//     const CarolBFEBalanceAtOpening = BigInt("855238");
//     const CarolTroveCollAfterLiquid = BigInt("2021705793470193740");
//     const CarolTroveDebtAfterLiquid = BigInt("3254436");
//     const CarolCRAfterLiquid = BigInt("10353590163652492270");
//     const CarolIncreaseDebt = BigInt("50000");
//     const CarolIncreaseColl = BigInt("40000000000000000");

//     const totalCollateralAliceOpening = BigInt("301000000000000000");
//     const totalDebtAliceOpening = BigInt("2000000");
//     const totalCollateralBobOpening = BigInt("1801000000000000000");
//     const totalDebtBobOpening = BigInt("3000000");
//     const totalDebtAliceIncrease = BigInt("4800000");
//     const totalCollAliceIncrease = BigInt("1801000000000000000");
//     const totalCollCarolOpening = BigInt("3801000000000000000");
//     const totalDebtCarolOpening = BigInt("7800000");
//     const totalCollBobFirstRedemption = BigInt("3787650000000000000");
//     const totalDebtBobFirstRedemption = BigInt("7355000");
//     const totalCollBobIncrease = BigInt("4687650000000000000");
//     const totalDebtBobIncrease = BigInt("7355000");
//     const totalCollJustBeforeAliceLiquidated = BigInt("4687650000000000000");
//     const totalDebtJustBeforeAliceLiquidated = BigInt("7355000");
//     const totalCollAliceLiquidated = BigInt("4447752745634426230");
//     const totalDebtAliceLiquidated = BigInt("4559762");
//     const totalCollAliceRedeemsBob = BigInt("4445367685634426230");
//     const totalDebtAliceRedeemsBob = BigInt("4520011");

//     before(async () => {
//       [deployer, setter, hacker, alice, bob, carol] = await getSigners({
//         fork: false,
//       });

//       [
//         priceFeed,
//         sortedTroves,
//         troveManager,
//         activePool,
//         stabilityPool,
//         defaultPool,
//         gasPool,
//         collSurplusPool,
//         borrowerOperations,
//         hintHelpers,
//         baseFeeLMAToken,
//         communityIssuance,
//         hogToken,
//         payToken,
//         mainOracle,
//         secondaryOracle,
//       ] = await setupContracts();
//     });

//     type OpenTroveParams = {
//       caller: SignerWithAddress;
//       maxFeePercentage: number;
//       baseFeeLMAAmount: string | BigNumberish;
//       collAmount: string | BigNumberish;
//       upperHint: string;
//       lowerHint: string;
//     };
//     const openTrove = async ({
//       caller = bob,
//       maxFeePercentage = 1,
//       baseFeeLMAAmount = "0",
//       collAmount = "0",
//       upperHint = ethers.ZeroAddress,
//       lowerHint = ethers.ZeroAddress,
//     }: Partial<OpenTroveParams> = {}) => {
//       await payToken
//         .connect(caller)
//         .approve(await borrowerOperations.getAddress(), collAmount);
//       await borrowerOperations
//         .connect(caller)
//         .openTrove(
//           ethers.parseEther(maxFeePercentage.toString()),
//           baseFeeLMAAmount,
//           collAmount,
//           upperHint,
//           lowerHint
//         );
//     };

//     type GetCRParams = {
//       owner: SignerWithAddress;
//     };
//     const getCR = async ({ owner = bob }: Partial<GetCRParams> = {}) => {
//       return await troveManager.getUnreliableTroveICR(owner.address);
//     };

//     const getTrove = async (caller = bob) => {
//       const { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward } =
//         await troveManager.getEntireDebtAndColl(caller.address);

//       return { debt, coll, pendingBaseFeeLMADebtReward, pendingWStETHReward };
//     };

//     const logAllDebtColl = async () => {
//       const coll = await troveManager.getEntireSystemColl();
//       const debt = await troveManager.getEntireSystemDebt();

//       const { debt: aliceDebt, coll: aliceColl } = await getTrove(alice);
//       const { debt: bobDebt, coll: bobColl } = await getTrove(bob);
//       const { debt: carolDebt, coll: carolColl } = await getTrove(carol);

//       console.log("total debt: ", debt);
//       console.log("total coll: ", coll);
//       console.log("aliceColl: ", aliceColl);
//       console.log("aliceDebt: ", aliceDebt);
//       console.log("bobColl: ", bobColl);
//       console.log("bobDebt: ", bobDebt);
//       console.log("carolColl: ", carolColl);
//       console.log("carolDebt: ", carolDebt);
//     };

//     type ProvideParams = {
//       caller: SignerWithAddress;
//       amount: string | BigNumberish;
//     };
//     const provide = async ({
//       caller = bob,
//       amount = BigInt(0),
//     }: Partial<ProvideParams> = {}) => {
//       await baseFeeLMAToken.approve(await stabilityPool.getAddress(), amount);

//       await stabilityPool.connect(caller).provideToSP(amount);
//     };

//     type AdjustTroveParams = {
//       caller: SignerWithAddress;
//       amount: string | BigNumberish;
//       maxFeePercentage: string | BigNumberish;
//       upperHint: string;
//       lowerHint: string;
//     };

//     const decreaseDebt = async ({
//       caller = bob,
//       amount = 0,
//       maxFeePercentage = ethers.parseEther("1"),
//     }: Partial<AdjustTroveParams> = {}) => {
//       await borrowerOperations
//         .connect(caller)
//         .adjustTrove(
//           maxFeePercentage,
//           0,
//           0,
//           amount,
//           false,
//           ethers.ZeroAddress,
//           ethers.ZeroAddress
//         );
//     };

//     const increaseDebt = async ({
//       caller = bob,
//       amount = 0,
//       maxFeePercentage = ethers.parseEther("1"),
//     }: Partial<AdjustTroveParams> = {}) => {
//       await borrowerOperations
//         .connect(caller)
//         .adjustTrove(
//           maxFeePercentage,
//           0,
//           0,
//           amount,
//           true,
//           ethers.ZeroAddress,
//           ethers.ZeroAddress
//         );
//     };

//     const increaseColl = async ({
//       caller = bob,
//       amount = 0,
//     }: Partial<AdjustTroveParams> = {}) => {
//       await payToken
//         .connect(caller)
//         .approve(await borrowerOperations.getAddress(), amount);
//       await borrowerOperations
//         .connect(caller)
//         .addColl(ethers.ZeroAddress, ethers.ZeroAddress, amount);
//     };

//     const setNewBaseFeePrice = async (_amount: number | bigint) => {
//       const amount = ethers.parseUnits(_amount.toString(), "gwei");
//       const block = await latestBlock();
//       await mainOracle.feedBaseFeeValue(amount, block);
//       await secondaryOracle.feedBaseFeeValue(amount, block);
//       await priceFeed.fetchPrice();
//     };

//     const checkCollDebtCorrectness = async (
//       expectedColl: bigint,
//       expectedDebt: bigint
//     ) => {
//       const coll = await troveManager.getEntireSystemColl();
//       const debt = await troveManager.getEntireSystemDebt();

//       expect(coll).to.be.equal(expectedColl);
//       expect(debt).to.be.equal(expectedDebt);
//     };

//     it("should not let open trove if CR is below minimum", async () => {
//       await priceFeed.setLastGoodPrice(gasPrice010);

//       await expect(
//         openTrove({
//           caller: alice,
//           baseFeeLMAAmount: AliceTroveDebtWithError,
//           collAmount: AliceTroveColl,
//         })
//       ).to.be.revertedWith(
//         "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
//       );
//     });

//     it("should correctly calculate estimated cr", async () => {
//       expect(
//         await borrowerOperations.computeUnreliableCR(
//           AliceTroveColl,
//           AliceTroveDebt
//         )
//       ).to.be.equal(AliceInitialCR);
//     });

//     it("should let open trove to Alice with correct params", async () => {
//       await openTrove({
//         caller: alice,
//         baseFeeLMAAmount: AliceTroveDebt,
//         collAmount: AliceTroveColl,
//       });
//     });

//     it("should have a correct entire system debt", async () => {
//       await checkCollDebtCorrectness(
//         totalCollateralAliceOpening,
//         totalDebtAliceOpening
//       );
//     });

//     it("should calculate and return correct CR for alice's position", async () => {
//       expect(await getCR({ owner: alice })).to.be.equal(AliceInitialCR);
//     });

//     it("should have a correct amount of collateral and debt in position record (alice position)", async () => {
//       const { debt, coll } = await getTrove(alice);

//       expect(debt).to.be.equal(AliceTroveDebt);
//       expect(coll).to.be.equal(AliceTroveColl);
//     });

//     it("should have transferred the correct amount BFE token during position opening (alice position)", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(alice.address);

//       expect(AliceBFEBalanceAtOpening).to.be.equal(
//         AliceTroveDebt - AliceTroveOpeningFee - gasCompensationReserve
//       );

//       expect(balance).to.be.equal(AliceBFEBalanceAtOpening);
//     });

//     it("should let alice stake into stability pool", async () => {
//       await expect(provide({ caller: alice, amount: AliceBFEBalanceAtOpening }))
//         .not.to.be.reverted;
//     });

//     it("should have correct total supply before bob opens position", async () => {
//       const totalSupply = await baseFeeLMAToken.totalSupply();

//       expect(totalSupply).to.be.equal("2000000");
//     });

//     it("should let another user(bob) open a position", async () => {
//       await increase(15);

//       await openTrove({
//         caller: bob,
//         baseFeeLMAAmount: BobTroveDebt,
//         collAmount: BobTroveColl,
//       });
//     });

//     it("should have a correct CR in a new position (bob position)", async () => {
//       expect(await getCR({ owner: bob })).to.be.equal(BobInitialCR);
//     });

//     it("should have a correct entire system debt (after bob opens position)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollateralBobOpening,
//         totalDebtBobOpening
//       );
//     });

//     it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
//       const { debt, coll } = await getTrove(bob);

//       expect(debt).to.be.equal(BobTroveDebt);
//       expect(coll).to.be.equal(BobTroveColl);
//     });

//     it("should have transferred the correct amount BFE token during position opening (bob position)", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(bob.address);

//       compareWithFault(
//         BobIdealBFEBalanceAtOpening,
//         BobTroveDebt - BobTroveOpeningFee - gasCompensationReserve
//       );

//       compareWithFault(balance, BobIdealBFEBalanceAtOpening);
//     });

//     it("should have a correct CR in a new position (bob position)", async () => {
//       expect(await getCR()).to.be.equal(BobInitialCR);
//     });

//     it("should let stake BFE to staking", async () => {
//       // Provide 100%
//       await provide({ amount: BobActualBFEBalanceAtOpening });
//     });

//     it("shouldn't have the system in the recovery mode", async () => {
//       expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
//         false
//       );
//     });

//     it("should record correct staked amount", async () => {
//       const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
//         bob.address
//       );

//       expect(deposit).to.be.equal(BobActualBFEBalanceAtOpening);
//     });

//     it("should result into a correct staked amount", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(
//         await stabilityPool.getAddress()
//       );

//       expect(balance).to.be.equal("2385000");
//     });

//     it("should have correct total supply before alice increase", async () => {
//       const totalSupply = await baseFeeLMAToken.totalSupply();

//       expect(totalSupply).to.be.equal("3000000");
//     });

//     it("should let adjust the position (alice position)", async () => {
//       await increase(2000);
//       await expect(
//         increaseDebt({ caller: alice, amount: AliceTroveIncreaseDebt })
//       ).not.to.be.reverted;
//     });

//     it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollAliceIncrease,
//         totalDebtAliceIncrease
//       );
//     });

//     it("should result into a correct debt and collateral in a position after decrease", async () => {
//       const { debt, coll } = await getTrove(alice);

//       expect(debt).to.be.equal(AliceDebtAfterFirstIncrease);
//       expect(coll).to.be.equal(AliceCollAfterFirstIncrease);
//     });

//     it("should result into a correct CR in a alice position", async () => {
//       const cr = await getCR({ owner: alice });
//       expect(cr).to.be.equal(AliceCRAfterFirstIncrease);
//     });

//     it("should have correct total supply before carol mint", async () => {
//       const totalSupply = await baseFeeLMAToken.totalSupply();

//       expect(totalSupply).to.be.equal("4800000");
//     });

//     it("should let open another position in the system (carol position)", async () => {
//       await increase(17970);

//       await openTrove({
//         caller: carol,
//         collAmount: CarolTroveColl,
//         baseFeeLMAAmount: CarolTroveDebt,
//       });
//     });

//     it("should result into a correct CR in a position(carol position)", async () => {
//       expect(await getCR({ owner: carol })).to.be.equal(CarolInitialCR);
//     });

//     it("should have a correct entire system debt (after alice decreases coll in her position)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollCarolOpening,
//         totalDebtCarolOpening
//       );
//     });

//     it("should have a correct amount of collateral and debt in position record (carol position)", async () => {
//       const { debt, coll } = await getTrove(carol);

//       expect(debt).to.be.equal(CarolTroveDebt);
//       expect(coll).to.be.equal(CarolTroveColl);
//     });

//     it("should have transferred the correct amount BFE token during position opening (carol position)", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(carol.address);
//       compareWithFault(
//         CarolBFEBalanceAtOpening,
//         CarolTroveDebt - CarolTroveOpeningFee - gasCompensationReserve
//       );
//       compareWithFault(balance, CarolBFEBalanceAtOpening);
//     });

//     it("should let another user provide to stability pool (carol)", async () => {
//       await provide({ caller: carol, amount: CarolBFEBalanceAtOpening });
//       const deposit = await stabilityPool.getCompoundedBaseFeeLMADeposit(
//         carol.address
//       );

//       expect(deposit).to.be.equal(CarolBFEBalanceAtOpening);
//     });

//     it("should result into a correct balance of stability pool", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(
//         await stabilityPool.getAddress()
//       );
//       expect(balance).to.be.equal("3240238");
//     });

//     it("should let withdraw provided funds", async () => {
//       await stabilityPool.connect(bob).withdrawFromSP(BobUnstakeFirst);
//     });

//     it("Withdrawn funds should result in a correct balance", async () => {
//       expect(await baseFeeLMAToken.balanceOf(bob.address)).to.be.equal(
//         BobUnstakeFirst
//       );
//     });

//     it("should let redeem collateral, retrieve correct amount of bfe from account and transfer back correct amount of collateral", async () => {
//       const balanceCollBefore = await payToken.balanceOf(bob.address);
//       const hint = await hintHelpers.getRedemptionHints(
//         BobRedemptionFirst,
//         gasPrice010,
//         0
//       );
//       await expect(
//         troveManager
//           .connect(bob)
//           .redeemCollateral(
//             BobRedemptionFirst,
//             hint[0],
//             ethers.ZeroAddress,
//             ethers.ZeroAddress,
//             hint[1],
//             0,
//             ethers.parseEther("1")
//           )
//       ).not.to.be.reverted;
//       const balanceCollAfter = await payToken.balanceOf(bob.address);

//       compareWithFault(
//         balanceCollAfter - balanceCollBefore,
//         BobCollBalanceAfterRedemption
//       );
//       expect(balanceCollAfter - balanceCollBefore).to.be.equal(
//         BobCollBalanceAfterRedemption
//       );
//     });

//     it("should have a correct entire system debt (after bob redeems coll)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollBobFirstRedemption,
//         totalDebtBobFirstRedemption
//       );
//     });

//     it("should result into correct debt and coll in a redeemed position", async () => {
//       const { debt, coll } = await getTrove(alice);

//       expect(debt).to.be.equal(AliceTroveDebtAfterBobRedemption);
//       expect(coll).to.be.equal(AliceTroveCollAfterBobRedemption);
//     });

//     it("should result into a correct CR in alices position", async () => {
//       expect(await getCR({ owner: alice })).to.be.equal(
//         AliceCRAfterBobRedemption
//       );
//     });

//     it("should let increase collateral to the position (bob position)", async () => {
//       await setNewBaseFeePrice(33);
//       await setNewBaseFeePrice(36);
//       await setNewBaseFeePrice(40);
//       await setNewBaseFeePrice(44);
//       await setNewBaseFeePrice(48);
//       await setNewBaseFeePrice(52);
//       await setNewBaseFeePrice(56);
//       await setNewBaseFeePrice(60);
//       await increaseColl({ amount: BobTroveIncreaseCollFirst });
//     });

//     it("should have a correct entire system debt (after bob increases coll)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollBobIncrease,
//         totalDebtBobIncrease
//       );
//     });

//     it("should have a correct amount of collateral and debt in position record (bob position)", async () => {
//       const { debt, coll } = await getTrove(bob);

//       expect(debt).to.be.equal(BobTroveDebtAfterIncrease);
//       expect(coll).to.be.equal(BobTroveCollAfterIncrease);
//     });

//     it("should have a correct CR after coll increase in position (bob position)", async () => {
//       expect(await getCR()).to.be.equal(BobCRAfterIncrease);
//     });

//     it("should have a correct entire system debt (just before bob liquidates alice)", async () => {
//       await checkCollDebtCorrectness(
//         totalCollJustBeforeAliceLiquidated,
//         totalDebtJustBeforeAliceLiquidated
//       );
//     });

//     it("should let liquidate troves with CR below minimal", async () => {
//       expect(await getCR({ owner: alice })).to.be.equal(AliceCRAtLiquidation);
//       expect(await troveManager.MCR()).to.be.greaterThan(AliceCRAtLiquidation);

//       const balanceETHBefore = await payToken.balanceOf(carol.address);

//       await expect(
//         troveManager.connect(carol).batchLiquidateTroves([alice.address])
//       ).not.be.reverted;

//       const balanceAfter = await payToken.balanceOf(carol.address);

//       expect(balanceAfter - balanceETHBefore).to.be.equal("1438250000000000");
//     });

//     it("should have a correct entire system debt (bob liquidates alice)", async () => {
//       const coll = await troveManager.getEntireSystemColl();
//       const debt = await troveManager.getEntireSystemDebt();

//       expect(coll).to.be.equal(totalCollAliceLiquidated);
//       expect(debt).to.be.equal(totalDebtAliceLiquidated);
//     });

//     it("should result into empty stability pool", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(
//         await stabilityPool.getAddress()
//       );

//       expect(balance).to.be.equal(0);
//     });

//     it("should be no position after liquidation", async () => {
//       const { debt, coll } = await getTrove(alice);

//       expect(debt).to.be.equal(0);
//       expect(coll).to.be.equal(0);
//     });

//     it("should leave bfe tokens on liquidated user's address", async () => {
//       const balance = await baseFeeLMAToken.balanceOf(alice.address);

//       expect(balance).to.be.equal("39751");
//     });

//     it("should calculate debt and collateral of other users after liquidation (bob position)", async () => {
//       const { debt, coll } = await getTrove(bob);

//       expect(debt).to.be.equal(BobTroveDebtAfterLiquid);
//       expect(coll).to.be.equal(BobTroveCollAfterLiquid);
//     });

//     it("should calculate cr of other positions correclty after liquidation (bob position)", async () => {
//       expect(await getCR({ owner: bob })).to.be.equal(BobCRAfterLiquid);
//     });

//     it("should have correct trove params in carol trove as well (CR)", async () => {
//       expect(await getCR({ owner: carol })).to.be.equal(CarolCRAfterLiquid);
//     });

//     it("should have correct trove params in carol trove as well (coll) ", async () => {
//       const { coll } = await getTrove(carol);
//       expect(coll).to.be.equal(CarolTroveCollAfterLiquid);
//     });

//     it("should have correct trove params in carol trove as well (debt) ", async () => {
//       const { debt } = await getTrove(carol);
//       expect(debt).to.be.equal(CarolTroveDebtAfterLiquid);
//     });

//     it("should let redeem tokens if there is no position opened in the system", async () => {
//       await increase(90);

//       const balanceBefore = await payToken.balanceOf(alice.address);
//       const hint = await hintHelpers.getRedemptionHints(
//         AliceRedemptionFirst,
//         gasPrice1114,
//         0
//       );

//       await expect(
//         troveManager
//           .connect(alice)
//           .redeemCollateral(
//             AliceRedemptionFirst,
//             hint[0],
//             ethers.ZeroAddress,
//             ethers.ZeroAddress,
//             hint[1],
//             0,
//             ethers.parseEther("1")
//           )
//       ).not.to.be.reverted;

//       const balanceAfter = await payToken.balanceOf(alice.address);

//       expect(balanceAfter - balanceBefore).to.be.equal(
//         AliceReceivedWStEthForRedemption
//       );
//     });

//     it("should result into correct debt and collateral in a redeemed position", async () => {
//       const { debt, coll } = await getTrove(bob);

//       expect(debt).to.be.equal(BobTroveDebtAfterSecondIncrease);
//       expect(coll).to.be.equal(BobTroveCollAfterSecondIncrease);
//     });

//     it("should have a correct entire system debt (alice redeems bob)", async () => {
//       const coll = await troveManager.getEntireSystemColl();
//       const debt = await troveManager.getEntireSystemDebt();

//       expect(coll).to.be.equal(totalCollAliceRedeemsBob);
//       expect(debt).to.be.equal(totalDebtAliceRedeemsBob);
//     });

//     it("should allow increasing debt in the position (bob position)", async () => {
//       await increase(14250);
//       await expect(
//         increaseDebt({ caller: bob, amount: BobTroveIncreaseDebtSecond })
//       ).not.to.be.reverted;
//     });

//     it("should calculate bobs CR correctly after the second increase", async () => {
//       expect(BobCRAfterSecondIncrease).to.be.equal(await getCR({ owner: bob }));
//     });

//     it("should calculate debt and collateral after position debt increase (bob position)", async () => {
//       const { debt, coll } = await getTrove(carol);

//       expect(debt).to.be.equal(BobTroveDebtAfterRedemption);
//       expect(coll).to.be.equal(BobTroveCollAfterRedemption);
//     });

//     it("should correctly set system into a recovery mode", async () => {
//       await setNewBaseFeePrice(65);
//       await setNewBaseFeePrice(70);
//       await setNewBaseFeePrice(80);
//       expect(await troveManager.checkUnreliableRecoveryMode()).to.be.equal(
//         true
//       );
//     });

//     it("should let borrow more tokens during the recovery mode and transfer tokens correctly", async () => {
//       await increase(3990);
//       const carolBFEBalanceBefore = await baseFeeLMAToken.balanceOf(
//         carol.address
//       );
//       const carolCollBalanceBefore = await payToken.balanceOf(carol.address);
//       await payToken
//         .connect(carol)
//         .approve(await borrowerOperations.getAddress(), CarolIncreaseColl);
//       await expect(
//         borrowerOperations
//           .connect(carol)
//           .adjustTrove(
//             ethers.parseEther("1"),
//             0,
//             CarolIncreaseColl,
//             CarolIncreaseDebt,
//             true,
//             ethers.ZeroAddress,
//             ethers.ZeroAddress
//           )
//       ).not.to.be.reverted;

//       expect(
//         carolBFEBalanceBefore + CarolIncreaseDebt - BigInt("28096")
//       ).to.be.equal(await baseFeeLMAToken.balanceOf(carol.address));
//       expect(CarolIncreaseColl).to.be.equal(
//         carolCollBalanceBefore - (await payToken.balanceOf(carol.address))
//       );
//     });

//     it("should let withdraw stability pool gain to trove", async () => {
//       await openTrove({
//         caller: alice,
//         baseFeeLMAAmount: 150000,
//         collAmount: ethers.parseEther("1"),
//       });
//       await stabilityPool
//         .connect(alice)
//         .withdrawWStETHGainToTrove(ethers.ZeroAddress, ethers.ZeroAddress);
//     });

//     it("should correctly calculate liquidation price in normal mode", async () => {
//       const { debt, coll } = await getTrove(carol);

//       const price = await troveManager.getNormalLiquidationPrice(coll, debt);
//       const MCR = await borrowerOperations.MCR();

//       expect(
//         await troveManager.getCurrentICR(carol.address, price - BigInt(1))
//       ).to.be.greaterThan(MCR);
//       expect(
//         await troveManager.getCurrentICR(carol.address, price)
//       ).to.be.lessThanOrEqual(MCR);
//     });

//     it("should correctly calculate liquidation price", async () => {
//       const { debt, coll } = await getTrove(carol);

//       const price = await troveManager.getNormalLiquidationPrice(coll, debt);
//       const MCR = await borrowerOperations.MCR();

//       expect(
//         await troveManager.getCurrentICR(carol.address, price - BigInt(1))
//       ).to.be.greaterThan(MCR);
//       expect(
//         await troveManager.getCurrentICR(carol.address, price)
//       ).to.be.lessThanOrEqual(MCR);
//     });

//     it("should let close trove if just enough debt tokens are in the account", async () => {
//       await increase(1900000);
//       const { debt } = await getTrove(alice);
//       await increaseColl({
//         caller: carol,
//         amount: await payToken.balanceOf(carol),
//       });
//       await increaseDebt({ caller: carol, amount: debt });
//       await baseFeeLMAToken
//         .connect(carol)
//         .transfer(
//           alice.address,
//           debt - (await baseFeeLMAToken.balanceOf(alice.address)) - BigInt(1)
//         );
//       await expect(
//         borrowerOperations.connect(alice).closeTrove()
//       ).to.be.revertedWith(
//         "BorrowerOps: Caller doesnt have enough BaseFeeLMA to make repayment"
//       );

//       await baseFeeLMAToken.connect(carol).transfer(alice.address, BigInt(1));
//       expect(await baseFeeLMAToken.balanceOf(alice.address)).to.be.equal(debt);
//       await expect(borrowerOperations.connect(alice).closeTrove()).not.to.be
//         .reverted;
//     });

//     it("should not let random accounts to call ActivePool.sendWStETH", async () => {
//       await expect(
//         activePool.connect(hacker).sendWStETH(hacker.address, 1)
//       ).to.be.revertedWith(
//         "ActivePool: Caller is neither BO nor TM nor FRouter"
//       );
//     });
//   });
// });
