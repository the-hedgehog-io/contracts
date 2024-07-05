type DeploymentConfig = {
  wstETH: string;
  multisigAddress: string;
  mainOracle: string;
  backupOracle: string;
  hogTokenAddress: string;
  bootstrapDaysAmount: number;
  feesSetter: string;
  feesAdmin: string;
};

// Arbitrum Mainnet Deployment Config
export const deployConfig: DeploymentConfig = {
  wstETH: "0x68328F45Ca73f26666520b8027aaA30c014D17c6", // Arb wstEth address: https://arbiscan.io/token/0x5979d7b546e38e414f7e9822514be443a4800529
  multisigAddress: "0x737Ae8D15E381E47979CF8882446196E07b1c941", // Protocol's multisig that receives all HOG tokens on deployment https://app.safe.global/home?safe=eth:0x720e0a01069722DBa720B800FF2a9bd6d607effF
  mainOracle: "0x4eb6FC083d36d1986fbD75960C9796E019fAF9b1", // To be deployed prior to protocol's deployment
  backupOracle: "0x1ca0bADcf3Ecf5cd7BB02A5D3b09Ba077535369e", // To be deployed prior to protocol's deployment
  hogTokenAddress: "0xAcaEFC87Fcd11631BAacDE0284cE06De9f9B4982", // To be deployed prior to protocol's deployment
  bootstrapDaysAmount: 0,
  feesSetter: "0x737Ae8D15E381E47979CF8882446196E07b1c941", // https://app.safe.global/home?safe=arb1:0x93Dc8f1AC887BA1A69Cc2fCa324740D38aB24E8C
  feesAdmin: "0x737Ae8D15E381E47979CF8882446196E07b1c941", // https://app.safe.global/home?safe=arb1:0x77cED5FaA9873F2fBD4c5D3B202F1CcAfDE272F2
};
