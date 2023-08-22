const SortedTroves = artifacts.require("./SortedTroves.sol");
const TroveManager = artifacts.require("./TroveManager.sol");
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol");
const BaseFeeLMAToken = artifacts.require("./BaseFeeLMAToken.sol");
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol");
const GasPool = artifacts.require("./GasPool.sol");
const CollSurplusPool = artifacts.require("./CollSurplusPool.sol");
const FunctionCaller = artifacts.require("./TestContracts/FunctionCaller.sol");
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol");
const HintHelpers = artifacts.require("./HintHelpers.sol");

const HOGStaking = artifacts.require("./HOGStaking.sol");
const HOGToken = artifacts.require("./HOGToken.sol");
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol");
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol");

const Unipool = artifacts.require("./Unipool.sol");

const HOGTokenTester = artifacts.require("./HOGTokenTester.sol");
const CommunityIssuanceTester = artifacts.require(
  "./CommunityIssuanceTester.sol"
);
const StabilityPoolTester = artifacts.require("./StabilityPoolTester.sol");
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol");
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol");
const LiquityMathTester = artifacts.require("./LiquityMathTester.sol");
const BorrowerOperationsTester = artifacts.require(
  "./BorrowerOperationsTester.sol"
);
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol");
const BaseFeeLMATokenTester = artifacts.require("./BaseFeeLMATokenTester.sol");

// Proxy scripts
const BorrowerOperationsScript = artifacts.require("BorrowerOperationsScript");
const BorrowerWrappersScript = artifacts.require("BorrowerWrappersScript");
const TroveManagerScript = artifacts.require("TroveManagerScript");
const StabilityPoolScript = artifacts.require("StabilityPoolScript");
const TokenScript = artifacts.require("TokenScript");
const HOGStakingScript = artifacts.require("HOGStakingScript");
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

/* "Liquity core" consists of all contracts in the core Liquity system.

HOG contracts consist of only those contracts related to the HOG Token:

-the HOG token
-the Lockup factory and lockup contracts
-the HOGStaking contract
-the CommunityIssuance contract 
*/

const ZERO_ADDRESS = "0x" + "0".repeat(40);
const maxBytes32 = "0x" + "f".repeat(64);

class DeploymentHelper {
  static async deployLiquityCore() {
    const cmdLineArgs = process.argv;
    const frameworkPath = cmdLineArgs[1];
    // console.log(`Framework used:  ${frameworkPath}`)

    if (frameworkPath.includes("hardhat")) {
      return this.deployLiquityCoreHardhat();
    } else if (frameworkPath.includes("truffle")) {
      return this.deployLiquityCoreTruffle();
    }
  }

  static async deployHOGContracts(
    bountyAddress,
    lpRewardsAddress,
    multisigAddress
  ) {
    const cmdLineArgs = process.argv;
    const frameworkPath = cmdLineArgs[1];
    // console.log(`Framework used:  ${frameworkPath}`)

    if (frameworkPath.includes("hardhat")) {
      return this.deployHOGContractsHardhat(
        bountyAddress,
        lpRewardsAddress,
        multisigAddress
      );
    } else if (frameworkPath.includes("truffle")) {
      return this.deployHOGContractsTruffle(
        bountyAddress,
        lpRewardsAddress,
        multisigAddress
      );
    }
  }

  static async deployLiquityCoreHardhat() {
    const priceFeedTestnet = await PriceFeedTestnet.new();
    const sortedTroves = await SortedTroves.new();
    const troveManager = await TroveManager.new();
    const activePool = await ActivePool.new();
    const stabilityPool = await StabilityPool.new();
    const gasPool = await GasPool.new();
    const defaultPool = await DefaultPool.new();
    const collSurplusPool = await CollSurplusPool.new();
    const functionCaller = await FunctionCaller.new();
    const borrowerOperations = await BorrowerOperations.new();
    const hintHelpers = await HintHelpers.new();
    const baseFeeLMAToken = await BaseFeeLMAToken.new(
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    );
    BaseFeeLMAToken.setAsDeployed(baseFeeLMAToken);
    DefaultPool.setAsDeployed(defaultPool);
    PriceFeedTestnet.setAsDeployed(priceFeedTestnet);
    SortedTroves.setAsDeployed(sortedTroves);
    TroveManager.setAsDeployed(troveManager);
    ActivePool.setAsDeployed(activePool);
    StabilityPool.setAsDeployed(stabilityPool);
    GasPool.setAsDeployed(gasPool);
    CollSurplusPool.setAsDeployed(collSurplusPool);
    FunctionCaller.setAsDeployed(functionCaller);
    BorrowerOperations.setAsDeployed(borrowerOperations);
    HintHelpers.setAsDeployed(hintHelpers);

    const coreContracts = {
      priceFeedTestnet,
      baseFeeLMAToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      functionCaller,
      borrowerOperations,
      hintHelpers,
    };
    return coreContracts;
  }

