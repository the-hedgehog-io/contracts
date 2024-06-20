import { ethers } from "hardhat";

const config = {
  bo: "0x6227708902A66c560710D67cD131aBEF659B5b38",
};

async function main() {
  const bo = await ethers.getContractAt("BorrowerOperations", config.bo);
  const collToken = await ethers.getContractAt(
    "TERC20",
    "0xAEA6846622b68120490aC1FE078A1EcA9BBcC0af"
  );
  const coll = "7500000000000000000000";
  const debt = "50000000000000000000000000000";

  const tx = await bo.computeUnreliableCR(coll, debt);

  //await (await collToken.approve(bo.target, ethers.MaxUint256)).wait();
  await (
    await bo.openTrove(
      ethers.parseEther("1"),
      debt,
      coll,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    )
  ).wait();

  console.log("Success", ethers.formatEther(tx));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
