import { TroveManager } from "../../../../typechain-types";
import { expect } from "chai";

export const checkCorrectness = async ({
  troveManager,
}: {
  troveManager: TroveManager;
}) => {
  const checkCollDebtCorrectness = async ({
    expectedColl,
    expectedDebt,
  }: {
    expectedColl: bigint;
    expectedDebt: bigint;
  }): Promise<void> => {
    const coll = await troveManager.getEntireSystemColl();
    const debt = await troveManager.getEntireSystemDebt();

    expect(coll).to.be.equal(expectedColl);
    expect(debt).to.be.equal(expectedDebt);
  };
  return { checkCollDebtCorrectness };
};
