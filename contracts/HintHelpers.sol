// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/ITroveManager.sol";
import "./interfaces/ISortedTroves.sol";
import "./dependencies/HedgehogBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";

contract HintHelpers is HedgehogBase, Ownable, CheckContract {
    string public constant NAME = "HintHelpers";

    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // --- Events ---

    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    // --- Dependency setters ---

    function setAddresses(
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    // --- Functions ---

    /* getRedemptionHints() - Helper function for finding the right hints to pass to redeemCollateral().
     *
     * It simulates a redemption of `_BaseFeeLMAamount` to figure out where the redemption sequence will start and what state the final Trove
     * of the sequence will end up in.
     *
     * Returns three hints:
     *  - `firstRedemptionHint` is the address of the first Trove with ICR >= MCR (i.e. the first Trove that will be redeemed).
     *  - `partialRedemptionHintNICR` is the final nominal ICR of the last Trove of the sequence after being hit by partial redemption,
     *     or zero in case of no partial redemption.
     *  - `truncatedBaseFeeLMAamount` is the maximum amount that can be redeemed out of the the provided `_BaseFeeLMAamount`. This can be lower than
     *    `_BaseFeeLMAamount` when redeeming the full amount would leave the last Trove of the redemption sequence with less net debt than the
     *    minimum allowed value (i.e. MIN_NET_DEBT).
     *
     * The number of Troves to consider for redemption can be capped by passing a non-zero value as `_maxIterations`, while passing zero
     * will leave it uncapped.
     */

    function getRedemptionHints(
        uint _BaseFeeLMAamount,
        uint _price,
        uint _maxIterations
    )
        external
        view
        returns (
            address firstRedemptionHint,
            uint partialRedemptionHintNICR,
            uint truncatedBaseFeeLMAamount
        )
    {
        ISortedTroves sortedTrovesCached = sortedTroves;

        uint remainingBaseFeeLMA = _BaseFeeLMAamount;
        address currentTroveuser = sortedTrovesCached.getLast();

        while (
            currentTroveuser != address(0) &&
            troveManager.getCurrentICR(currentTroveuser, _price) < MCR
        ) {
            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        firstRedemptionHint = currentTroveuser;

        if (_maxIterations == 0) {
            // Previous implementation: _maxIterations = uint(-1);
            // Updated since 8th pragma does not allow anymore
            _maxIterations = type(uint).max;
        }

        while (
            currentTroveuser != address(0) &&
            remainingBaseFeeLMA > 0 &&
            _maxIterations-- > 0
        ) {
            uint netBaseFeeLMADebt = _getNetDebt(
                troveManager.getTroveDebt(currentTroveuser) +
                troveManager.getPendingBaseFeeLMADebtReward(
                    currentTroveuser
                )
            );

            if (netBaseFeeLMADebt > remainingBaseFeeLMA) {
                if (netBaseFeeLMADebt > MIN_NET_DEBT) {
                    uint maxRedeemableBaseFeeLMA = LiquityMath._min(
                        remainingBaseFeeLMA,
                        netBaseFeeLMADebt - MIN_NET_DEBT
                    );

                    uint WStETH = troveManager
                        .getTroveColl(currentTroveuser) +
                        troveManager.getPendingWStETHReward(
                            currentTroveuser
                        );

                    // HEDGEHOG UPDATES: Change WStETHLOT calculations formula from [debtToBeRedeemed * price * 10e9] to [debtToBeRedeemed / price / DECIMAL_PRECISION]
                    uint newColl = 
                        WStETH -
                        maxRedeemableBaseFeeLMA * _price / DECIMAL_PRECISION;
                    uint newDebt = 
                        netBaseFeeLMADebt -
                        maxRedeemableBaseFeeLMA;

                    uint compositeDebt = _getCompositeDebt(newDebt);
                    partialRedemptionHintNICR = LiquityMath._computeNominalCR(
                        newColl,
                        compositeDebt
                    );

                    remainingBaseFeeLMA = 
                        remainingBaseFeeLMA -
                        maxRedeemableBaseFeeLMA;
                }
                break;
            } else {
                remainingBaseFeeLMA = 
                    remainingBaseFeeLMA -
                    netBaseFeeLMADebt;
            }

            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        truncatedBaseFeeLMAamount = _BaseFeeLMAamount - remainingBaseFeeLMA;
    }

    /* getApproxHint() - return address of a Trove that is, on average, (length / numTrials) positions away in the 
    sortedTroves list from the correct insert position of the Trove to be inserted. 
    
    Note: The output address is worst-case O(n) positions away from the correct insert position, however, the function 
    is probabilistic. Input can be tuned to guarantee results to a high degree of confidence, e.g:

    Submitting numTrials = k * sqrt(length), with k = 15 makes it very, very likely that the ouput address will 
    be <= sqrt(length) positions away from the correct insert position.
    */
    function getApproxHint(
        uint _CR,
        uint _numTrials,
        uint _inputRandomSeed
    )
        external
        view
        returns (address hintAddress, uint diff, uint latestRandomSeed)
    {
        uint arrayLength = troveManager.getTroveOwnersCount();

        if (arrayLength == 0) {
            return (address(0), 0, _inputRandomSeed);
        }

        hintAddress = sortedTroves.getLast();
        diff = LiquityMath._getAbsoluteDifference(
            _CR,
            troveManager.getNominalICR(hintAddress)
        );
        latestRandomSeed = _inputRandomSeed;

        uint i = 1;

        while (i < _numTrials) {
            latestRandomSeed = uint(
                keccak256(abi.encodePacked(latestRandomSeed))
            );

            uint arrayIndex = latestRandomSeed % arrayLength;
            address currentAddress = troveManager.getTroveFromTroveOwnersArray(
                arrayIndex
            );
            uint currentNICR = troveManager.getNominalICR(currentAddress);

            // check if abs(current - CR) > abs(closest - CR), and update closest if current is closer
            uint currentDiff = LiquityMath._getAbsoluteDifference(
                currentNICR,
                _CR
            );

            if (currentDiff < diff) {
                diff = currentDiff;
                hintAddress = currentAddress;
            }
            i++;
        }
    }

    function computeNominalCR(
        uint _coll,
        uint _debt
    ) external pure returns (uint) {
        return LiquityMath._computeNominalCR(_coll, _debt);
    }

    function computeCR(
        uint _coll,
        uint _debt,
        uint _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }
}
