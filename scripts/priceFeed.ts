import { ethers } from "hardhat";

const config = {
  admin: "0x5071Fa4Ab4870d970aD6d22A020774ad6a9F6C72",
  oracle: "0x5071Fa4Ab4870d970aD6d22A020774ad6a9F6C72",
  oracle2: "0xdFaE403Fd82e9eD37F57240F957f7f8B6FE9aB26",
};

async function main() {
  const oracle = await ethers.getContractAt("BaseFeeOracle", config.oracle);
  const oracle2 = await ethers.getContractAt("BaseFeeOracle", config.oracle2);
  const value = "27543210000";

  console.log("Starting...");
  const block = await ethers.provider.getBlock("latest");
  console.log("Setting price first", block?.number);
  await (await oracle.feedBaseFeeValue(value, block!.number)).wait();
  const oracleAddress = await oracle.getAddress();
  const secondBlock = await ethers.provider.getBlock("latest");
  console.log("Setting price second");
  await (await oracle2.feedBaseFeeValue(value, secondBlock!.number)).wait();

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
