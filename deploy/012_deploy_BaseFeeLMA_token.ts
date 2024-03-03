import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy, get },
  getNamedAccounts,
  getChainId,
}) => {
  if ((await getChainId()) != process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
    // Protocol may only be deployed on the Arbitrum mainnet (chainId: 42161)
    return;
  }
  const { deployer } = await getNamedAccounts();
  const TroveManager = await get("TroveManager");
  const StabilityPool = await get("StabilityPool");
  const BorrowerOperations = await get("BorrowerOperations");
  const FeesRouter = await get("FeesRouter");

  await deploy("BaseFeeLMAToken", {
    from: deployer,
    log: true,
    args: [
      TroveManager.address,
      StabilityPool.address,
      BorrowerOperations.address,
      FeesRouter.address,
    ],
  });
};

deploy.tags = ["main", "BaseFeeLMAToken"];

export default deploy;
