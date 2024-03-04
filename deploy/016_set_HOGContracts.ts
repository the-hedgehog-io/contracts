import { DeployFunction } from "hardhat-deploy/types";
import { createExecuteWithLog, isOwnershipRenounced } from "../deploy-helpers";
import { ethers } from "hardhat";
import { deployConfig } from "../deploy-helpers/deployConfig";

const deploy: DeployFunction = async ({
  deployments,
  getNamedAccounts,
  getChainId,
}) => {
  if ((await getChainId()) !== process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
    return;
  }
  const { deployer } = await getNamedAccounts();
  const executeWithLog = createExecuteWithLog(deployments.execute);
  const StabilityPool = await deployments.get("StabilityPool");
  const CommunityIssuance = await deployments.get("CommunityIssuance");
  const BaseFeeLMAToken = await deployments.get("BaseFeeLMAToken");
  const ActivePool = await deployments.get("ActivePool");
  const FeesRouter = await deployments.get("FeesRouter");
  const BorrowersOp = await deployments.get("BorrowerOperations");
  const TroveManager = await deployments.get("TroveManager");

  if ((await getChainId()) === process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
    if (!(await isOwnershipRenounced(CommunityIssuance.address))) {
      console.log("Setting up CommunityIssuance...");

      await executeWithLog(
        "CommunityIssuance",
        { from: deployer },
        "setAddresses",
        deployConfig.hogTokenAddress,
        StabilityPool.address,
        deployConfig.feesAdmin,
        deployConfig.feesSetter
      );
    }
    console.log("CommunityIssuance is set");
  }

  if ((await getChainId()) === process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
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
        BorrowersOp.address,
        TroveManager.address
      );
    }
  }

  if ((await getChainId()) === process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
    const feesRouter = await ethers.getContractAt(
      "FeesRouter",
      FeesRouter.address
    );
    for (let i = 0; i < 100; i = i + 5) {
      if ((await feesRouter.debtFeeConfigs(i)).addressA == ethers.ZeroAddress) {
        console.log("setting now % of ", i);
        await (
          await feesRouter.setFeeConfigs(
            i,
            100,
            0,
            0,
            deployer,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
        ).wait();
        console.log(i, " is set");
      }
    }

    console.log("Fees Router is set");
  }
};
deploy.tags = ["main", "updateHogTokenContracts"];
deploy.dependencies = [
  "StabilityPool",
  "HOGToken",
  "CommunityIssuance",
  "FeesRouter",
];

export default deploy;
