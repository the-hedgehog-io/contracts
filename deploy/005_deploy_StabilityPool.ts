import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "../deploy-helpers/deployConfig";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
  getChainId,
}) => {
  if ((await getChainId()) != process.env.DEPLOYMENT_PROTOCOL_CHAIN_ID) {
    // Protocol may only be deployed on the Arbitrum mainnet (chainId: 42161)
    return;
  }
  const { deployer } = await getNamedAccounts();

  await deploy("StabilityPool", {
    from: deployer,
    log: true,
    args: [],
  });
};

deploy.tags = ["main", "StabilityPool"];

export default deploy;
