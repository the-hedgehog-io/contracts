import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

export const setupContracts = async () => {
  const [deployer] = await ethers.getSigners();

  const priceFeed = await (
    await (await ethers.getContractFactory("PriceFeed")).deploy()
  ).waitForDeployment();

  const sortedTroves = await (
    await (await ethers.getContractFactory("SortedTroves")).deploy()
  ).waitForDeployment();

  const troveManager = await (
    await (await ethers.getContractFactory("TroveManager")).deploy()
  ).waitForDeployment();

  const activePool = await (
    await (await ethers.getContractFactory("ActivePool")).deploy()
  ).waitForDeployment();

  const stabilityPool = await (
    await (await ethers.getContractFactory("StabilityPool")).deploy()
  ).waitForDeployment();

  const defaultPool = await (
    await (await ethers.getContractFactory("DefaultPool")).deploy()
  ).waitForDeployment();

  const gasPool = await (
    await (await ethers.getContractFactory("GasPool")).deploy()
  ).waitForDeployment();

  const collSurplusPool = await (
    await (await ethers.getContractFactory("CollSurplusPool")).deploy()
  ).waitForDeployment();

  const borrowerOperations = await (
    await (await ethers.getContractFactory("BorrowerOperations")).deploy()
  ).waitForDeployment();

  const hintHelpers = await (
    await (await ethers.getContractFactory("HintHelpers")).deploy()
  ).waitForDeployment();

  const baseFeeLMAToken = await (
    await (
      await ethers.getContractFactory("BaseFeeLMAToken")
    ).deploy(
      await troveManager.getAddress(),
      await stabilityPool.getAddress(),
      await borrowerOperations.getAddress()
    )
  ).waitForDeployment();

  const communityIssuance = await (
    await (await ethers.getContractFactory("CommunityIssuance")).deploy()
  ).waitForDeployment();

  const hogStaking = await (
    await (await ethers.getContractFactory("HogStaking")).deploy()
  ).waitForDeployment();

  const lockupContractFactory = await (
    await (await ethers.getContractFactory("LockupContractFactory")).deploy()
  ).waitForDeployment();

  const hogToken = await (
    await (
      await ethers.getContractFactory("HOGToken")
    ).deploy(
      await communityIssuance.getAddress(),
      await hogStaking.getAddress(),
      await lockupContractFactory.getAddress(),
      deployer.address,
      deployer.address, // TODO: Probably have to edit these addresses
      deployer.address
    )
  ).waitForDeployment();

  const maxBytes32 = "0x" + "f".repeat(64);

  await sortedTroves.setParams(
    maxBytes32,
    await troveManager.getAddress(),
    await borrowerOperations.getAddress()
  );

  await troveManager.setAddresses(
    await borrowerOperations.getAddress(),
    await activePool.getAddress(),
    await defaultPool.getAddress(),
    await stabilityPool.getAddress(),
    await gasPool.getAddress(),
    await collSurplusPool.getAddress(),
    await priceFeed.getAddress(),
    await baseFeeLMAToken.getAddress(),
    await sortedTroves.getAddress(),
    await hogToken.getAddress(),
    await hogStaking.getAddress()
  );

  await borrowerOperations.setAddresses(
    await troveManager.getAddress(),
    await activePool.getAddress(),
    await defaultPool.getAddress(),
    await stabilityPool.getAddress(),
    await gasPool.getAddress(),
    await collSurplusPool.getAddress(),
    await priceFeed.getAddress(),
    await sortedTroves.getAddress(),
    await baseFeeLMAToken.getAddress(),
    await hogStaking.getAddress()
  );

  await stabilityPool.setAddresses(
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
    await activePool.getAddress(),
    await baseFeeLMAToken.getAddress(),
    await sortedTroves.getAddress(),
    await priceFeed.getAddress(),
    await communityIssuance.getAddress()
  );

  await activePool.setAddresses(
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
    await stabilityPool.getAddress(),
    await defaultPool.getAddress()
  );

  await defaultPool.setAddresses(
    await troveManager.getAddress(),
    await activePool.getAddress()
  );

  await collSurplusPool.setAddresses(
    await borrowerOperations.getAddress(),
    await troveManager.getAddress(),
    await activePool.getAddress()
  );

  await hintHelpers.setAddresses(
    await sortedTroves.getAddress(),
    await troveManager.getAddress()
  );

  await lockupContractFactory.setHOGTokenAddress(await hogToken.getAddress());

  await communityIssuance.setAddresses(
    await hogToken.getAddress(),
    await stabilityPool.getAddress()
  );

  return [
    priceFeed,
    sortedTroves,
    troveManager,
    activePool,
    stabilityPool,
    defaultPool,
    gasPool,
    collSurplusPool,
    borrowerOperations,
    hintHelpers,
    baseFeeLMAToken,
    communityIssuance,
    hogStaking,
    lockupContractFactory,
    hogToken,
  ];
};

export const etheredValue = (value: string | number) => {
  return ethers.parseEther(
    typeof value === "number" ? value.toString() : value
  );
};
