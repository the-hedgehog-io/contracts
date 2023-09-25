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
  const AliceTroveCollAfterBobRedemption = ethers.parseEther("0.332"); //TODO: Probably to exact enough
  const AliceTroveDebtAfterBobRedemption = 4440000;
  const AliceCRAfterBobRedemption = 250;
  const AliceRedemptionFirst = "4915000";

  const BobTroveColl = ethers.parseEther("2");
  const BobTroveDebt = "5000000";
  const BobInitialCR = 1333;
  const BobUnstakeFirst = "560000";
  const BobRedemptionFirst = "560000";
  const BobTroveIncreaseCollFirst = "16663244859813100";
  const BobTroveCollAfterIncrease = "2016663244859810000";
  const BobCRAfterIncrease = 672;
  const BobTroveCollAfterLuquid = "2059754172045110000";
  const BobTroveDebtAfterLuquid = "5805881";
  const BobCRAfterLiquid = 591;
  // TODO: Stopped on I37. Update Carol's variables

  const BobTroveIncreaseDebtSecond = "3000000";

  const CarolTroveColl = ethers.parseEther("3");
  const CarolTroveDebt = "4000000";
  const CarolInitialCR = 2500;
  const CarolIncreaseDebt = "400000";
  const CarolRepayment = "100000";
};
