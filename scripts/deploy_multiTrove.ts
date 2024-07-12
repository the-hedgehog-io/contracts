import { ethers } from "hardhat";

const config = {
  troveManager: "0x638BB2882987f0cA6Bcc254Fbc0ECd386f454be5",
  sortedTroves: "0xD1Df2Fd1c38D4c537AA7eE197643A7a3fA54b57a",
};

async function main() {
  const getter = await ethers.getContractFactory("MultiTroveGetter");

  console.log("Starting...");
  await (
    await getter.deploy(config.troveManager, config.sortedTroves)
  ).waitForDeployment();

  // console.log("Setting address: "),
  //   await priceFeed.setAddresses(oracleAddress, oracleAddress);

  console.log("Success");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
