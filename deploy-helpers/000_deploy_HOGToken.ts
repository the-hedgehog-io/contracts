import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "../deploy-helpers/deployConfig";

// Protocol's Token is deployed before the rest of the protocol

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
  getChainId,
}) => {
  if ((await getChainId()) != "1") {
    // Hog token may only be deployed on the mainnet
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
