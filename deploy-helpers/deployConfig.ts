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
  wstETH: "0xAEA6846622b68120490aC1FE078A1EcA9BBcC0af", // Arb wstEth address: https://arbiscan.io/token/0x5979d7b546e38e414f7e9822514be443a4800529
  multisigAddress: "0x20CCd22C0Cb18F6fbEDCC08aC93E9787c1e98a89", // Protocol's multisig that receives all HOG tokens on deployment https://app.safe.global/home?safe=eth:0x720e0a01069722DBa720B800FF2a9bd6d607effF
  mainOracle: "0x5071Fa4Ab4870d970aD6d22A020774ad6a9F6C72", // To be deployed prior to protocol's deployment
  backupOracle: "0xdFaE403Fd82e9eD37F57240F957f7f8B6FE9aB26", // To be deployed prior to protocol's deployment
  hogTokenAddress: "0xadec2418d1F7FEfB0B8528941C87580FCb9cf5dA", // To be deployed prior to protocol's deployment
  bootstrapDaysAmount: 0,
  feesSetter: "0x20CCd22C0Cb18F6fbEDCC08aC93E9787c1e98a89", // https://app.safe.global/home?safe=arb1:0x93Dc8f1AC887BA1A69Cc2fCa324740D38aB24E8C
  feesAdmin: "0x20CCd22C0Cb18F6fbEDCC08aC93E9787c1e98a89", // https://app.safe.global/home?safe=arb1:0x77cED5FaA9873F2fBD4c5D3B202F1CcAfDE272F2
};
