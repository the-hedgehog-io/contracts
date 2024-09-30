// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/**
 * @notice A fork of Liquity Math library with an upgraded pragma
 *
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 */

library LiquityMath {
    using SafeMath for uint;

    uint internal constant DECIMAL_PRECISION = 1e18;

    /* Precision for Nominal ICR (independent of price). Rationale for the value:
     *
     * - Making it “too high” could lead to overflows.
     * - Making it “too low” could lead to an ICR equal to zero, due to truncation from Solidity floor division.
     *
     * This value of 1e20 is chosen for safety: the NICR will only overflow for numerator > ~1e39 WStETH,
     * and will only truncate to 0 if the denominator is at least 1e20 times greater than the numerator.
     *
     */
    uint internal constant NICR_PRECISION = 1e20;

    function _min(uint _a, uint _b) internal pure returns (uint) {
        return (_a < _b) ? _a : _b;
    }

    function _max(uint _a, uint _b) internal pure returns (uint) {
        return (_a >= _b) ? _a : _b;
    }

    /*
     * Multiply two decimal numbers and use normal rounding rules:
     * -round product up if 19'th mantissa digit >= 5
     * -round product down if 19'th mantissa digit < 5
     *
     * Used only inside the exponentiation, _decPow().
     */
    function decMul(uint x, uint y) internal pure returns (uint decProd) {
        uint prod_xy = x.mul(y);

        decProd = prod_xy.add(DECIMAL_PRECISION / 2).div(DECIMAL_PRECISION);
    }

    /*
     * _decPow: Exponentiation function for 18-digit decimal base, and integer exponent n.
     *
     * Uses the efficient "exponentiation by squaring" algorithm. O(log(n)) complexity.
     *
     * Called by two functions that represent time in units of minutes:
     * 1) TroveManager._calcDecayedBaseRate
     * 2) CommunityIssuance._getCumulativeIssuanceFraction
     *
     * The exponent is capped to avoid reverting due to overflow. The cap 525600000 equals
     * "minutes in 1000 years": 60 * 24 * 365 * 1000
     *
     * If a period of > 1000 years is ever used as an exponent in either of the above functions, the result will be
     * negligibly different from just passing the cap, since:
     *
     * In function 1), the decayed base rate will be 0 for 1000 years or > 1000 years
     * In function 2), the difference in tokens issued at 1000 years and any time > 1000 years, will be negligible
     */
    function _decPow(uint _base, uint _minutes) internal pure returns (uint) {
        if (_minutes > 525600000) {
            _minutes = 525600000;
        } // cap to avoid overflow

        if (_minutes == 0) {
            return DECIMAL_PRECISION;
        }

        uint y = DECIMAL_PRECISION;
        uint x = _base;
        uint n = _minutes;

        // Exponentiation-by-squaring
        while (n > 1) {
            if (n % 2 == 0) {
                x = decMul(x, x);
                n = n.div(2);
            } else {
                // if (n % 2 != 0)
                y = decMul(x, y);
                x = decMul(x, x);
                n = (n.sub(1)).div(2);
            }
        }

        return decMul(x, y);
    }

    function _getAbsoluteDifference(
        uint _a,
        uint _b
    ) internal pure returns (uint) {
        return (_a >= _b) ? _a.sub(_b) : _b.sub(_a);
    }

    function _computeNominalCR(
        uint _coll,
        uint _debt
    ) internal pure returns (uint) {
        if (_debt > 0) {
            return _coll.mul(NICR_PRECISION).div(_debt);
        }
        // Return the maximal value for uint256 if the Trove has a debt of 0. Represents "infinite" CR.
        else {
            // if (_debt == 0)
            return 2 ** 256 - 1;
        }
    }

    /**
     * HEDGEHOG UPDATES:
     * Change coll ration calculation from [coll] * [price] / [debt] to
     * [coll] / [debt] / [gasPrice] * 1e36
     */
    function _computeCR(
        uint _coll,
        uint _debt,
        uint _price
    ) internal pure returns (uint) {
        if (_debt > 0) {
            uint newCollRatio = _coll
                .mul(DECIMAL_PRECISION)
                .div(_debt)
                .mul(DECIMAL_PRECISION)
                .div(_price);

            return newCollRatio;
        }
        // Return the maximal value for uint256 if the Trove has a debt of 0. Represents "infinite" CR.
        else {
            // if (_debt == 0)
            return 2 ** 256 - 1;
        }
    }

    function _findPriceBelowMCR(
        uint256 _coll,
        uint256 _debt,
        uint _mcr
    ) internal pure returns (uint256 price) {
        // Finds an exact price at which CR becomes MCR. Liqudation does not happen in the event of them being equal, hence we add 1 to it to find closest liqudation price
        price =
            ((((_coll * DECIMAL_PRECISION) / _debt) * DECIMAL_PRECISION) /
                _mcr) +
            1;
    }

    function _checkWithdrawlLimit(
        uint256 _lastWithdrawTimestamp,
        uint256 _expandDuration,
        uint256 _unusedWithdrawlLimit,
        uint256 _currentTotalColl
    ) internal view returns (uint256 fullLimit, uint256 singleTxWithdrawable) {
        uint256 DENOMINATOR = 100000;
        // First, we calculate how much time has passed since the last withdrawl
        uint256 minutesPassed = block.timestamp - _lastWithdrawTimestamp;

        // We calculate the percentage based on the time diff between last withdrawl and current moment
        uint256 percentageToGet = minutesPassed > _expandDuration
            ? DENOMINATOR
            : (minutesPassed * DENOMINATOR) / _expandDuration;

        // We calculate 75% of the current total coll
        uint256 totalCollBasedLimit = (_currentTotalColl * 3) / 4;

        // Now we calculate an amount that can be added based on the newest coll value
        uint256 additionFromNewColl;

        if (totalCollBasedLimit > _unusedWithdrawlLimit) {
            additionFromNewColl =
                ((totalCollBasedLimit - _unusedWithdrawlLimit) *
                    percentageToGet) /
                DENOMINATOR;
        }
        // Ultimately we get two values: Full withdrawl limit and an instant withdrawl limit which is 80% of the full one
        fullLimit = _unusedWithdrawlLimit + additionFromNewColl;

        singleTxWithdrawable = (fullLimit * 80) / 100;
    }
}
