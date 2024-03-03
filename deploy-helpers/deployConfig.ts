type DeploymentConfig = {
  wstETH: string;
  multisigAddress: string;
  mainOracle: string;
  backupOracle: string;
  gasComp: string;
  minNetDebt: string;
  hogTokenAddress: string;
  CCR: string;
  bootstrapDaysAmount: number;
};

// Arbitrum Mainnet Deployment Config
export const deployConfig: DeploymentConfig = {
  wstETH: "0x5979D7b546E38E414F7E9822514be443A4800529", // Arb wstEth address: https://arbiscan.io/token/0x5979d7b546e38e414f7e9822514be443a4800529
  multisigAddress: "0x6Ee0C7f637C8B0e223886559Fee4c3b9d90388f1", // Protocol's multisig that receives all HOG tokens on deployment
  mainOracle: "", // To be deployed prior to protocol's deployment
  backupOracle: "", // To be deployed prior to protocol's deployment
  gasComp: "100000",
  minNetDebt: "100000",
  hogTokenAddress: "", // To be deployed prior to protocol's deployment
  CCR: "2000000000000000000",
  bootstrapDaysAmount: 14,
};
