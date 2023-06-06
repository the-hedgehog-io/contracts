import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const deploy: DeployFunction = async ({
  deployments: { deploy },
  getNamedAccounts,
}) => {
  console.log("Starting deployment process...");
  const { deployer } = await getNamedAccounts();
  if (process.env.PK_DEPLOYER) {
    console.log("Deployer address is: ", deployer);

    if (deployer !== process.env.PUBLIC_ADDRESS_DEPLOYER) {
      throw Error(
        "Incorrect config: Deployer address is not aligned with provided private key"
      );
    }
  } else {
    throw Error("Incorrect config: Private key is not fed");
  }

  await deploy("BaseFeeOracle", {
    from: deployer,
    log: true,
    args: [
      "0xab72010e190256437eca08740212082ccfa14e18",
      "0xab72010e190256437eca08740212082ccfa14e18",
    ],
  });
};

deploy.tags = ["main", "BaseOracle"];

export default deploy;
