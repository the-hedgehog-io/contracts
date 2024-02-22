import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();

  await deploy("CommunityIssuance", {
    from: deployer,
    log: true,
  });
};

deploy.tags = ["main", "CommunityIssuance"];

export default deploy;
