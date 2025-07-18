const deploymentHelper = require("../../utils/deploymentHelpers.js");
const testHelpers = require("../../utils/testHelpers.js");

const th = testHelpers.TestHelper;
const timeValues = testHelpers.TimeValues;
const { dec, toBN, assertRevert } = th;

contract("After the initial lockup period has passed", async (accounts) => {
  const [
    liquityAG,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000);

  const SECONDS_IN_ONE_DAY = timeValues.SECONDS_IN_ONE_DAY;
  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_ONE_YEAR = timeValues.SECONDS_IN_ONE_YEAR;
  const maxBytes32 = th.maxBytes32;

  let HOGContracts;
  let coreContracts;

  // LCs for team members on vesting schedules
  let LC_T1;
  let LC_T2;
  let LC_T3;

  // LCs for investors
  let LC_I1;
  let LC_I2;
  let LC_I3;

  // 1e24 = 1 million tokens with 18 decimal digits
  const teamMemberInitialEntitlement_1 = dec(1, 24);
  const teamMemberInitialEntitlement_2 = dec(2, 24);
  const teamMemberInitialEntitlement_3 = dec(3, 24);

  const investorInitialEntitlement_1 = dec(4, 24);
  const investorInitialEntitlement_2 = dec(5, 24);
  const investorInitialEntitlement_3 = dec(6, 24);

  const teamMemberMonthlyVesting_1 = dec(1, 23);
  const teamMemberMonthlyVesting_2 = dec(2, 23);
  const teamMemberMonthlyVesting_3 = dec(3, 23);

  const HOGEntitlement_A = dec(1, 24);
  const HOGEntitlement_B = dec(2, 24);
  const HOGEntitlement_C = dec(3, 24);
  const HOGEntitlement_D = dec(4, 24);
  const HOGEntitlement_E = dec(5, 24);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;
  let justOverOneYearFromSystemDeployment;
  let _18monthsFromSystemDeployment;

  beforeEach(async () => {
    // Deploy all contracts from the first account
    HOGContracts = await deploymentHelper.deployHOGTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );
    coreContracts = await deploymentHelper.deployLiquityCore();

    hogStaking = HOGContracts.hogStaking;
    hogToken = HOGContracts.hogToken;
    communityIssuance = HOGContracts.communityIssuance;
    lockupContractFactory = HOGContracts.lockupContractFactory;

    await deploymentHelper.connectHOGContracts(HOGContracts);
    await deploymentHelper.connectCoreContracts(coreContracts, HOGContracts);
    await deploymentHelper.connectHOGContractsToCore(
      HOGContracts,
      coreContracts
    );

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(
      hogToken,
      web3,
      timeValues.SECONDS_IN_ONE_YEAR
    );
    justOverOneYearFromSystemDeployment = oneYearFromSystemDeployment.add(
      toBN("1")
    );

    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(
      toBN("2")
    );
    const secondsIn18Months = toBN(timeValues.SECONDS_IN_ONE_MONTH).mul(
      toBN("18")
    );
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      hogToken,
      web3,
      secondsInTwoYears
    );
    _18monthsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      hogToken,
      web3,
      secondsIn18Months
    );

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(
      teamMember_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(
      teamMember_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(
      teamMember_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    const deployedLCtx_I1 = await lockupContractFactory.deployLockupContract(
      investor_1,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I2 = await lockupContractFactory.deployLockupContract(
      investor_2,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );
    const deployedLCtx_I3 = await lockupContractFactory.deployLockupContract(
      investor_3,
      oneYearFromSystemDeployment,
      { from: liquityAG }
    );

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1);
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2);
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3);

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1);
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2);
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3);

    // Multisig transfers initial HOG entitlements to LCs
    await hogToken.transfer(LC_T1.address, teamMemberInitialEntitlement_1, {
      from: multisig,
    });
    await hogToken.transfer(LC_T2.address, teamMemberInitialEntitlement_2, {
      from: multisig,
    });
    await hogToken.transfer(LC_T3.address, teamMemberInitialEntitlement_3, {
      from: multisig,
    });

    await hogToken.transfer(LC_I1.address, investorInitialEntitlement_1, {
      from: multisig,
    });
    await hogToken.transfer(LC_I2.address, investorInitialEntitlement_2, {
      from: multisig,
    });
    await hogToken.transfer(LC_I3.address, investorInitialEntitlement_3, {
      from: multisig,
    });

    const systemDeploymentTime = await hogToken.getDeploymentStartTime();

    // Every thirty days, mutlsig transfers vesting amounts to team members
    for (i = 0; i < 12; i++) {
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      await hogToken.transfer(LC_T1.address, teamMemberMonthlyVesting_1, {
        from: multisig,
      });
      await hogToken.transfer(LC_T2.address, teamMemberMonthlyVesting_2, {
        from: multisig,
      });
      await hogToken.transfer(LC_T3.address, teamMemberMonthlyVesting_3, {
        from: multisig,
      });
    }

    // After Since only 360 days have passed, fast forward 5 more days, until LCs unlock
    await th.fastForwardTime(SECONDS_IN_ONE_DAY * 5, web3.currentProvider);

    const endTime = toBN(await th.getLatestBlockTimestamp(web3));

    const timePassed = endTime.sub(systemDeploymentTime);
    // Confirm that just over one year has passed -  not more than 1000 seconds
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).lt(toBN("1000")));
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).gt(toBN("0")));
  });

  describe("Deploying new LCs", async (accounts) => {
    it("HOG Deployer can deploy new LCs", async () => {
      // HOG deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        { from: liquityAG }
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Anyone can deploy new LCs", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        C,
        oneYearFromSystemDeployment,
        { from: investor_2 }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        liquityAG,
        "9595995999999900000023423234",
        { from: A }
      );

      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);
    });

    it("Anyone can deploy new LCs with unlockTime in the past", async () => {
      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        justOverOneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: E }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        C,
        _18monthsFromSystemDeployment,
        { from: multisig }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);
      const LC_3 = await th.getLCFromDeploymentTx(LCDeploymentTx_3);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);

      // Check LCs have unlockTimes in the past
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();
      unlockTime_3 = await LC_3.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.lt(currentTime));
      assert.isTrue(unlockTime_2.lt(currentTime));
      assert.isTrue(unlockTime_3.lt(currentTime));
    });

    it("Anyone can deploy new LCs with unlockTime in the future", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        twoYearsFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: E }
      );

      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1);
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2);

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);

      // Check LCs have unlockTimes in the future
      unlockTime_1 = await LC_1.unlockTime();
      unlockTime_2 = await LC_2.unlockTime();

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      assert.isTrue(unlockTime_1.gt(currentTime));
      assert.isTrue(unlockTime_2.gt(currentTime));
    });
  });

  describe("Beneficiary withdrawal from initial LC", async (accounts) => {
    it("A beneficiary can withdraw their full entitlement from their LC", async () => {
      // Check HOG balances of investors' LCs are equal to their initial entitlements
      assert.equal(
        await hogToken.balanceOf(LC_I1.address),
        investorInitialEntitlement_1
      );
      assert.equal(
        await hogToken.balanceOf(LC_I2.address),
        investorInitialEntitlement_2
      );
      assert.equal(
        await hogToken.balanceOf(LC_I3.address),
        investorInitialEntitlement_3
      );

      // Check HOG balances of investors are 0
      assert.equal(await hogToken.balanceOf(investor_1), "0");
      assert.equal(await hogToken.balanceOf(investor_2), "0");
      assert.equal(await hogToken.balanceOf(investor_3), "0");

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawHOG({ from: investor_1 });
      await LC_I2.withdrawHOG({ from: investor_2 });
      await LC_I3.withdrawHOG({ from: investor_3 });

      // Check HOG balances of investors now equal their entitlements
      assert.equal(
        await hogToken.balanceOf(investor_1),
        investorInitialEntitlement_1
      );
      assert.equal(
        await hogToken.balanceOf(investor_2),
        investorInitialEntitlement_2
      );
      assert.equal(
        await hogToken.balanceOf(investor_3),
        investorInitialEntitlement_3
      );

      // Check HOG balances of investors' LCs are now 0
      assert.equal(await hogToken.balanceOf(LC_I1.address), "0");
      assert.equal(await hogToken.balanceOf(LC_I2.address), "0");
      assert.equal(await hogToken.balanceOf(LC_I3.address), "0");
    });

    it("A beneficiary on a vesting schedule can withdraw their total vested amount from their LC", async () => {
      // Get HOG balances of LCs for beneficiaries (team members) on vesting schedules
      const HOGBalanceOfLC_T1_Before = await hogToken.balanceOf(LC_T1.address);
      const HOGBalanceOfLC_T2_Before = await hogToken.balanceOf(LC_T2.address);
      const HOGBalanceOfLC_T3_Before = await hogToken.balanceOf(LC_T3.address);

      // Check HOG balances of vesting beneficiaries' LCs are greater than their initial entitlements
      assert.isTrue(
        HOGBalanceOfLC_T1_Before.gt(th.toBN(teamMemberInitialEntitlement_1))
      );
      assert.isTrue(
        HOGBalanceOfLC_T2_Before.gt(th.toBN(teamMemberInitialEntitlement_2))
      );
      assert.isTrue(
        HOGBalanceOfLC_T3_Before.gt(th.toBN(teamMemberInitialEntitlement_3))
      );

      // Check HOG balances of beneficiaries are 0
      assert.equal(await hogToken.balanceOf(teamMember_1), "0");
      assert.equal(await hogToken.balanceOf(teamMember_2), "0");
      assert.equal(await hogToken.balanceOf(teamMember_3), "0");

      // All beneficiaries withdraw from their respective LCs
      await LC_T1.withdrawHOG({ from: teamMember_1 });
      await LC_T2.withdrawHOG({ from: teamMember_2 });
      await LC_T3.withdrawHOG({ from: teamMember_3 });

      // Check beneficiaries' HOG balances now equal their accumulated vested entitlements
      assert.isTrue(
        (await hogToken.balanceOf(teamMember_1)).eq(HOGBalanceOfLC_T1_Before)
      );
      assert.isTrue(
        (await hogToken.balanceOf(teamMember_2)).eq(HOGBalanceOfLC_T2_Before)
      );
      assert.isTrue(
        (await hogToken.balanceOf(teamMember_3)).eq(HOGBalanceOfLC_T3_Before)
      );

      // Check HOG balances of beneficiaries' LCs are now 0
      assert.equal(await hogToken.balanceOf(LC_T1.address), "0");
      assert.equal(await hogToken.balanceOf(LC_T2.address), "0");
      assert.equal(await hogToken.balanceOf(LC_T3.address), "0");
    });

    it("Beneficiaries can withraw full HOG balance of LC if it has increased since lockup period ended", async () => {
      // Check HOG balances of investors' LCs are equal to their initial entitlements
      assert.equal(
        await hogToken.balanceOf(LC_I1.address),
        investorInitialEntitlement_1
      );
      assert.equal(
        await hogToken.balanceOf(LC_I2.address),
        investorInitialEntitlement_2
      );
      assert.equal(
        await hogToken.balanceOf(LC_I3.address),
        investorInitialEntitlement_3
      );

      // Check HOG balances of investors are 0
      assert.equal(await hogToken.balanceOf(investor_1), "0");
      assert.equal(await hogToken.balanceOf(investor_2), "0");
      assert.equal(await hogToken.balanceOf(investor_3), "0");

      // HOG multisig sends extra HOG to investor LCs
      await hogToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // 1 month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // HOG multisig again sends extra HOG to investor LCs
      await hogToken.transfer(LC_I1.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_I2.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_I3.address, dec(1, 24), { from: multisig });

      // Get HOG balances of LCs for investors
      const HOGBalanceOfLC_I1_Before = await hogToken.balanceOf(LC_I1.address);
      const HOGBalanceOfLC_I2_Before = await hogToken.balanceOf(LC_I2.address);
      const HOGBalanceOfLC_I3_Before = await hogToken.balanceOf(LC_I3.address);

      // Check HOG balances of investors' LCs are greater than their initial entitlements
      assert.isTrue(
        HOGBalanceOfLC_I1_Before.gt(th.toBN(investorInitialEntitlement_1))
      );
      assert.isTrue(
        HOGBalanceOfLC_I2_Before.gt(th.toBN(investorInitialEntitlement_2))
      );
      assert.isTrue(
        HOGBalanceOfLC_I3_Before.gt(th.toBN(investorInitialEntitlement_3))
      );

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawHOG({ from: investor_1 });
      await LC_I2.withdrawHOG({ from: investor_2 });
      await LC_I3.withdrawHOG({ from: investor_3 });

      // Check HOG balances of investors now equal their LC balances prior to withdrawal
      assert.isTrue(
        (await hogToken.balanceOf(investor_1)).eq(HOGBalanceOfLC_I1_Before)
      );
      assert.isTrue(
        (await hogToken.balanceOf(investor_2)).eq(HOGBalanceOfLC_I2_Before)
      );
      assert.isTrue(
        (await hogToken.balanceOf(investor_3)).eq(HOGBalanceOfLC_I3_Before)
      );

      // Check HOG balances of investors' LCs are now 0
      assert.equal(await hogToken.balanceOf(LC_I1.address), "0");
      assert.equal(await hogToken.balanceOf(LC_I2.address), "0");
      assert.equal(await hogToken.balanceOf(LC_I3.address), "0");
    });
  });

  describe("Withdrawal attempts from LCs by non-beneficiaries", async (accounts) => {
    it("HOG Multisig can't withdraw from a LC they deployed through the Factory", async () => {
      try {
        const withdrawalAttempt = await LC_T1.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("HOG Multisig can't withdraw from a LC that someone else deployed", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //HOG multisig fund the newly deployed LCs
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // HOG multisig attempts withdrawal from LC
      try {
        const withdrawalAttempt_B = await LC_B.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Non-beneficiaries cannot withdraw from a LC", async () => {
      const variousEOAs = [
        teamMember_1,
        teamMember_3,
        liquityAG,
        investor_1,
        investor_2,
        investor_3,
        A,
        B,
        C,
        D,
        E,
      ];

      // Several EOAs attempt to withdraw from the LC that has teamMember_2 as beneficiary
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_T2.withdrawHOG({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });

  describe("Transferring HOG", async (accounts) => {
    it("HOG multisig can transfer HOG to LCs they deployed", async () => {
      const initialHOGBalanceOfLC_T1 = await hogToken.balanceOf(LC_T1.address);
      const initialHOGBalanceOfLC_T2 = await hogToken.balanceOf(LC_T2.address);
      const initialHOGBalanceOfLC_T3 = await hogToken.balanceOf(LC_T3.address);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // HOG multisig transfers vesting amount
      await hogToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC HOG balances
      const HOGBalanceOfLC_T1_1 = await hogToken.balanceOf(LC_T1.address);
      const HOGBalanceOfLC_T2_1 = await hogToken.balanceOf(LC_T2.address);
      const HOGBalanceOfLC_T3_1 = await hogToken.balanceOf(LC_T3.address);

      // // Check team member LC balances have increased
      assert.isTrue(
        HOGBalanceOfLC_T1_1.eq(
          th.toBN(initialHOGBalanceOfLC_T1).add(th.toBN(dec(1, 24)))
        )
      );
      assert.isTrue(
        HOGBalanceOfLC_T2_1.eq(
          th.toBN(initialHOGBalanceOfLC_T2).add(th.toBN(dec(1, 24)))
        )
      );
      assert.isTrue(
        HOGBalanceOfLC_T3_1.eq(
          th.toBN(initialHOGBalanceOfLC_T3).add(th.toBN(dec(1, 24)))
        )
      );

      // Another month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // HOG multisig transfers vesting amount
      await hogToken.transfer(LC_T1.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_T2.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_T3.address, dec(1, 24), { from: multisig });

      // Get new LC HOG balances
      const HOGBalanceOfLC_T1_2 = await hogToken.balanceOf(LC_T1.address);
      const HOGBalanceOfLC_T2_2 = await hogToken.balanceOf(LC_T2.address);
      const HOGBalanceOfLC_T3_2 = await hogToken.balanceOf(LC_T3.address);

      // Check team member LC balances have increased again
      assert.isTrue(
        HOGBalanceOfLC_T1_2.eq(HOGBalanceOfLC_T1_1.add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        HOGBalanceOfLC_T2_2.eq(HOGBalanceOfLC_T2_1.add(th.toBN(dec(1, 24))))
      );
      assert.isTrue(
        HOGBalanceOfLC_T3_2.eq(HOGBalanceOfLC_T3_1.add(th.toBN(dec(1, 24))))
      );
    });

    it("HOG multisig can transfer tokens to LCs deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract ith themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: A }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: B }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: C }
      );

      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await hogToken.balanceOf(LC_A.address), "0");
      assert.equal(await hogToken.balanceOf(LC_B.address), "0");
      assert.equal(await hogToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // HOG multisig transfers HOG to LCs deployed by other accounts
      await hogToken.transfer(LC_A.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_B.address, dec(2, 24), { from: multisig });
      await hogToken.transfer(LC_C.address, dec(3, 24), { from: multisig });

      // Check balances of LCs have increased
      assert.equal(await hogToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await hogToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await hogToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("HOG multisig can transfer HOG directly to any externally owned account", async () => {
      // Check HOG balances of EOAs
      assert.equal(await hogToken.balanceOf(A), "0");
      assert.equal(await hogToken.balanceOf(B), "0");
      assert.equal(await hogToken.balanceOf(C), "0");

      // HOG multisig transfers HOG to EOAs
      const txA = await hogToken.transfer(A, dec(1, 24), { from: multisig });
      const txB = await hogToken.transfer(B, dec(2, 24), { from: multisig });
      const txC = await hogToken.transfer(C, dec(3, 24), { from: multisig });

      // Check new balances have increased by correct amount
      assert.equal(await hogToken.balanceOf(A), dec(1, 24));
      assert.equal(await hogToken.balanceOf(B), dec(2, 24));
      assert.equal(await hogToken.balanceOf(C), dec(3, 24));
    });

    it("Anyone can transfer HOG to LCs deployed by anyone", async () => {
      // Start D, E, F with some HOG
      await hogToken.transfer(D, dec(1, 24), { from: multisig });
      await hogToken.transfer(E, dec(2, 24), { from: multisig });
      await hogToken.transfer(F, dec(3, 24), { from: multisig });

      // H, I, J deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: H }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        justOverOneYearFromSystemDeployment,
        { from: I }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: J }
      );

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A);
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B);
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await hogToken.balanceOf(LCAddress_A), "0");
      assert.equal(await hogToken.balanceOf(LCAddress_B), "0");
      assert.equal(await hogToken.balanceOf(LCAddress_C), "0");

      // D, E, F transfer HOG to LCs
      await hogToken.transfer(LCAddress_A, dec(1, 24), { from: D });
      await hogToken.transfer(LCAddress_B, dec(2, 24), { from: E });
      await hogToken.transfer(LCAddress_C, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await hogToken.balanceOf(LCAddress_A), dec(1, 24));
      assert.equal(await hogToken.balanceOf(LCAddress_B), dec(2, 24));
      assert.equal(await hogToken.balanceOf(LCAddress_C), dec(3, 24));
    });

    it("Anyone can transfer to an EOA", async () => {
      // Start D, E, liquityAG with some HOG
      await hogToken.unprotectedMint(D, dec(1, 24));
      await hogToken.unprotectedMint(E, dec(2, 24));
      await hogToken.unprotectedMint(liquityAG, dec(3, 24));
      await hogToken.unprotectedMint(multisig, dec(4, 24));

      // HOG holders transfer to other EOAs
      const HOGtransferTx_1 = await hogToken.transfer(A, dec(1, 18), {
        from: D,
      });
      const HOGtransferTx_2 = await hogToken.transfer(liquityAG, dec(1, 18), {
        from: E,
      });
      const HOGtransferTx_3 = await hogToken.transfer(F, dec(1, 18), {
        from: liquityAG,
      });
      const HOGtransferTx_4 = await hogToken.transfer(G, dec(1, 18), {
        from: multisig,
      });

      assert.isTrue(HOGtransferTx_1.receipt.status);
      assert.isTrue(HOGtransferTx_2.receipt.status);
      assert.isTrue(HOGtransferTx_3.receipt.status);
      assert.isTrue(HOGtransferTx_4.receipt.status);
    });

    it("Anyone can approve any EOA to spend their HOG", async () => {
      // EOAs approve EOAs to spend HOG
      const HOGapproveTx_1 = await hogToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const HOGapproveTx_2 = await hogToken.approve(B, dec(1, 18), {
        from: G,
      });
      const HOGapproveTx_3 = await hogToken.approve(liquityAG, dec(1, 18), {
        from: F,
      });
      await assert.isTrue(HOGapproveTx_1.receipt.status);
      await assert.isTrue(HOGapproveTx_2.receipt.status);
      await assert.isTrue(HOGapproveTx_3.receipt.status);
    });

    it("Anyone can increaseAllowance for any EOA or Liquity contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend HOG
      const HOGIncreaseAllowanceTx_1 = await hogToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const HOGIncreaseAllowanceTx_2 = await hogToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      const HOGIncreaseAllowanceTx_3 = await hogToken.increaseAllowance(
        multisig,
        dec(1, 18),
        { from: F }
      );
      await assert.isTrue(HOGIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(HOGIncreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(HOGIncreaseAllowanceTx_3.receipt.status);

      // Increase allowance of Liquity contracts from F
      for (const contract of Object.keys(coreContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of Liquity contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of HOG contracts from F
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQT contracts from multisig
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can decreaseAllowance for any EOA or Liquity contract", async () => {
      //First, increase allowance of A, B LiqAG and core contracts
      const HOGapproveTx_1 = await hogToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const HOGapproveTx_2 = await hogToken.approve(B, dec(1, 18), {
        from: G,
      });
      const HOGapproveTx_3 = await hogToken.approve(multisig, dec(1, 18), {
        from: F,
      });
      await assert.isTrue(HOGapproveTx_1.receipt.status);
      await assert.isTrue(HOGapproveTx_2.receipt.status);
      await assert.isTrue(HOGapproveTx_3.receipt.status);

      // --- SETUP ---

      // IncreaseAllowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const HOGtransferTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGtransferTx.receipt.status);
      }

      // IncreaseAllowance of core contracts, from multisig
      for (const contract of Object.keys(coreContracts)) {
        const HOGtransferTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGtransferTx.receipt.status);
      }

      // Increase allowance of HOG contracts from F
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of LQTT contracts from multisig
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // --- TEST ---

      // Decrease allowance of A, B, multisig
      const HOGDecreaseAllowanceTx_1 = await hogToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const HOGDecreaseAllowanceTx_2 = await hogToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      const HOGDecreaseAllowanceTx_3 = await hogToken.decreaseAllowance(
        multisig,
        dec(1, 18),
        { from: F }
      );
      await assert.isTrue(HOGDecreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(HOGDecreaseAllowanceTx_2.receipt.status);
      await assert.isTrue(HOGDecreaseAllowanceTx_3.receipt.status);

      // Decrease allowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const HOGDecreaseAllowanceTx = await hogToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of core contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const HOGDecreaseAllowanceTx = await hogToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of HOG contracts from F
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.decreaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of HOG contracts from multisig
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.decreaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone can be the sender in a transferFrom() call", async () => {
      // Fund B, C
      await hogToken.unprotectedMint(B, dec(1, 18));
      await hogToken.unprotectedMint(C, dec(1, 18));

      // LiqAG, B, C approve F, G, multisig respectively
      await hogToken.approve(F, dec(1, 18), { from: multisig });
      await hogToken.approve(G, dec(1, 18), { from: B });
      await hogToken.approve(multisig, dec(1, 18), { from: C });

      // Approved addresses transfer from the address they're approved for
      const HOGtransferFromTx_1 = await hogToken.transferFrom(
        multisig,
        F,
        dec(1, 18),
        { from: F }
      );
      const HOGtransferFromTx_2 = await hogToken.transferFrom(
        B,
        multisig,
        dec(1, 18),
        { from: G }
      );
      const HOGtransferFromTx_3 = await hogToken.transferFrom(
        C,
        A,
        dec(1, 18),
        { from: multisig }
      );
      await assert.isTrue(HOGtransferFromTx_1.receipt.status);
      await assert.isTrue(HOGtransferFromTx_2.receipt.status);
      await assert.isTrue(HOGtransferFromTx_3.receipt.status);
    });

    it("Anyone can stake their HOG in the staking contract", async () => {
      // Fund F
      await hogToken.unprotectedMint(F, dec(1, 18));

      const HOGStakingTx_1 = await hogStaking.stake(dec(1, 18), { from: F });
      const HOGStakingTx_2 = await hogStaking.stake(dec(1, 18), {
        from: multisig,
      });
      await assert.isTrue(HOGStakingTx_1.receipt.status);
      await assert.isTrue(HOGStakingTx_2.receipt.status);
    });
  });

  describe("Withdrawal Attempts on new LCs before unlockTime has passed", async (accounts) => {
    it("HOG Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, before the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // HOG multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("HOG Deployer can't withdraw from a funded LC that someone else deployed, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //HOG multisig fund the newly deployed LCs
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      // HOG multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Beneficiary can't withdraw from their funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // HOG multisig funds contracts
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      try {
        const beneficiary = await LC_B.beneficiary();
        const withdrawalAttempt = await LC_B.withdrawHOG({
          from: beneficiary,
        });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: The lockup duration must have passed"
        );
      }
    });

    it("No one can withdraw from a beneficiary's funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // HOG multisig funds contracts
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.lt(unlockTime));

      const variousEOAs = [teamMember_2, multisig, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawHOG({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });

  describe("Withdrawals from new LCs after unlockTime has passed", async (accounts) => {
    it("HOG Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, after the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // HOG multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("HOG multisig can't withdraw from a funded LC when they are not the beneficiary, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      //HOG multisig fund the newly deployed LC
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      // HOG multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawHOG({ from: multisig });
        assert.isFalse(withdrawalAttempt_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "LockupContract: caller is not the beneficiary"
        );
      }
    });

    it("Beneficiary can withdraw from their funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // HOG multisig funds contract
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const beneficiary = await LC_B.beneficiary();
      assert.equal(beneficiary, B);

      // Get B's balance before
      const B_balanceBefore = await hogToken.balanceOf(B);
      assert.equal(B_balanceBefore, "0");

      const withdrawalAttempt = await LC_B.withdrawHOG({ from: B });
      assert.isTrue(withdrawalAttempt.receipt.status);

      // Get B's balance after
      const B_balanceAfter = await hogToken.balanceOf(B);
      assert.equal(B_balanceAfter, dec(2, 18));
    });

    it("Non-beneficiaries can't withdraw from a beneficiary's funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        _18monthsFromSystemDeployment,
        { from: D }
      );
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

      // HOG multisig funds contracts
      await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

      await th.fastForwardTime(
        timeValues.SECONDS_IN_ONE_YEAR,
        web3.currentProvider
      );

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
      const unlockTime = await LC_B.unlockTime();
      assert.isTrue(currentTime.gt(unlockTime));

      const variousEOAs = [teamMember_2, liquityAG, investor_1, A, C, D, E];

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawHOG({ from: account });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      }
    });
  });
});
