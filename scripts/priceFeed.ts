import { ethers } from "hardhat";

const config = {
  admin: "0x796EcfBe7a2A424f9D905dfC38b8994aB2db9FD6",
  oracle: "0xD44f568C0ABf6Be814986CD40B35bAFF4c5FFCae",
};

async function main() {
  const priceFeed = await ethers.getContractAt(
    "PriceFeed",
    "0xE15fE01995312eD902B69d08fd7025cb3950dED5"
  );
  //   const oracle = await (
  //     await (
  //       await ethers.getContractFactory("BaseFeeOracle")
  //     ).deploy(config.admin, config.admin)
  //   ).waitForDeployment();

  const oracle = await ethers.getContractAt("BaseFeeOracle", config.oracle);

  console.log("Starting...");
  const block = await ethers.provider.getBlock("latest");
  console.log("Setting price first");
  await (await oracle.feedBaseFeeValue("29000000000", block!.number)).wait();
  const oracleAddress = await oracle.getAddress();
  const secondBlock = await ethers.provider.getBlock("latest");
  console.log("Setting price second");
  await (
    await oracle.feedBaseFeeValue("3000000000", secondBlock!.number)
  ).wait();

  console.log("Setting address: "),
    await priceFeed.setAddresses(oracleAddress, oracleAddress);

  console.log("Success");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
