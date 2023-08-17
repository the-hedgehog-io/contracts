import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("HintHelpers", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "HintHelpers"];

export default deploy;
