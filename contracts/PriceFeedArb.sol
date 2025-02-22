// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./PriceFeed.sol";

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

contract PriceFeedArb is PriceFeed {

    ArbSys constant arbsys = ArbSys(address(100));

    constructor() PriceFeed(1600) {
    }

    function _badMainOracleResponse(
        Response memory _response
    ) internal override view returns (bool) {
        // Check for an invalid roundId that is 0
        if (_response.roundId == 0) {
            return true;
        }
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        // Check for an invalid timeStamp that is 0, or in the future
        if (
            _response.blockNumber == 0 ||
            _response.blockNumber > arbsys.arbBlockNumber()
        ) {
            return true;
        }
        // Check for non-positive price
        if (_response.answer <= 0) {
            return true;
        }

        return false;
    }

    function _mainOracleIsFrozen(
        Response memory _response
    ) internal override view returns (bool) {
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        return (arbsys.arbBlockNumber() - _response.blockNumber) > TIMEOUT;
    }

    function _backupOracleIsBroken(
        Response memory _response
    ) internal override view returns (bool) {
        // Check for an invalid roundId that is 0
        if (_response.roundId == 0) {
            return true;
        }
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        // Check for an invalid roundId that is 0
        if (_response.roundId == 0) {
            return true;
        }
        // Check for an invalid timeStamp that is 0, or in the future
        if (
            _response.blockNumber == 0 ||
            _response.blockNumber > arbsys.arbBlockNumber()
        ) {
            return true;
        }
        // Check for zero price
        if (_response.answer <= 0) {
            return true;
        }

        return false;
    }

    function _backupIsFrozen(
        Response memory _backupResponse
    ) internal override view returns (bool) {
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        return arbsys.arbBlockNumber() - _backupResponse.blockNumber > TIMEOUT;
    }
}
