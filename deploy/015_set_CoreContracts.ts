import { DeployFunction } from "hardhat-deploy/types";
import { createExecuteWithLog, isOwnershipRenounced } from "../deploy-helpers";
import { deployConfig } from "../deploy-helpers/deployConfig";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);
  const PriceFeed = await deployments.get("PriceFeed");
  const SortedTroves = await deployments.get("SortedTroves");
  const TroveManager = await deployments.get("TroveManager");
  const ActivePool = await deployments.get("ActivePool");
  const DefaultPool = await deployments.get("DefaultPool");
  const GasPool = await deployments.get("GasPool");
  const StabilityPool = await deployments.get("StabilityPool");
  const CollSurplusPool = await deployments.get("CollSurplusPool");
  const BaseFeeLMAToken = await deployments.get("BaseFeeLMAToken");
  const BorrowerOperations = await deployments.get("BorrowerOperations");
  const HOGToken = await deployments.get("HOGToken");
  const CommunityIssuance = await deployments.get("CommunityIssuance");
  const HintHelpers = await deployments.get("HintHelpers");
  const FeesRouter = await deployments.get("FeesRouter");
  const { wstETH: WStETHAddress, mainOracle, backupOracle } = deployConfig;

  if (!(await isOwnershipRenounced(SortedTroves.address))) {
    console.log("Setting up SortedTroves...");

    const maxBytes32 = "0x" + "f".repeat(64);

    await executeWithLog(
      "SortedTroves",
      { from: deployer },
      "setParams",
      maxBytes32,
      TroveManager.address,
      BorrowerOperations.address
    );
  }
  console.log("SortedTroves is set");

  if (!(await isOwnershipRenounced(TroveManager.address))) {
    console.log("Setting up Trove Manager...");
    await executeWithLog(
      "TroveManager",
      { from: deployer },
      "setAddresses",
      BorrowerOperations.address,
      ActivePool.address,
      DefaultPool.address,
      StabilityPool.address,
      GasPool.address,
      CollSurplusPool.address,
      PriceFeed.address,
      BaseFeeLMAToken.address,
      SortedTroves.address,
      HOGToken.address,
      FeesRouter.address
    );
  }
  console.log("TroveManager is set");

  // if (!(await isOwnershipRenounced(PriceFeed.address))) {
  //   console.log("Setting up Price Feed...");
  //   await executeWithLog(
  //     "PriceFeed",
  //     { from: deployer },
  //     "setAddresses",
  //     mainOracle,
  //     backupOracle
  //   );
  // }
  // console.log("PriceFeed is set");

  if (!(await isOwnershipRenounced(BorrowerOperations.address))) {
    console.log("Setting up BorrowerOperations...");
    await executeWithLog(
      "BorrowerOperations",
      { from: deployer },
      "setAddresses",

      TroveManager.address,
      ActivePool.address,
      DefaultPool.address,
      StabilityPool.address,
      GasPool.address,
      CollSurplusPool.address,
      PriceFeed.address,
      SortedTroves.address,
      BaseFeeLMAToken.address,
      WStETHAddress,
      FeesRouter.address
    );
  }
  console.log("BorrowerOperations is set");

  if (!(await isOwnershipRenounced(StabilityPool.address))) {
    console.log("Setting up StabilityPool...");
    await executeWithLog(
      "StabilityPool",
      { from: deployer },
      "setAddresses",
      BorrowerOperations.address,
      TroveManager.address,
      ActivePool.address,
      BaseFeeLMAToken.address,
      SortedTroves.address,
      PriceFeed.address,
      CommunityIssuance.address,
      WStETHAddress
    );
  }
  console.log("StabilityPool is set");

  if (!(await isOwnershipRenounced(ActivePool.address))) {
    console.log("Setting up ActivePool...");

    await executeWithLog(
      "ActivePool",
      { from: deployer },
      "setAddresses",
      BorrowerOperations.address,
      TroveManager.address,
      StabilityPool.address,
      DefaultPool.address,
      WStETHAddress,
      FeesRouter.address
    );
  }
  console.log("ActivePool is set");

  if (!(await isOwnershipRenounced(DefaultPool.address))) {
    console.log("Setting up DefaultPool...");

    await executeWithLog(
      "DefaultPool",
      { from: deployer },
      "setAddresses",
      TroveManager.address,
      ActivePool.address,
      WStETHAddress
    );
  }
  console.log("DefaultPool is set");

  if (!(await isOwnershipRenounced(CollSurplusPool.address))) {
    console.log("Setting up CollSurplusPool...");

    await executeWithLog(
      "CollSurplusPool",
      { from: deployer },
      "setAddresses",
      BorrowerOperations.address,
      TroveManager.address,
      ActivePool.address,
      WStETHAddress
    );
  }
  console.log("CollSurplusPool is set");

  if (!(await isOwnershipRenounced(HintHelpers.address))) {
    console.log("Setting up HintHelpers...");

    await executeWithLog(
      "HintHelpers",
      { from: deployer },
      "setAddresses",
      SortedTroves.address,
      TroveManager.address
    );
  }
  console.log("HintHelpers is set");

  console.log("Core HOG contracts are set");
};
deploy.tags = ["main", "setCoreContracts"];
deploy.dependencies = [
  "PriceFeed",
  "SortedTroves",
  "TroveManager",
  "ActivePool",
  "DefaultPool",
  "GasPool",
  "StabilityPool",
  "CollSurplusPool",
  "BaseFeeLMAToken",
  "BorrowerOperations",
  "HOGToken",
  "HOGStaking",
  "CommunityIssuance",
  "HintHelpers",
];

export default deploy;
