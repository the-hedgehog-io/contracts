import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("BorrowerOperations", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "BorrowerOperations"];

export default deploy;
