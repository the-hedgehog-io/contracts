import { ethers } from "hardhat";

const ABCConfig = () => {
  const gasPrice010 = 30;

  const AliceTroveColl = ethers.parseEther("0.35");
  const AliceTroveDebtWithError = "100000000";
  const AliceTroveDebt = "7000000";
  const AliceInitialCR = 167;
  const AliceDecreaseDebtFirst = "2000000";
  const AliceDebtAfterFirstDecrease = "5000000";
  const AliceCRAfterFirstDecrease = 233;
  // TODO: Stopped on H21
  const AliceRedemptionFirst = "4915000";

  const BobTroveColl = ethers.parseEther("2");
  const BobTroveDebt = "5000000";
  const BobInitialCR = 1333;
  const BobUnstakeFirst = "560000";
  const BobRedemptionFirst = "560000";
  const BobTroveIncreaseCollFirst = ethers.parseEther("0.00167");
  const BobTroveIncreaseDebtSecond = "3000000";

  const CarolTroveColl = ethers.parseEther("3");
  const CarolTroveDebt = "4000000";
  const CarolIncreaseDebt = "400000";
  const CarolRepayment = "100000";
};
