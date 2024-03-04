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

  await deploy("FeesRouter", {
    from: deployer,
    log: true,
    args: [deployConfig.feesSetter, deployConfig.feesAdmin],
  });
};

deploy.tags = ["main", "FeesRouter"];

export default deploy;
