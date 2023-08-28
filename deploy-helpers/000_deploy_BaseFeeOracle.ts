import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "./deployConfig";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  console.log("Starting deployment process...");
  const { deployer } = await getNamedAccounts();
  if (process.env.PK_DEPLOYER) {
    console.log("Deployer address is: ", deployer);

    if (
      deployer.toLowerCase() !==
      process.env.PUBLIC_ADDRESS_DEPLOYER?.toLowerCase()
    ) {
      throw Error(
        "Incorrect config: Deployer address is not aligned with provided private key"
      );
    }
  } else {
    throw Error("Incorrect config: Private key is not fed");
  }

  const { mainOracle, backupOracle } = deployConfig;

  await deploy("BaseFeeOracle", {
    from: deployer,
    log: true,
    args: [mainOracle, backupOracle],
  });
};

deploy.tags = ["main", "BaseFeeOracle"];

export default deploy;
