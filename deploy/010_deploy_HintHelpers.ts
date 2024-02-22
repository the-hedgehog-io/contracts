import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "../deploy-helpers/deployConfig";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("HintHelpers", {
    from: deployer,
    log: true,
    args: [deployConfig.gasComp, deployConfig.minNetDebt],
  });
};

deploy.tags = ["main", "HintHelpers"];

export default deploy;
