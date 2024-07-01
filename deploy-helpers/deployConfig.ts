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
  wstETH: "0xD7be32A18f2d5F281708228FE01b34d8039Ef35E", // Arb wstEth address: https://arbiscan.io/token/0x5979d7b546e38e414f7e9822514be443a4800529
  multisigAddress: "0x3BFc9CA7FA5D94461Dc96225D88CBb300B108d9E", // Protocol's multisig that receives all HOG tokens on deployment https://app.safe.global/home?safe=eth:0x720e0a01069722DBa720B800FF2a9bd6d607effF
  mainOracle: "0x25eab32920A9E4b5a6403502D176E7ac5BB3314F", // To be deployed prior to protocol's deployment
  backupOracle: "0xd366322ca004d007490b7457945BA2131DaBcd34", // To be deployed prior to protocol's deployment
  hogTokenAddress: "0x406F895640ca663d4f5C0f2A18cd8074C1626472", // To be deployed prior to protocol's deployment
  bootstrapDaysAmount: 0,
  feesSetter: "0x3BFc9CA7FA5D94461Dc96225D88CBb300B108d9E", // https://app.safe.global/home?safe=arb1:0x93Dc8f1AC887BA1A69Cc2fCa324740D38aB24E8C
  feesAdmin: "0x3BFc9CA7FA5D94461Dc96225D88CBb300B108d9E", // https://app.safe.global/home?safe=arb1:0x77cED5FaA9873F2fBD4c5D3B202F1CcAfDE272F2
};