  static async deployTesterContractsHardhat() {
    const testerContracts = {};

    // Contract without testers (yet)
    testerContracts.priceFeedTestnet = await PriceFeedTestnet.new();
    testerContracts.sortedTroves = await SortedTroves.new();
    // Actual tester contracts
    testerContracts.communityIssuance = await CommunityIssuanceTester.new();
    testerContracts.activePool = await ActivePoolTester.new();
    testerContracts.defaultPool = await DefaultPoolTester.new();
    testerContracts.stabilityPool = await StabilityPoolTester.new();
    testerContracts.gasPool = await GasPool.new();
    testerContracts.collSurplusPool = await CollSurplusPool.new();
    testerContracts.math = await LiquityMathTester.new();
    testerContracts.borrowerOperations = await BorrowerOperationsTester.new();
    testerContracts.troveManager = await TroveManagerTester.new();
    testerContracts.functionCaller = await FunctionCaller.new();
    testerContracts.hintHelpers = await HintHelpers.new();
    testerContracts.baseFeeLMAToken = await BaseFeeLMATokenTester.new(
      testerContracts.troveManager.address,
      testerContracts.stabilityPool.address,
      testerContracts.borrowerOperations.address
    );
    return testerContracts;
  }

  static async deployHOGContractsHardhat(
    bountyAddress,
    lpRewardsAddress,
    multisigAddress
  ) {
    const hogStaking = await HOGStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuance.new();

    HOGStaking.setAsDeployed(hogStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuance.setAsDeployed(communityIssuance);

    // Deploy HOG Token, passing Community Issuance and Factory addresses to the constructor
    const hogToken = await HOGToken.new(
      communityIssuance.address,
      hogStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );
    HOGToken.setAsDeployed(hogToken);

    const HOGContracts = {
      hogStaking,
      lockupContractFactory,
      communityIssuance,
      hogToken,
    };
    return HOGContracts;
  }

  static async deployHOGTesterContractsHardhat(
    bountyAddress,
    lpRewardsAddress,
    multisigAddress
  ) {
    const hogStaking = await HOGStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuanceTester.new();

    HOGStaking.setAsDeployed(hogStaking);
    LockupContractFactory.setAsDeployed(lockupContractFactory);
    CommunityIssuanceTester.setAsDeployed(communityIssuance);

    // Deploy HOG Token, passing Community Issuance and Factory addresses to the constructor
    const hogToken = await HOGTokenTester.new(
      communityIssuance.address,
      hogStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );
    HOGTokenTester.setAsDeployed(hogToken);

    const HOGContracts = {
      hogStaking,
      lockupContractFactory,
      communityIssuance,
      hogToken,
    };
    return HOGContracts;
  }

  static async deployLiquityCoreTruffle() {
    const priceFeedTestnet = await PriceFeedTestnet.new();
    const sortedTroves = await SortedTroves.new();
    const troveManager = await TroveManager.new();
    const activePool = await ActivePool.new();
    const stabilityPool = await StabilityPool.new();
    const gasPool = await GasPool.new();
    const defaultPool = await DefaultPool.new();
    const collSurplusPool = await CollSurplusPool.new();
    const functionCaller = await FunctionCaller.new();
    const borrowerOperations = await BorrowerOperations.new();
    const hintHelpers = await HintHelpers.new();
    const baseFeeLMAToken = await BaseFeeLMAToken.new(
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    );
    const coreContracts = {
      priceFeedTestnet,
      baseFeeLMAToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      functionCaller,
      borrowerOperations,
      hintHelpers,
    };
    return coreContracts;
  }

  static async deployHOGContractsTruffle(
    bountyAddress,
    lpRewardsAddress,
    multisigAddress
  ) {
    const hogStaking = await hogStaking.new();
    const lockupContractFactory = await LockupContractFactory.new();
    const communityIssuance = await CommunityIssuance.new();

    /* Deploy HOG Token, passing Community Issuance,  HOGStaking, and Factory addresses 
    to the constructor  */
    const hogToken = await HOGToken.new(
      communityIssuance.address,
      hogStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    );

    const HOGContracts = {
      hogStaking,
      lockupContractFactory,
      communityIssuance,
      hogToken,
    };
    return HOGContracts;
  }

  static async deployBaseFeeLMAToken(contracts) {
    contracts.baseFeeLMAToken = await BaseFeeLMAToken.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    );
    return contracts;
  }

