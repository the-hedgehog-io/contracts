// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface BOps {
    function openTrove(
        uint _maxFeePercentage,
        uint _BaseFeeLMAAmount,
        uint _collAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    function addColl(
        address _upperHint,
        address _lowerHint,
        uint _amount
    ) external;

    function withdrawColl(
        uint _collWithdrawal,
        address _upperHint,
        address _lowerHint
    ) external;
}

interface TM {
    function redeemCollateral(
        uint _BaseFeeLMAamount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR,
        uint _maxIterations,
        uint _maxFeePercentage
    ) external;
}

contract SingleTxCaller {
    function justAddCollateral(
        address _bo,
        address _payToken
    ) public {
        IERC20(_payToken).approve(_bo, 9000000000000000000000);
        BOps(_bo).openTrove(
            1e18,
            350000000000000000000000000,
            9000000000000000000000,
            address(0),
            address(0)
        );
    }

    function singleTx(
        uint256 _coll,
        address _bo,
        address _tm,
        address _payToken,
        address _debtToken,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR
    ) public {
        IERC20(_payToken).approve(_bo, 9000000000000000000000);
        IERC20(_debtToken).approve(_tm, 44000);
        BOps(_bo).addColl(
            address(0),
            address(0),
            9000000000000000000000
        );

        BOps(_bo).withdrawColl(1, address(0), address(0));
    }

    function redeemColl(address _bo) public {
        BOps(_bo).withdrawColl(1, address(0), address(0));
    }
}
