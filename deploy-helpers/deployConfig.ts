type DeploymentConfig = {
  wstETH: string;
  multisigAddress: string;
  mainOracle: string;
  backupOracle: string;
  gasComp: string;
  minNetDebt: string;
  hogTokenAddress: string;
};

// Arbitrum Mainnet Config
export const deployConfig: DeploymentConfig = {
  wstETH: "0x5979D7b546E38E414F7E9822514be443A4800529",
  multisigAddress: "",
  mainOracle: "", // To be deployed prior to protocol's deployment
  backupOracle: "", // To be deployed prior to protocol's deployment
  gasComp: "100000",
  minNetDebt: "100000",
  hogTokenAddress: "", // To be deployed prior to protocol's deployment
};
