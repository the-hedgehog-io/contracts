import { DeployFunction } from "hardhat-deploy/types";
import { createExecuteWithLog, isOwnershipRenounced } from "../deploy-helpers";
import { deployConfig } from "../deploy-helpers/deployConfig";
import { ethers } from "hardhat";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);
  const StabilityPool = await deployments.get("StabilityPool");
  const HOGToken = await deployments.get("HOGToken");
  const HOGStaking = await deployments.get("HOGStaking");
  const CommunityIssuance = await deployments.get("CommunityIssuance");
  const BaseFeeLMAToken = await deployments.get("BaseFeeLMAToken");
  const TroveManager = await deployments.get("TroveManager");
  const BorrowerOperations = await deployments.get("BorrowerOperations");
  const ActivePool = await deployments.get("ActivePool");
  const FeesRouter = await deployments.get("FeesRouter");
  const { wwstETH: WStETHAddress } = deployConfig;

  if (!(await isOwnershipRenounced(HOGStaking.address))) {
    console.log("Setting up HOGStaking...");

    await executeWithLog(
      "HOGStaking",
      { from: deployer },
      "setAddresses",
      HOGToken.address,
      BaseFeeLMAToken.address,
      TroveManager.address,
      BorrowerOperations.address,
      ActivePool.address,
      WStETHAddress,
      FeesRouter.address
    );
  }
  console.log("HOGStaking is set");

  if (!(await isOwnershipRenounced(CommunityIssuance.address))) {
    console.log("Setting up CommunityIssuance...");

    await executeWithLog(
      "CommunityIssuance",
      { from: deployer },
      "setAddresses",
      HOGToken.address,
      StabilityPool.address
    );
  }
  console.log("CommunityIssuance is set");

  console.log("Setting Fees Router...");

  const feesRouter = await ethers.getContractAt(
    "FeesRouter",
    FeesRouter.address
  );

  if ((await feesRouter.debtFeeConfigs(0)).addressA == ethers.ZeroAddress) {
    await executeWithLog(
      "FeesRouter",
      { from: deployer },
      "setAddresses",
      ActivePool.address,
      BaseFeeLMAToken.address,
      HOGStaking.address
    );
  }

  for (let i = 0; i < 100; i = i + 5) {
    if ((await feesRouter.debtFeeConfigs(i)).addressA == ethers.ZeroAddress) {
      console.log("setting now % of ", i);
      await (
        await feesRouter.setFeeConfigs(
          i,
          100,
          0,
          0,
          HOGStaking.address,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).wait();
      console.log(i, " is set");
    }
  }

  console.log("Fees Router is set");

  console.log("HOG Token Contracts are set");
};
deploy.tags = ["main", "updateHogTokenContracts"];
deploy.dependencies = [
  "StabilityPool",
  "HOGToken",
  "CommunityIssuance",
  "FeesRouter",
];

export default deploy;
