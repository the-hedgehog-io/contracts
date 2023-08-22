// Hardhat script
const SortedTroves = artifacts.require("./SortedTroves.sol");
const TroveManager = artifacts.require("./TroveManager.sol");
const PriceFeed = artifacts.require("./PriceFeed.sol");
const BaseFeeLMAToken = artifacts.require("./BaseFeeLMAToken.sol");
const ActivePool = artifacts.require("./ActivePool.sol");
const DefaultPool = artifacts.require("./DefaultPool.sol");
const StabilityPool = artifacts.require("./StabilityPool.sol");
const FunctionCaller = artifacts.require("./FunctionCaller.sol");
const BorrowerOperations = artifacts.require("./BorrowerOperations.sol");

const HOGStaking = artifacts.require("./HOG/HOGStaking.sol");
const HOGToken = artifacts.require("./HOG/HOGToken.sol");
const LockupContractFactory = artifacts.require(
  "./HOG/LockupContractFactory.sol"
);
const CommunityIssuance = artifacts.require("./HOG/CommunityIssuance.sol");
const HintHelpers = artifacts.require("./HintHelpers.sol");

const CommunityIssuanceTester = artifacts.require(
  "./HOG/CommunityIssuanceTester.sol"
);
const ActivePoolTester = artifacts.require("./ActivePoolTester.sol");
const DefaultPoolTester = artifacts.require("./DefaultPoolTester.sol");
const LiquityMathTester = artifacts.require("./LiquityMathTester.sol");
const BorrowerOperationsTester = artifacts.require(
  "./BorrowerOperationsTester.sol"
);
const TroveManagerTester = artifacts.require("./TroveManagerTester.sol");
const BaseFeeLMATokenTester = artifacts.require("./BaseFeeLMATokenTester.sol");

const { TestHelper: th } = require("../utils/testHelpers.js");

const dh = require("./deploymentHelpers.js");
const ARBITRARY_ADDRESS = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"; // placeholder for the LPrewards bounty addresses

const coreContractABIs = [
  BorrowerOperations,
  PriceFeed,
  BaseFeeLMAToken,
  SortedTroves,
  TroveManager,
  ActivePool,
  StabilityPool,
  DefaultPool,
  FunctionCaller,
  HintHelpers,
];

const HOGContractABIs = [
  HOGStaking,
  HOGToken,
  LockupContractFactory,
  CommunityIssuance,
];

const TesterContractABIs = [
  CommunityIssuanceTester,
  ActivePoolTester,
  DefaultPoolTester,
  LiquityMathTester,
  BorrowerOperationsTester,
  TroveManagerTester,
  BaseFeeLMATokenTester,
];

const getGasFromContractDeployment = async (contractObject, name) => {
  const txHash = contractObject.transactionHash;
  // console.log(`tx hash  of ${name} deployment is is: ${txHash}`)
  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  const gas = receipt.gasUsed;
  console.log(`${name}: ${gas}`);
  return gas;
};

const getBytecodeSize = (contractABI) => {
  const bytecodeLength = contractABI.bytecode.length / 2 - 1;
  const deployedBytecodeLength = contractABI.deployedBytecode.length / 2 - 1;
  console.log(`${contractABI.contractName}: ${bytecodeLength}`);
  // console.log(`${contractABI.contractName} deployed bytecode length: ${deployedBytecodeLength}`)
};

const getUSDCostFromGasCost = (
  deploymentGasTotal,
  gasPriceInGwei,
  ETHPrice
) => {
  const dollarCost = (deploymentGasTotal * gasPriceInGwei * ETHPrice) / 1e9;
  console.log(
    `At gas price ${gasPriceInGwei} GWei, and StETH Price $${ETHPrice} per StETH, the total cost of deployment in USD is: $${dollarCost}`
  );
};

const logContractDeploymentCosts = async (contracts) => {
  console.log(`Gas costs for deployments: `);
  let totalGasCost = 0;
  for (contractName of Object.keys(contracts)) {
    const gasCost = await getGasFromContractDeployment(
      contracts[contractName],
      contractName
    );
    totalGasCost = totalGasCost + Number(gasCost);
  }
  console.log(`Total deployment gas costs: ${totalGasCost}`);
  getUSDCostFromGasCost(totalGasCost, 200, 1850);
};

const logContractObjects = async (contracts) => {
  console.log(`Contract objects addresses:`);
  let totalGasCost = 0;
  for (contractName of Object.keys(contracts)) {
    const gasCost = await getGasFromContractDeployment(
      contracts[contractName],
      contractName
    );
    totalGasCost = totalGasCost + Number(gasCost);
  }
};

const logContractBytecodeLengths = (contractABIs) => {
  console.log(`Contract bytecode lengths:`);
  for (abi of contractABIs) {
    getBytecodeSize(abi);
  }
};

// Run script: log deployment gas costs and bytecode lengths for all contracts
async function main() {
  const coreContracts = await dh.deployLiquityCoreHardhat();
  const HOGContracts = await dh.deployHOGContractsHardhat(
    ARBITRARY_ADDRESS,
    ARBITRARY_ADDRESS
  );
  const testerContracts = await dh.deployTesterContractsHardhat();

  await dh.connectCoreContracts(coreContracts, HOGContracts);
  await dh.connectHOGContracts(HOGContracts);
  await dh.connectHOGContractsToCore(HOGContracts, coreContracts);

  console.log(`\n`);
  console.log(`HOG CONTRACTS`);
  await logContractDeploymentCosts(HOGContracts);
  console.log(`\n`);
  logContractBytecodeLengths(HOGContractABIs);
  console.log(`\n`);

  console.log(`CORE CONTRACTS`);
  await logContractDeploymentCosts(coreContracts);
  console.log(`\n`);
  logContractBytecodeLengths(coreContractABIs);
  console.log(`\n`);

  console.log(`TESTER CONTRACTS`);
  await logContractDeploymentCosts(testerContracts);
  console.log(`\n`);
  logContractBytecodeLengths(TesterContractABIs);
  console.log(`\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
