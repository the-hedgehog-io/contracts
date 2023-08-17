import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("UniswapPair", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "UniswapPair"];

export default deploy;
