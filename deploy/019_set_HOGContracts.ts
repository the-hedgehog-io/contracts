import { DeployFunction } from "hardhat-deploy/types";
import { createExecuteWithLog, isOwnershipRenounced } from "../deploy-helpers";

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);
  const StabilityPool = await deployments.get("StabilityPool");
  const HOGToken = await deployments.get("HOGToken");
  const CommunityIssuance = await deployments.get("CommunityIssuance");
  const LockupContractFactory = await deployments.get("LockupContractFactory");

  if (!(await isOwnershipRenounced(LockupContractFactory.address))) {
    console.log("Setting up HOGStaking...");

    await executeWithLog(
      "LockupContractFactory",
      { from: deployer },
      "setHOGTokenAddress",
      HOGToken.address
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

  console.log("HOG Token Contracts are set");
};
deploy.tags = ["main", "updateHogTokenContracts"];
deploy.dependencies = [
  "StabilityPool",
  "HOGToken",
  "CommunityIssuance",
  "LockupContractFactory",
];

export default deploy;
