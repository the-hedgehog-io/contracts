type DeploymentConfig = {
  wstETH: string;
  multisigAddress: string;
  mainOracle: string;
  backupOracle: string;
  gasComp: string;
  minNetDebt: string;
};

export const deployConfig: DeploymentConfig = {
  wstETH: "0xb64A7db2a81d2B579d61528Bc4d5F662014B3020",
  multisigAddress: "0x3BFc9CA7FA5D94461Dc96225D88CBb300B108d9E",
  mainOracle: "0x05e9E631a506c1329B45A91BCAc7D5C0Ba76AB05",
  backupOracle: "0xD7be32A18f2d5F281708228FE01b34d8039Ef35E",
  gasComp: "100000",
  minNetDebt: "100000",
};
