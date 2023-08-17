import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("GasPool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "GasPool"];

export default deploy;
