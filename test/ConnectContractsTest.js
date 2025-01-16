const deploymentHelper = require("../utils/deploymentHelpers.js");

contract(
  "Deployment script - Sets correct contract addresses dependencies after deployment",
  async (accounts) => {
    const [owner] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(-3)


    let priceFeed;
    let baseFeeLMAToken;
    let sortedTroves;
    let troveManager;
    let activePool;
    let stabilityPool;
    let defaultPool;
    let functionCaller;
    let borrowerOperations;
    let hogStaking;
    let hogToken;
    let communityIssuance;
    let lockupContractFactory;

    before(async () => {
      const coreContracts = await deploymentHelper.deployLiquityCore();
      const HOGContracts = await deploymentHelper.deployHOGContracts(
        bountyAddress,
        lpRewardsAddress,
        multisig
      );

      priceFeed = coreContracts.priceFeedTestnet;
      baseFeeLMAToken = coreContracts.baseFeeLMAToken;
      sortedTroves = coreContracts.sortedTroves;
      troveManager = coreContracts.troveManager;
      activePool = coreContracts.activePool;
      stabilityPool = coreContracts.stabilityPool;
      defaultPool = coreContracts.defaultPool;
      functionCaller = coreContracts.functionCaller;
      borrowerOperations = coreContracts.borrowerOperations;

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
    });

    it("Sets the correct PriceFeed address in TroveManager", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await troveManager.priceFeed();

      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    it("Sets the correct BaseFeeLMAToken address in TroveManager", async () => {
      const baseFeeLMATokenAddress = baseFeeLMAToken.address;

      const recordedClvTokenAddress = await troveManager.baseFeeLMAToken();

      assert.equal(baseFeeLMATokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct SortedTroves address in TroveManager", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress = await troveManager.sortedTroves();

      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    it("Sets the correct BorrowerOperations address in TroveManager", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await troveManager.borrowerOperationsAddress();

      assert.equal(
        borrowerOperationsAddress,
        recordedBorrowerOperationsAddress
      );
    });

    // ActivePool in TroveM
    it("Sets the correct ActivePool address in TroveManager", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddresss = await troveManager.activePool();

      assert.equal(activePoolAddress, recordedActivePoolAddresss);
    });

    // DefaultPool in TroveM
    it("Sets the correct DefaultPool address in TroveManager", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddresss = await troveManager.defaultPool();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddresss);
    });

    // StabilityPool in TroveM
    it("Sets the correct StabilityPool address in TroveManager", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddresss = await troveManager.stabilityPool();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddresss);
    });

    // HOG Staking in TroveM
    it("Sets the correct HOGStaking address in TroveManager", async () => {
      const hogStakingAddress = hogStaking.address;

      const recordedHOGStakingAddress = await troveManager.hogStaking();
      assert.equal(hogStakingAddress, recordedHOGStakingAddress);
    });

    // Active Pool

    it("Sets the correct StabilityPool address in ActivePool", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress =
        await activePool.stabilityPoolAddress();

      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });

    it("Sets the correct DefaultPool address in ActivePool", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await activePool.defaultPoolAddress();

      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    it("Sets the correct BorrowerOperations address in ActivePool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await activePool.borrowerOperationsAddress();

      assert.equal(
        borrowerOperationsAddress,
        recordedBorrowerOperationsAddress
      );
    });

    it("Sets the correct TroveManager address in ActivePool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress =
        await activePool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Stability Pool

    it("Sets the correct ActivePool address in StabilityPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await stabilityPool.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct BorrowerOperations address in StabilityPool", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await stabilityPool.borrowerOperations();

      assert.equal(
        borrowerOperationsAddress,
        recordedBorrowerOperationsAddress
      );
    });

    it("Sets the correct BaseFeeLMAToken address in StabilityPool", async () => {
      const baseFeeLMATokenAddress = baseFeeLMAToken.address;

      const recordedClvTokenAddress = await stabilityPool.baseFeeLMAToken();

      assert.equal(baseFeeLMATokenAddress, recordedClvTokenAddress);
    });

    it("Sets the correct TroveManager address in StabilityPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await stabilityPool.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Default Pool

    it("Sets the correct TroveManager address in DefaultPool", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress =
        await defaultPool.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    it("Sets the correct ActivePool address in DefaultPool", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await defaultPool.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    it("Sets the correct TroveManager address in SortedTroves", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await sortedTroves.borrowerOperationsAddress();
      assert.equal(
        borrowerOperationsAddress,
        recordedBorrowerOperationsAddress
      );
    });

    it("Sets the correct BorrowerOperations address in SortedTroves", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress = await sortedTroves.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    //--- BorrowerOperations ---

    // TroveManager in BO
    it("Sets the correct TroveManager address in BorrowerOperations", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress =
        await borrowerOperations.troveManager();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // setPriceFeed in BO
    it("Sets the correct PriceFeed address in BorrowerOperations", async () => {
      const priceFeedAddress = priceFeed.address;

      const recordedPriceFeedAddress = await borrowerOperations.priceFeed();
      assert.equal(priceFeedAddress, recordedPriceFeedAddress);
    });

    // setSortedTroves in BO
    it("Sets the correct SortedTroves address in BorrowerOperations", async () => {
      const sortedTrovesAddress = sortedTroves.address;

      const recordedSortedTrovesAddress =
        await borrowerOperations.sortedTroves();
      assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress);
    });

    // setActivePool in BO
    it("Sets the correct ActivePool address in BorrowerOperations", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await borrowerOperations.activePool();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // setDefaultPool in BO
    it("Sets the correct DefaultPool address in BorrowerOperations", async () => {
      const defaultPoolAddress = defaultPool.address;

      const recordedDefaultPoolAddress = await borrowerOperations.defaultPool();
      assert.equal(defaultPoolAddress, recordedDefaultPoolAddress);
    });

    // HOG Staking in BO
    it("Sets the correct HOGStaking address in BorrowerOperations", async () => {
      const hogStakingAddress = hogStaking.address;

      const recordedHOGStakingAddress =
        await borrowerOperations.hogStakingAddress();
      assert.equal(hogStakingAddress, recordedHOGStakingAddress);
    });

    // --- HOG Staking ---

    // Sets HOGToken in HOGStaking
    it("Sets the correct HOGToken address in HOGStaking", async () => {
      const hogTokenAddress = hogToken.address;

      const recordedHOGTokenAddress = await hogStaking.hogToken();
      assert.equal(hogTokenAddress, recordedHOGTokenAddress);
    });

    // Sets ActivePool in HOGStaking
    it("Sets the correct ActivePool address in HOGStaking", async () => {
      const activePoolAddress = activePool.address;

      const recordedActivePoolAddress = await hogStaking.activePoolAddress();
      assert.equal(activePoolAddress, recordedActivePoolAddress);
    });

    // Sets BaseFeeLMAToken in HOGStaking
    it("Sets the correct ActivePool address in HOGStaking", async () => {
      const baseFeeLMATokenAddress = baseFeeLMAToken.address;

      const recordedBaseFeeLMATokenAddress = await hogStaking.baseFeeLMAToken();
      assert.equal(baseFeeLMATokenAddress, recordedBaseFeeLMATokenAddress);
    });

    // Sets TroveManager in HOGStaking
    it("Sets the correct ActivePool address in HOGStaking", async () => {
      const troveManagerAddress = troveManager.address;

      const recordedTroveManagerAddress =
        await hogStaking.troveManagerAddress();
      assert.equal(troveManagerAddress, recordedTroveManagerAddress);
    });

    // Sets BorrowerOperations in HOGStaking
    it("Sets the correct BorrowerOperations address in HOGStaking", async () => {
      const borrowerOperationsAddress = borrowerOperations.address;

      const recordedBorrowerOperationsAddress =
        await hogStaking.borrowerOperationsAddress();
      assert.equal(
        borrowerOperationsAddress,
        recordedBorrowerOperationsAddress
      );
    });

    // ---  HOGToken ---

    // Sets CI in HOGToken
    it("Sets the correct CommunityIssuance address in HOGToken", async () => {
      const communityIssuanceAddress = communityIssuance.address;

      const recordedcommunityIssuanceAddress =
        await hogToken.communityIssuanceAddress();
      assert.equal(communityIssuanceAddress, recordedcommunityIssuanceAddress);
    });

    // Sets HOGStaking in HOGToken
    it("Sets the correct HOGStaking address in HOGToken", async () => {
      const hogStakingAddress = hogStaking.address;

      const recordedHOGStakingAddress = await hogToken.hogStakingAddress();
      assert.equal(hogStakingAddress, recordedHOGStakingAddress);
    });

    // Sets LCF in HOGToken
    it("Sets the correct LockupContractFactory address in HOGToken", async () => {
      const LCFAddress = lockupContractFactory.address;

      const recordedLCFAddress = await hogToken.lockupContractFactory();
      assert.equal(LCFAddress, recordedLCFAddress);
    });

    // --- LCF  ---

    // Sets HOGToken in LockupContractFactory
    it("Sets the correct HOGToken address in LockupContractFactory", async () => {
      const hogTokenAddress = hogToken.address;

      const recordedHOGTokenAddress =
        await lockupContractFactory.hogTokenAddress();
      assert.equal(hogTokenAddress, recordedHOGTokenAddress);
    });

    // --- CI ---

    // Sets HOGToken in CommunityIssuance
    it("Sets the correct HOGToken address in CommunityIssuance", async () => {
      const hogTokenAddress = hogToken.address;

      const recordedHOGTokenAddress = await communityIssuance.hogToken();
      assert.equal(hogTokenAddress, recordedHOGTokenAddress);
    });

    it("Sets the correct StabilityPool address in CommunityIssuance", async () => {
      const stabilityPoolAddress = stabilityPool.address;

      const recordedStabilityPoolAddress =
        await communityIssuance.stabilityPoolAddress();
      assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress);
    });
  }
);
