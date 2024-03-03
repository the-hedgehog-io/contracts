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

  await deploy("HintHelpers", {
    from: deployer,
    log: true,
    args: [deployConfig.gasComp, deployConfig.minNetDebt, deployConfig.CCR],
  });
};

deploy.tags = ["main", "HintHelpers"];

export default deploy;
