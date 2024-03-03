import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "../deploy-helpers/deployConfig";

// Protocol's Token is deployed before the rest of the protocol

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
  getChainId,
}) => {
  if ((await getChainId()) != process.env.DEPLOYMENT_PROTOCOL_TOKEN_CHAIN_ID) {
    // Hog token may only be deployed on the Ethereum Mainnet (chainId: 1)
    return;
  }
  const { deployer } = await getNamedAccounts();

  const { multisigAddress } = deployConfig;

  await deploy("HOGToken", {
    from: deployer,
    log: true,
    args: [multisigAddress],
  });
};

deploy.tags = ["main", "HOGToken"];

export default deploy;
