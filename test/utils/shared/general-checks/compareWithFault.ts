import { expect } from "chai";

export const validateCollDebtMatch = async () => {
  const compareWithFault = (
    arg1: bigint | number,
    arg2: bigint | number,
    faultScale = 100000
  ) => {
    expect(arg1).to.be.lessThanOrEqual(
      BigInt(arg2) / BigInt(faultScale) + BigInt(arg2)
    );

    expect(arg1).to.be.greaterThanOrEqual(
      BigInt(arg2) / BigInt(faultScale) - BigInt(arg2)
    );
  };
  return { compareWithFault };
};
