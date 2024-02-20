type DeploymentConfig = {
  uniswapV2Factory: string;
  wwstETH: string;
  bountyAddress: string;
  lpRewardsAddress: string;
  multisigAddress: string;
  mainOracle: string;
  backupOracle: string;
};

export const deployConfig: DeploymentConfig = {
  uniswapV2Factory: "0x8328e5dca628E50ccb25364B2694d9E29809CAd9", // 0x8328e5dca628E50ccb25364B2694d9E29809CAd9 mumbai
  wwstETH: "0x6C5f00F929F7fD51B4994401CB6222d7e30BbcB0",
  bountyAddress: "0x796EcfBe7a2A424f9D905dfC38b8994aB2db9FD6",
  lpRewardsAddress: "0x796EcfBe7a2A424f9D905dfC38b8994aB2db9FD6",
  multisigAddress: "0x796EcfBe7a2A424f9D905dfC38b8994aB2db9FD6",
  mainOracle: "0xb228c9C6c2243D11eD05b49Ad086bEbb09eF2DcA",
  backupOracle: "0xb228c9C6c2243D11eD05b49Ad086bEbb09eF2DcA",
};
