import { ethers } from "hardhat";

export const ABCConfig = () => {
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

  const BobTroveIncreaseDebtSecond = "3000000";

  const CarolTroveColl = ethers.parseEther("3");
  const CarolTroveDebt = "4000000";
  const CarolInitialCR = 2500;
  const CarolTroveCollAfterLiquid = "3065768314496680000";
  const CarolTroveDebtAfterLiquid = 4644705;
  const CarolCRAfterLiquid = 1100;
  const CarolIncreaseDebt = "400000";
  const CarolRepayment = "100000";

  return {
    gasPrice010,
    AliceTroveColl,
    AliceTroveDebtWithError,
    AliceTroveDebt,
    AliceInitialCR,
    AliceDecreaseDebtFirst,
    AliceDebtAfterFirstDecrease,
    AliceCRAfterFirstDecrease,
    AliceTroveCollAfterBobRedemption,
    AliceTroveDebtAfterBobRedemption,
    AliceCRAfterBobRedemption,
    AliceRedemptionFirst,

    BobTroveColl,
    BobTroveDebt,
    BobInitialCR,
    BobUnstakeFirst,
    BobRedemptionFirst,
    BobTroveIncreaseCollFirst,
    BobTroveCollAfterIncrease,
    BobCRAfterIncrease,
    BobTroveCollAfterLuquid,
    BobTroveDebtAfterLuquid,
    BobCRAfterLiquid,
    BobTroveIncreaseDebtSecond,

    CarolTroveColl,
    CarolTroveDebt,
    CarolInitialCR,
    CarolTroveCollAfterLiquid,
    CarolTroveDebtAfterLiquid,
    CarolCRAfterLiquid,
    CarolIncreaseDebt,
    CarolRepayment,
  } as const;
};