  static async deployBaseFeeLMATokenTester(contracts) {
    contracts.baseFeeLMAToken = await BaseFeeLMATokenTester.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    );
    return contracts;
  }

  static async deployProxyScripts(contracts, HOGContracts, owner, users) {
    const proxies = await buildUserProxies(users);

    const borrowerWrappersScript = await BorrowerWrappersScript.new(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      HOGContracts.hogStaking.address
    );
    contracts.borrowerWrappers = new BorrowerWrappersProxy(
      owner,
      proxies,
      borrowerWrappersScript.address
    );

    const borrowerOperationsScript = await BorrowerOperationsScript.new(
      contracts.borrowerOperations.address
    );
    contracts.borrowerOperations = new BorrowerOperationsProxy(
      owner,
      proxies,
      borrowerOperationsScript.address,
      contracts.borrowerOperations
    );

    const troveManagerScript = await TroveManagerScript.new(
      contracts.troveManager.address
    );
    contracts.troveManager = new TroveManagerProxy(
      owner,
      proxies,
      troveManagerScript.address,
      contracts.troveManager
    );

    const stabilityPoolScript = await StabilityPoolScript.new(
      contracts.stabilityPool.address
    );
    contracts.stabilityPool = new StabilityPoolProxy(
      owner,
      proxies,
      stabilityPoolScript.address,
      contracts.stabilityPool
    );

    contracts.sortedTroves = new SortedTrovesProxy(
      owner,
      proxies,
      contracts.sortedTroves
    );

    const baseFeeLMATokenScript = await TokenScript.new(
      contracts.baseFeeLMAToken.address
    );
    contracts.baseFeeLMAToken = new TokenProxy(
      owner,
      proxies,
      baseFeeLMATokenScript.address,
      contracts.baseFeeLMAToken
    );

    const hogTokenScript = await TokenScript.new(HOGContracts.hogToken.address);
    HOGContracts.hogToken = new TokenProxy(
      owner,
      proxies,
      hogTokenScript.address,
      HOGContracts.hogToken
    );

    const hogStakingScript = await HOGStakingScript.new(
      HOGContracts.hogStaking.address
    );
    HOGContracts.hogStaking = new HOGStakingProxy(
      owner,
      proxies,
      hogStakingScript.address,
      HOGContracts.hogStaking
    );
  }

  // Connect contracts to their dependencies
  static async connectCoreContracts(contracts, HOGContracts) {
    // set TroveManager addr in SortedTroves
    await contracts.sortedTroves.setParams(
      maxBytes32,
      contracts.troveManager.address,
      contracts.borrowerOperations.address
    );

    // set contract addresses in the FunctionCaller
    await contracts.functionCaller.setTroveManagerAddress(
      contracts.troveManager.address
    );
    await contracts.functionCaller.setSortedTrovesAddress(
      contracts.sortedTroves.address
    );

    // set contracts in the Trove Manager
    await contracts.troveManager.setAddresses(
      contracts.borrowerOperations.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.baseFeeLMAToken.address,
      contracts.sortedTroves.address,
      HOGContracts.hogToken.address,
      HOGContracts.hogStaking.address
    );

    // set contracts in BorrowerOperations
    await contracts.borrowerOperations.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.defaultPool.address,
      contracts.stabilityPool.address,
      contracts.gasPool.address,
      contracts.collSurplusPool.address,
      contracts.priceFeedTestnet.address,
      contracts.sortedTroves.address,
      contracts.baseFeeLMAToken.address,
      HOGContracts.hogStaking.address
    );

    // set contracts in the Pools
    await contracts.stabilityPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address,
      contracts.baseFeeLMAToken.address,
      contracts.sortedTroves.address,
      contracts.priceFeedTestnet.address,
      HOGContracts.communityIssuance.address
    );

    await contracts.activePool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.defaultPool.address
    );

    await contracts.defaultPool.setAddresses(
      contracts.troveManager.address,
      contracts.activePool.address
    );

    await contracts.collSurplusPool.setAddresses(
      contracts.borrowerOperations.address,
      contracts.troveManager.address,
      contracts.activePool.address
    );

    // set contracts in HintHelpers
    await contracts.hintHelpers.setAddresses(
      contracts.sortedTroves.address,
      contracts.troveManager.address
    );
  }

  static async connectHOGContracts(HOGContracts) {
    // Set HOGToken address in LCF
    await HOGContracts.lockupContractFactory.setHOGTokenAddress(
      HOGContracts.hogToken.address
    );
  }

  static async connectHOGContractsToCore(HOGContracts, coreContracts) {
    await HOGContracts.hogStaking.setAddresses(
      HOGContracts.hogToken.address,
      coreContracts.baseFeeLMAToken.address,
      coreContracts.troveManager.address,
      coreContracts.borrowerOperations.address,
      coreContracts.activePool.address
    );

    await HOGContracts.communityIssuance.setAddresses(
      HOGContracts.hogToken.address,
      coreContracts.stabilityPool.address
    );
  }

  static async connectUnipool(
    uniPool,
    HOGContracts,
    uniswapPairAddr,
    duration
  ) {
    await uniPool.setParams(
      HOGContracts.hogToken.address,
      uniswapPairAddr,
      duration
    );
  }
}
module.exports = DeploymentHelper;
