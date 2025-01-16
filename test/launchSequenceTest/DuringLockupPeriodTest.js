const LockupContract = artifacts.require("./LockupContract.sol");
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol");
const deploymentHelper = require("../../utils/deploymentHelpers.js");

const {
  TestHelper: th,
  TimeValues: timeValues,
} = require("../../utils/testHelpers.js");
const { dec, toBN, assertRevert, ZERO_ADDRESS } = th;

contract("During the initial lockup period", async (accounts) => {
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
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(-3)

  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH;
  const SECONDS_IN_364_DAYS = timeValues.SECONDS_IN_ONE_DAY * 364;

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

  const HOGEntitlement_A = dec(1, 24);
  const HOGEntitlement_B = dec(2, 24);
  const HOGEntitlement_C = dec(3, 24);
  const HOGEntitlement_D = dec(4, 24);
  const HOGEntitlement_E = dec(5, 24);

  let oneYearFromSystemDeployment;
  let twoYearsFromSystemDeployment;

  beforeEach(async () => {
    // Deploy all contracts from the first account
    coreContracts = await deploymentHelper.deployLiquityCore();
    HOGContracts = await deploymentHelper.deployHOGTesterContractsHardhat(
      bountyAddress,
      lpRewardsAddress,
      multisig
    );

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
    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(
      toBN("2")
    );
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(
      hogToken,
      web3,
      secondsInTwoYears
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

    // Deploy 3 LCs for investors
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

    // Fast forward time 364 days, so that still less than 1 year since launch has passed
    await th.fastForwardTime(SECONDS_IN_364_DAYS, web3.currentProvider);
  });

  describe("HOG transfer during first year after HOG deployment", async (accounts) => {
    // --- Liquity AG transfer restriction, 1st year ---
    it("Liquity multisig can not transfer HOG to a LC that was deployed directly", async () => {
      // Liquity multisig deploys LC_A
      const LC_A = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: multisig }
      );

      // Account F deploys LC_B
      const LC_B = await LockupContract.new(
        hogToken.address,
        B,
        oneYearFromSystemDeployment,
        { from: F }
      );

      // HOG deployer deploys LC_C
      const LC_C = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );

      // Liquity multisig attempts HOG transfer to LC_A
      try {
        const HOGtransferTx_A = await hogToken.transfer(
          LC_A.address,
          dec(1, 18),
          { from: multisig }
        );
        assert.isFalse(HOGtransferTx_A.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "HOGToken: recipient must be a LockupContract registered in the Factory"
        );
      }

      // Liquity multisig attempts HOG transfer to LC_B
      try {
        const HOGtransferTx_B = await hogToken.transfer(
          LC_B.address,
          dec(1, 18),
          { from: multisig }
        );
        assert.isFalse(HOGtransferTx_B.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "HOGToken: recipient must be a LockupContract registered in the Factory"
        );
      }

      try {
        const HOGtransferTx_C = await hogToken.transfer(
          LC_C.address,
          dec(1, 18),
          { from: multisig }
        );
        assert.isFalse(HOGtransferTx_C.receipt.status);
      } catch (error) {
        assert.include(
          error.message,
          "HOGToken: recipient must be a LockupContract registered in the Factory"
        );
      }
    });

    it("Liquity multisig can not transfer to an EOA or Liquity system contracts", async () => {
      // Multisig attempts HOG transfer to EOAs
      const HOGtransferTxPromise_1 = hogToken.transfer(A, dec(1, 18), {
        from: multisig,
      });
      const HOGtransferTxPromise_2 = hogToken.transfer(B, dec(1, 18), {
        from: multisig,
      });
      await assertRevert(HOGtransferTxPromise_1);
      await assertRevert(HOGtransferTxPromise_2);

      // Multisig attempts HOG transfer to core Liquity contracts
      for (const contract of Object.keys(coreContracts)) {
        const HOGtransferTxPromise = hogToken.transfer(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGtransferTxPromise,
          "HOGToken: recipient must be a LockupContract registered in the Factory"
        );
      }

      // Multisig attempts HOG transfer to HOG contracts (excluding LCs)
      for (const contract of Object.keys(HOGContracts)) {
        const HOGtransferTxPromise = hogToken.transfer(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGtransferTxPromise,
          "HOGToken: recipient must be a LockupContract registered in the Factory"
        );
      }
    });

    // --- Liquity AG approval restriction, 1st year ---
    it("Liquity multisig can not approve any EOA or Liquity system contract to spend their HOG", async () => {
      // Multisig attempts to approve EOAs to spend HOG
      const HOGApproveTxPromise_1 = hogToken.approve(A, dec(1, 18), {
        from: multisig,
      });
      const HOGApproveTxPromise_2 = hogToken.approve(B, dec(1, 18), {
        from: multisig,
      });
      await assertRevert(
        HOGApproveTxPromise_1,
        "HOGToken: caller must not be the multisig"
      );
      await assertRevert(
        HOGApproveTxPromise_2,
        "HOGToken: caller must not be the multisig"
      );

      // Multisig attempts to approve Liquity contracts to spend HOG
      for (const contract of Object.keys(coreContracts)) {
        const HOGApproveTxPromise = hogToken.approve(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGApproveTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }

      // Multisig attempts to approve HOG contracts to spend HOG (excluding LCs)
      for (const contract of Object.keys(HOGContracts)) {
        const HOGApproveTxPromise = hogToken.approve(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGApproveTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }
    });

    // --- Liquity AG increaseAllowance restriction, 1st year ---
    it("Liquity multisig can not increaseAllowance for any EOA or Liquity contract", async () => {
      // Multisig attempts to approve EOAs to spend HOG
      const HOGIncreaseAllowanceTxPromise_1 = hogToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const HOGIncreaseAllowanceTxPromise_2 = hogToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: multisig }
      );
      await assertRevert(
        HOGIncreaseAllowanceTxPromise_1,
        "HOGToken: caller must not be the multisig"
      );
      await assertRevert(
        HOGIncreaseAllowanceTxPromise_2,
        "HOGToken: caller must not be the multisig"
      );

      // Multisig attempts to approve Liquity contracts to spend HOG
      for (const contract of Object.keys(coreContracts)) {
        const HOGIncreaseAllowanceTxPromise = hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGIncreaseAllowanceTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }

      // Multisig attempts to approve HOG contracts to spend HOG (excluding LCs)
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTxPromise = hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGIncreaseAllowanceTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }
    });

    // --- Liquity AG decreaseAllowance restriction, 1st year ---
    it("Liquity multisig can not decreaseAllowance for any EOA or Liquity contract", async () => {
      // Multisig attempts to decreaseAllowance on EOAs
      const HOGDecreaseAllowanceTxPromise_1 = hogToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: multisig }
      );
      const HOGDecreaseAllowanceTxPromise_2 = hogToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: multisig }
      );
      await assertRevert(
        HOGDecreaseAllowanceTxPromise_1,
        "HOGToken: caller must not be the multisig"
      );
      await assertRevert(
        HOGDecreaseAllowanceTxPromise_2,
        "HOGToken: caller must not be the multisig"
      );

      // Multisig attempts to decrease allowance on Liquity contracts
      for (const contract of Object.keys(coreContracts)) {
        const HOGDecreaseAllowanceTxPromise = hogToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGDecreaseAllowanceTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }

      // Multisig attempts to decrease allowance on HOG contracts (excluding LCs)
      for (const contract of Object.keys(HOGContracts)) {
        const HOGDecreaseAllowanceTxPromise = hogToken.decreaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: multisig }
        );
        await assertRevert(
          HOGDecreaseAllowanceTxPromise,
          "HOGToken: caller must not be the multisig"
        );
      }
    });

    // --- Liquity multisig transferFrom restriction, 1st year ---
    it("Liquity multisig can not be the sender in a transferFrom() call", async () => {
      // EOAs attempt to use multisig as sender in a transferFrom()
      const HOGtransferFromTxPromise_1 = hogToken.transferFrom(
        multisig,
        A,
        dec(1, 18),
        { from: A }
      );
      const HOGtransferFromTxPromise_2 = hogToken.transferFrom(
        multisig,
        C,
        dec(1, 18),
        { from: B }
      );
      await assertRevert(
        HOGtransferFromTxPromise_1,
        "HOGToken: sender must not be the multisig"
      );
      await assertRevert(
        HOGtransferFromTxPromise_2,
        "HOGToken: sender must not be the multisig"
      );
    });

    //  --- staking, 1st year ---
    it("Liquity multisig can not stake their HOG in the staking contract", async () => {
      const HOGStakingTxPromise_1 = hogStaking.stake(dec(1, 18), {
        from: multisig,
      });
      await assertRevert(
        HOGStakingTxPromise_1,
        "HOGToken: sender must not be the multisig"
      );
    });

    // --- Anyone else ---

    it("Anyone (other than Liquity multisig) can transfer HOG to LCs deployed by anyone through the Factory", async () => {
      // Start D, E, F with some HOG
      await hogToken.unprotectedMint(D, dec(1, 24));
      await hogToken.unprotectedMint(E, dec(2, 24));
      await hogToken.unprotectedMint(F, dec(3, 24));

      // H, I, and Liquity AG deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: H }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        oneYearFromSystemDeployment,
        { from: I }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        oneYearFromSystemDeployment,
        { from: multisig }
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

    it("Anyone (other than Liquity multisig) can transfer HOG to LCs deployed by anyone directly", async () => {
      // Start D, E, F with some HOG
      await hogToken.unprotectedMint(D, dec(1, 24));
      await hogToken.unprotectedMint(E, dec(2, 24));
      await hogToken.unprotectedMint(F, dec(3, 24));

      // H, I, LiqAG deploy lockup contracts with A, B, C as beneficiaries, respectively
      const LC_A = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: H }
      );
      const LC_B = await LockupContract.new(
        hogToken.address,
        B,
        oneYearFromSystemDeployment,
        { from: I }
      );
      const LC_C = await LockupContract.new(
        hogToken.address,
        C,
        oneYearFromSystemDeployment,
        { from: multisig }
      );

      // Check balances of LCs are 0
      assert.equal(await hogToken.balanceOf(LC_A.address), "0");
      assert.equal(await hogToken.balanceOf(LC_B.address), "0");
      assert.equal(await hogToken.balanceOf(LC_C.address), "0");

      // D, E, F transfer HOG to LCs
      await hogToken.transfer(LC_A.address, dec(1, 24), { from: D });
      await hogToken.transfer(LC_B.address, dec(2, 24), { from: E });
      await hogToken.transfer(LC_C.address, dec(3, 24), { from: F });

      // Check balances of LCs has increased
      assert.equal(await hogToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await hogToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await hogToken.balanceOf(LC_C.address), dec(3, 24));
    });

    it("Anyone (other than liquity multisig) can transfer to an EOA", async () => {
      // Start D, E, F with some HOG
      await hogToken.unprotectedMint(D, dec(1, 24));
      await hogToken.unprotectedMint(E, dec(2, 24));
      await hogToken.unprotectedMint(F, dec(3, 24));

      // HOG holders transfer to other transfer to EOAs
      const HOGtransferTx_1 = await hogToken.transfer(A, dec(1, 18), {
        from: D,
      });
      const HOGtransferTx_2 = await hogToken.transfer(B, dec(1, 18), {
        from: E,
      });
      const HOGtransferTx_3 = await hogToken.transfer(multisig, dec(1, 18), {
        from: F,
      });

      assert.isTrue(HOGtransferTx_1.receipt.status);
      assert.isTrue(HOGtransferTx_2.receipt.status);
      assert.isTrue(HOGtransferTx_3.receipt.status);
    });

    it("Anyone (other than liquity multisig) can approve any EOA or to spend their HOG", async () => {
      // EOAs approve EOAs to spend HOG
      const HOGapproveTx_1 = await hogToken.approve(A, dec(1, 18), {
        from: F,
      });
      const HOGapproveTx_2 = await hogToken.approve(B, dec(1, 18), {
        from: G,
      });
      await assert.isTrue(HOGapproveTx_1.receipt.status);
      await assert.isTrue(HOGapproveTx_2.receipt.status);
    });

    it("Anyone (other than liquity multisig) can increaseAllowance for any EOA or Liquity contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend HOG
      const HOGIncreaseAllowanceTx_1 = await hogToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: F }
      );
      const HOGIncreaseAllowanceTx_2 = await hogToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      await assert.isTrue(HOGIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(HOGIncreaseAllowanceTx_2.receipt.status);

      // Increase allowance of core Liquity contracts
      for (const contract of Object.keys(coreContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }

      // Increase allowance of HOG contracts
      for (const contract of Object.keys(HOGContracts)) {
        const HOGIncreaseAllowanceTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGIncreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone (other than liquity multisig) can decreaseAllowance for any EOA or Liquity contract", async () => {
      //First, increase allowance of A, B and coreContracts and HOG contracts
      const HOGIncreaseAllowanceTx_1 = await hogToken.increaseAllowance(
        A,
        dec(1, 18),
        { from: F }
      );
      const HOGIncreaseAllowanceTx_2 = await hogToken.increaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      await assert.isTrue(HOGIncreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(HOGIncreaseAllowanceTx_2.receipt.status);

      for (const contract of Object.keys(coreContracts)) {
        const HOGtransferTx = await hogToken.increaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGtransferTx.receipt.status);
      }

      for (const contract of Object.keys(HOGContracts)) {
        const HOGtransferTx = await hogToken.increaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGtransferTx.receipt.status);
      }

      // Decrease allowance of A, B
      const HOGDecreaseAllowanceTx_1 = await hogToken.decreaseAllowance(
        A,
        dec(1, 18),
        { from: F }
      );
      const HOGDecreaseAllowanceTx_2 = await hogToken.decreaseAllowance(
        B,
        dec(1, 18),
        { from: G }
      );
      await assert.isTrue(HOGDecreaseAllowanceTx_1.receipt.status);
      await assert.isTrue(HOGDecreaseAllowanceTx_2.receipt.status);

      // Decrease allowance of core contracts
      for (const contract of Object.keys(coreContracts)) {
        const HOGDecreaseAllowanceTx = await hogToken.decreaseAllowance(
          coreContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGDecreaseAllowanceTx.receipt.status);
      }

      // Decrease allowance of HOG contracts
      for (const contract of Object.keys(HOGContracts)) {
        const HOGDecreaseAllowanceTx = await hogToken.decreaseAllowance(
          HOGContracts[contract].address,
          dec(1, 18),
          { from: F }
        );
        await assert.isTrue(HOGDecreaseAllowanceTx.receipt.status);
      }
    });

    it("Anyone (other than liquity multisig) can be the sender in a transferFrom() call", async () => {
      // Fund A, B
      await hogToken.unprotectedMint(A, dec(1, 18));
      await hogToken.unprotectedMint(B, dec(1, 18));

      // A, B approve F, G
      await hogToken.approve(F, dec(1, 18), { from: A });
      await hogToken.approve(G, dec(1, 18), { from: B });

      const HOGtransferFromTx_1 = await hogToken.transferFrom(
        A,
        F,
        dec(1, 18),
        { from: F }
      );
      const HOGtransferFromTx_2 = await hogToken.transferFrom(
        B,
        C,
        dec(1, 18),
        { from: G }
      );
      await assert.isTrue(HOGtransferFromTx_1.receipt.status);
      await assert.isTrue(HOGtransferFromTx_2.receipt.status);
    });

    it("Anyone (other than liquity AG) can stake their HOG in the staking contract", async () => {
      // Fund F
      await hogToken.unprotectedMint(F, dec(1, 18));

      const HOGStakingTx_1 = await hogStaking.stake(dec(1, 18), { from: F });
      await assert.isTrue(HOGStakingTx_1.receipt.status);
    });
  });
  // --- LCF ---

  describe("Lockup Contract Factory negative tests", async (accounts) => {
    it("deployLockupContract(): reverts when HOG token address is not set", async () => {
      // Fund F
      await hogToken.unprotectedMint(F, dec(20, 24));

      // deploy new LCF
      const LCFNew = await LockupContractFactory.new();

      // Check HOGToken address not registered
      const registeredHOGTokenAddr = await LCFNew.hogTokenAddress();
      assert.equal(registeredHOGTokenAddr, ZERO_ADDRESS);

      const tx = LCFNew.deployLockupContract(A, oneYearFromSystemDeployment, {
        from: F,
      });
      await assertRevert(tx);
    });
  });

  // --- LCs ---
  describe("Transferring HOG to LCs", async (accounts) => {
    it("Liquity multisig can transfer HOG (vesting) to lockup contracts they deployed", async () => {
      const initialHOGBalanceOfLC_T1 = await hogToken.balanceOf(LC_T1.address);
      const initialHOGBalanceOfLC_T2 = await hogToken.balanceOf(LC_T2.address);
      const initialHOGBalanceOfLC_T3 = await hogToken.balanceOf(LC_T3.address);

      // Check initial LC balances == entitlements
      assert.equal(initialHOGBalanceOfLC_T1, teamMemberInitialEntitlement_1);
      assert.equal(initialHOGBalanceOfLC_T2, teamMemberInitialEntitlement_2);
      assert.equal(initialHOGBalanceOfLC_T3, teamMemberInitialEntitlement_3);

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Liquity multisig transfers vesting amount
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

      // Liquity multisig transfers vesting amount
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

    it("Liquity multisig can transfer HOG to lockup contracts deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract with themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(
        A,
        twoYearsFromSystemDeployment,
        { from: A }
      );
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
        { from: B }
      );
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: C }
      );

      // LCs for team members on vesting schedules
      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A);
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C);

      // Check balances of LCs are 0
      assert.equal(await hogToken.balanceOf(LC_A.address), "0");
      assert.equal(await hogToken.balanceOf(LC_B.address), "0");
      assert.equal(await hogToken.balanceOf(LC_C.address), "0");

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider);

      // Liquity multisig transfers HOG to LCs deployed by other accounts
      await hogToken.transfer(LC_A.address, dec(1, 24), { from: multisig });
      await hogToken.transfer(LC_B.address, dec(2, 24), { from: multisig });
      await hogToken.transfer(LC_C.address, dec(3, 24), { from: multisig });

      // Check balances of LCs have increased
      assert.equal(await hogToken.balanceOf(LC_A.address), dec(1, 24));
      assert.equal(await hogToken.balanceOf(LC_B.address), dec(2, 24));
      assert.equal(await hogToken.balanceOf(LC_C.address), dec(3, 24));
    });
  });

  describe("Deploying new LCs", async (accounts) => {
    it("HOG Deployer can deploy LCs through the Factory", async () => {
      // HOG deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
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

    it("Liquity multisig can deploy LCs through the Factory", async () => {
      // HOG deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: multisig }
      );
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(
        B,
        twoYearsFromSystemDeployment,
        { from: multisig }
      );
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(
        C,
        "9595995999999900000023423234",
        { from: multisig }
      );

      assert.isTrue(LCDeploymentTx_A.receipt.status);
      assert.isTrue(LCDeploymentTx_B.receipt.status);
      assert.isTrue(LCDeploymentTx_C.receipt.status);
    });

    it("Anyone can deploy LCs through the Factory", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: teamMember_1 }
      );
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: investor_2 }
      );
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(
        liquityAG,
        "9595995999999900000023423234",
        { from: A }
      );
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        { from: B }
      );

      assert.isTrue(LCDeploymentTx_1.receipt.status);
      assert.isTrue(LCDeploymentTx_2.receipt.status);
      assert.isTrue(LCDeploymentTx_3.receipt.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
    });

    it("HOG Deployer can deploy LCs directly", async () => {
      // HOG deployer deploys LCs
      const LC_A = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(
        LC_A.transactionHash
      );

      const LC_B = await LockupContract.new(
        hogToken.address,
        B,
        twoYearsFromSystemDeployment,
        { from: liquityAG }
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(
        LC_B.transactionHash
      );

      const LC_C = await LockupContract.new(
        hogToken.address,
        C,
        twoYearsFromSystemDeployment,
        { from: liquityAG }
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(
        LC_C.transactionHash
      );

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Liquity multisig can deploy LCs directly", async () => {
      // HOG deployer deploys LCs
      const LC_A = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: multisig }
      );
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(
        LC_A.transactionHash
      );

      const LC_B = await LockupContract.new(
        hogToken.address,
        B,
        twoYearsFromSystemDeployment,
        { from: multisig }
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(
        LC_B.transactionHash
      );

      const LC_C = await LockupContract.new(
        hogToken.address,
        C,
        twoYearsFromSystemDeployment,
        { from: multisig }
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(
        LC_C.transactionHash
      );

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Anyone can deploy LCs directly", async () => {
      // Various EOAs deploy LCs
      const LC_A = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: D }
      );
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(
        LC_A.transactionHash
      );

      const LC_B = await LockupContract.new(
        hogToken.address,
        B,
        twoYearsFromSystemDeployment,
        { from: E }
      );
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(
        LC_B.transactionHash
      );

      const LC_C = await LockupContract.new(
        hogToken.address,
        C,
        twoYearsFromSystemDeployment,
        { from: F }
      );
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(
        LC_C.transactionHash
      );

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status);
      assert.isTrue(LC_B_txReceipt.status);
      assert.isTrue(LC_C_txReceipt.status);
    });

    it("Anyone can deploy LCs with unlockTime = one year from deployment, directly and through factory", async () => {
      // Deploy directly
      const LC_1 = await LockupContract.new(
        hogToken.address,
        A,
        oneYearFromSystemDeployment,
        { from: D }
      );
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(
        LC_1.transactionHash
      );

      const LC_2 = await LockupContract.new(
        hogToken.address,
        B,
        oneYearFromSystemDeployment,
        { from: liquityAG }
      );
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(
        LC_2.transactionHash
      );

      const LC_3 = await LockupContract.new(
        hogToken.address,
        C,
        oneYearFromSystemDeployment,
        { from: multisig }
      );
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(
        LC_2.transactionHash
      );

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: E }
      );
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: liquityAG }
      );
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        { from: multisig }
      );

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status);
      assert.isTrue(LCTxReceipt_2.status);
      assert.isTrue(LCTxReceipt_3.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
      assert.isTrue(LCDeploymentTx_5.receipt.status);
      assert.isTrue(LCDeploymentTx_6.receipt.status);
    });

    it("Anyone can deploy LCs with unlockTime > one year from deployment, directly and through factory", async () => {
      const justOverOneYear = oneYearFromSystemDeployment.add(toBN("1"));
      const _17YearsFromDeployment = oneYearFromSystemDeployment.add(
        toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN("2"))
      );

      // Deploy directly
      const LC_1 = await LockupContract.new(
        hogToken.address,
        A,
        twoYearsFromSystemDeployment,
        { from: D }
      );
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(
        LC_1.transactionHash
      );

      const LC_2 = await LockupContract.new(
        hogToken.address,
        B,
        justOverOneYear,
        { from: multisig }
      );
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(
        LC_2.transactionHash
      );

      const LC_3 = await LockupContract.new(
        hogToken.address,
        E,
        _17YearsFromDeployment,
        { from: E }
      );
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(
        LC_3.transactionHash
      );

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(
        A,
        oneYearFromSystemDeployment,
        { from: E }
      );
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(
        C,
        twoYearsFromSystemDeployment,
        { from: multisig }
      );
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(
        D,
        twoYearsFromSystemDeployment,
        { from: teamMember_2 }
      );

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status);
      assert.isTrue(LCTxReceipt_2.status);
      assert.isTrue(LCTxReceipt_3.status);
      assert.isTrue(LCDeploymentTx_4.receipt.status);
      assert.isTrue(LCDeploymentTx_5.receipt.status);
      assert.isTrue(LCDeploymentTx_6.receipt.status);
    });

    it("No one can deploy LCs with unlockTime < one year from deployment, directly or through factory", async () => {
      const justUnderOneYear = oneYearFromSystemDeployment.sub(toBN("1"));

      // Attempt to deploy directly
      const directDeploymentTxPromise_1 = LockupContract.new(
        hogToken.address,
        A,
        justUnderOneYear,
        { from: D }
      );
      const directDeploymentTxPromise_2 = LockupContract.new(
        hogToken.address,
        B,
        "43200",
        { from: multisig }
      );
      const directDeploymentTxPromise_3 = LockupContract.new(
        hogToken.address,
        E,
        "354534",
        { from: E }
      );

      // Attempt to deploy through factory
      const factoryDploymentTxPromise_1 =
        lockupContractFactory.deployLockupContract(A, justUnderOneYear, {
          from: E,
        });
      const factoryDploymentTxPromise_2 =
        lockupContractFactory.deployLockupContract(C, "43200", {
          from: multisig,
        });
      const factoryDploymentTxPromise_3 =
        lockupContractFactory.deployLockupContract(D, "354534", {
          from: teamMember_2,
        });

      // Check deployments reverted
      await assertRevert(
        directDeploymentTxPromise_1,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
      await assertRevert(
        directDeploymentTxPromise_2,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
      await assertRevert(
        directDeploymentTxPromise_3,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
      await assertRevert(
        factoryDploymentTxPromise_1,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
      await assertRevert(
        factoryDploymentTxPromise_2,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
      await assertRevert(
        factoryDploymentTxPromise_3,
        "LockupContract: unlock time must be at least one year after system deployment"
      );
    });

    describe("Withdrawal Attempts on LCs before unlockTime has passed ", async (accounts) => {
      it("Liquity multisig can't withdraw from a funded LC they deployed for another beneficiary through the Factory before the unlockTime", async () => {
        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_T1.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        // Liquity multisig attempts withdrawal from LC they deployed through the Factory
        try {
          const withdrawalAttempt = await LC_T1.withdrawHOG({
            from: multisig,
          });
          assert.isFalse(withdrawalAttempt.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      });

      it("Liquity multisig can't withdraw from a funded LC that someone else deployed before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: D }
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        //HOG multisig fund the newly deployed LCs
        await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        // Liquity multisig attempts withdrawal from LCs
        try {
          const withdrawalAttempt_B = await LC_B.withdrawHOG({
            from: multisig,
          });
          assert.isFalse(withdrawalAttempt_B.receipt.status);
        } catch (error) {
          assert.include(
            error.message,
            "LockupContract: caller is not the beneficiary"
          );
        }
      });

      it("Beneficiary can't withdraw from their funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: D }
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        // Liquity multisig funds contracts
        await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        /* Beneficiaries of all LCS - team, investor, and newly created LCs - 
        attempt to withdraw from their respective funded contracts */
        const LCs = [LC_T1, LC_T2, LC_T3, LC_I1, LC_I2, LC_T3, LC_B];

        for (LC of LCs) {
          try {
            const beneficiary = await LC.beneficiary();
            const withdrawalAttempt = await LC.withdrawHOG({
              from: beneficiary,
            });
            assert.isFalse(withdrawalAttempt.receipt.status);
          } catch (error) {
            assert.include(
              error.message,
              "LockupContract: The lockup duration must have passed"
            );
          }
        }
      });

      it("No one can withdraw from a beneficiary's funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(
          B,
          oneYearFromSystemDeployment,
          { from: D }
        );
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B);

        // Liquity multisig funds contract
        await hogToken.transfer(LC_B.address, dec(2, 18), { from: multisig });

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3));
        const unlockTime = await LC_B.unlockTime();
        assert.isTrue(currentTime.lt(unlockTime));

        const variousEOAs = [
          teamMember_2,
          liquityAG,
          multisig,
          investor_1,
          A,
          C,
          D,
          E,
        ];

        // Several EOAs attempt to withdraw from LC deployed by D
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_B.withdrawHOG({
              from: account,
            });
            assert.isFalse(withdrawalAttempt.receipt.status);
          } catch (error) {
            assert.include(
              error.message,
              "LockupContract: caller is not the beneficiary"
            );
          }
        }

        // Several EOAs attempt to withdraw from LC_T1 deployed by HOG deployer
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_T1.withdrawHOG({
              from: account,
            });
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
});
