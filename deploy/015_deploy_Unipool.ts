import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("Unipool", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "Unipool"];

export default deploy;
