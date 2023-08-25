import { DeployFunction } from "hardhat-deploy/types";
import { deployConfig } from "./deployConfig";

const deploy: DeployFunction = async ({
  deployments: { deploy, get },
  getNamedAccounts,
}) => {
  const { deployer } = await getNamedAccounts();
  const CommunityIssuance = await get("CommunityIssuance");
  const HogStaking = await get("HOGStaking");
  const LockupContractFactory = await get("LockupContractFactory");

  const { bountyAddress, lpRewardsAddress, multisigAddress } = deployConfig;

  // TODO: Add proper HOG token params
  await deploy("HOGToken", {
    from: deployer,
    log: true,
    args: [
      CommunityIssuance.address,
      HogStaking.address,
      LockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress,
    ],
  });
};

deploy.tags = ["main", "HOGToken"];

export default deploy;
