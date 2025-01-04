// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./interfaces/IBaseFeeOracle.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./dependencies/BaseMath.sol";
import "./dependencies/LiquityMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error MainOracleDisabled();

interface ArbSys {
    function arbBlockNumber() external view returns (uint256);
}

/*
 * PriceFeed for production deployment, to be connected to Main Oracle's live BaseFee:WstETH aggregator reference
 * contract, and a Backup oracle contract.
 *
 * The PriceFeed uses "Main Oracle" as primary oracle, and "Back Up" as fallback. It contains logic for
 * switching oracles based on oracle failures, timeouts, and conditions for returning to the primary
 * "Main Oracle" oracle.
 *
 * Based on Liquity Protocol.
 */
contract PriceFeedArb is Ownable, BaseMath {
    string public constant NAME = "PriceFeed";

    IBaseFeeOracle public mainOracle; // Main Oracle aggregator
    IBaseFeeOracle public backupOracle; // Backup Oracle

    uint public constant TARGET_DIGITS = 18;

    // Maximum time period allowed since Main Oracle's latest round data blockNumber, beyond which Main Oracle is considered frozen.
    uint public constant TIMEOUT = 1600;

    // HEDGEHOG UPDATES: decrease to 176
    // Maximum deviation allowed between two consecutive Main oracle prices. Hedgehog oracles are getting updated in case there is a 5% diviation price
    // Meaning that there might be max 17.5% price diviation between rounds
    uint public constant MAX_PRICE_DEVIATION_PERCENTAGE_FROM_PREVIOUS_ROUND =
        176;

    /*
     * The maximum relative price difference between two oracle responses allowed in order for the PriceFeed
     * to return to using the Main oracle. 18-digit precision.
     */
    uint public constant MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES = 5e16; // 5%

    // The last good price seen from an oracle by Hedgehog
    uint256 public lastGoodPrice;

    ArbSys constant arbsys = ArbSys(address(100));

    struct Response {
        int256 answer;
        uint64 blockNumber;
        uint256 roundId;
    }

    enum Status {
        mainOracleWorking,
        usingBackupMainUntrusted,
        bothOraclesUntrusted,
        usingBackupMainFrozen,
        usingMainBackupUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

    // --- Dependency setters ---

    function setAddresses(
        address _mainOracleAddress,
        address _backupOracleAddress
    ) external onlyOwner {
        Address.isContract(_mainOracleAddress);
        Address.isContract(_backupOracleAddress);

        mainOracle = IBaseFeeOracle(_mainOracleAddress);
        backupOracle = IBaseFeeOracle(_backupOracleAddress);

        // Explicitly set initial system status
        status = Status.mainOracleWorking;

        // Get an initial price from Main Oracle to serve as first reference for lastGoodPrice
        Response memory mainOracleResponse = _getCurrentMainOracleResponse();
        Response memory prevMainOracleResponse = _getPrevOracleResponse(
            mainOracleResponse.roundId
        );

        if (
            _mainOracleIsBroken(mainOracleResponse, prevMainOracleResponse) ||
            _mainOracleIsFrozen(mainOracleResponse)
        ) {
            revert MainOracleDisabled();
        }

        _storeGoodPrice(mainOracleResponse, mainOracle.decimals());

        renounceOwnership();
    }

    // --- Functions ---

    /*
     * fetchPrice():
     * Returns the latest price obtained from the Oracle. Called by Hedgehog functions that require a current price.
     *
     * Also callable by anyone externally.
     *
     * Non-view function - it stores the last good price seen by Hedgehog.
     *
     * Uses a main oracle and a fallback oracle in case main one fails. If both fail,
     * it uses the last good price seen by Hedgehog.
     *
     * Hedgehog updates: now both oracles are not allowed to have a price diviation of more then 12.5% between consecutive block
     */
    function fetchPrice() external returns (uint256) {
        // Get current and previous price data from Main oracle, and current price data from Backup
        uint8 decimals = mainOracle.decimals();

        Response memory mainOracleResponse = _getCurrentMainOracleResponse();
        Response memory prevMainOracleResponse = _getPrevOracleResponse(
            mainOracleResponse.roundId
        );
        Response memory backupOracleResponse = _getCurrentBackupResponse();
        Response memory prevBackupOracleResponse = _getPrevBackupOracleResponse(
            backupOracleResponse.roundId
        );
        uint8 backupDecimals = backupOracle.decimals();

        // --- CASE 1: System fetched last price from Main Oracle  ---
        if (status == Status.mainOracleWorking) {
            // If Main Oracle is broken, try backup

            if (
                _mainOracleIsBroken(mainOracleResponse, prevMainOracleResponse)
            ) {
                // If backup is broken then both oracles are untrusted, so return the last good price
                if (_backupOracleIsBroken(backupOracleResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }
                /*
                 * If Backup is only frozen but otherwise returning valid data, return the last good price.
                 */
                if (_backupIsFrozen(backupOracleResponse)) {
                    _changeStatus(Status.usingBackupMainUntrusted);
                    return lastGoodPrice;
                }

                // If Main Oracle is broken and Backup is working, switch to Backup and return current Backup price
                _changeStatus(Status.usingBackupMainUntrusted);
                return _storeGoodPrice(backupOracleResponse, backupDecimals);
            }

            // If Main oracle is frozen, try Backup
            if (_mainOracleIsFrozen(mainOracleResponse)) {
                // If Backup is broken too, remember Backup broke, and return last good price
                if (_backupOracleIsBroken(backupOracleResponse)) {
                    _changeStatus(Status.usingMainBackupUntrusted);
                    return lastGoodPrice;
                }

                // If Backup is frozen or working, remember Main Oracle froze, and switch to backup
                _changeStatus(Status.usingBackupMainFrozen);

                if (_backupIsFrozen(backupOracleResponse)) {
                    return lastGoodPrice;
                }

                // If Backup is working, use it
                return _storeGoodPrice(backupOracleResponse, backupDecimals);
            }

            // If MainOracle price has changed by > 12,5% between two consecutive rounds, compare it to Backup's price
            if (
                _priceChangeAboveMax(
                    mainOracleResponse,
                    prevMainOracleResponse,
                    decimals
                )
            ) {
                // If Backup is broken, both oracles are untrusted, and return last good price
                if (
                    _backupOracleIsBroken(backupOracleResponse) ||
                    _priceChangeAboveMax(
                        backupOracleResponse,
                        prevBackupOracleResponse,
                        backupDecimals
                    )
                ) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If backup is frozen, switch to backup and return last good price
                if (_backupIsFrozen(backupOracleResponse)) {
                    _changeStatus(Status.usingBackupMainUntrusted);
                    return lastGoodPrice;
                }

                _changeStatus(Status.usingBackupMainUntrusted);
                return _storeGoodPrice(backupOracleResponse, backupDecimals);
            }

            // If Main oracle is working and Backup is broken, remember Backup is broken
            if (_backupOracleIsBroken(backupOracleResponse)) {
                _changeStatus(Status.usingMainBackupUntrusted);
            }

            // If MainOracle is working, return MainOracle current price (no status change)
            return _storeGoodPrice(mainOracleResponse, decimals);
        }

        // --- CASE 2: The system fetched last price from Backup ---
        if (status == Status.usingBackupMainUntrusted) {
            // If both Backup and Main oracle are live, unbroken, and reporting similar prices, switch back to Main
            if (
                _bothOraclesLiveAndUnbrokenAndSimilarPrice(
                    mainOracleResponse,
                    prevMainOracleResponse,
                    backupOracleResponse,
                    decimals,
                    backupDecimals
                )
            ) {
                _changeStatus(Status.mainOracleWorking);
                return _storeGoodPrice(mainOracleResponse, decimals);
            }

            if (_backupOracleIsBroken(backupOracleResponse)) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            /*
             * If Backup is only frozen but otherwise returning valid data, just return the last good price.
             * Backup may need to be tipped to return current data.
             */
            if (_backupIsFrozen(backupOracleResponse)) {
                return lastGoodPrice;
            }

            if (
                _priceChangeAboveMax(
                    backupOracleResponse,
                    prevBackupOracleResponse,
                    backupDecimals
                )
            ) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // Otherwise, use Backup price
            return _storeGoodPrice(backupOracleResponse, backupDecimals);
        }

        // --- CASE 3: Both oracles were untrusted at the last price fetch ---
        if (status == Status.bothOraclesUntrusted) {
            /*
             * If both oracles are now live, unbroken and similar price, we assume that they are reporting
             * accurately, and so we switch back to Main Oracle.
             */
            if (
                _bothOraclesLiveAndUnbrokenAndSimilarPrice(
                    mainOracleResponse,
                    prevMainOracleResponse,
                    backupOracleResponse,
                    decimals,
                    backupDecimals
                )
            ) {
                _changeStatus(Status.mainOracleWorking);
                return _storeGoodPrice(mainOracleResponse, decimals);
            }

            // Otherwise, return the last good price - both oracles are still untrusted (no status change)
            return lastGoodPrice;
        }

        // --- CASE 4: Using Backup, and Main Oracle is frozen ---
        if (status == Status.usingBackupMainFrozen) {
            if (
                _mainOracleIsBroken(mainOracleResponse, prevMainOracleResponse)
            ) {
                // If both Oracles are broken, return last good price
                if (_backupOracleIsBroken(backupOracleResponse)) {
                    _changeStatus(Status.bothOraclesUntrusted);
                    return lastGoodPrice;
                }

                // If Main Oracle is broken, remember it and switch to using Backup
                _changeStatus(Status.usingBackupMainUntrusted);

                if (_backupIsFrozen(backupOracleResponse)) {
                    return lastGoodPrice;
                }

                // If Backup is working, return Backup current price
                return _storeGoodPrice(backupOracleResponse, backupDecimals);
            }

            if (_mainOracleIsFrozen(mainOracleResponse)) {
                // if Main Oracle is frozen and Backup is broken, remember Backup broke, and return last good price
                if (_backupOracleIsBroken(backupOracleResponse)) {
                    _changeStatus(Status.usingMainBackupUntrusted);
                    return lastGoodPrice;
                }

                // If both are frozen, just use lastGoodPrice
                if (_backupIsFrozen(backupOracleResponse)) {
                    return lastGoodPrice;
                }

                // if Main Oracle is frozen and Backup is working, keep using Backup (no status change)
                return _storeGoodPrice(backupOracleResponse, backupDecimals);
            }

            // if Main Oracle is live and Backup is broken, remember Backup broke, and return Main Oracle price
            if (_backupOracleIsBroken(backupOracleResponse)) {
                _changeStatus(Status.usingMainBackupUntrusted);
                return _storeGoodPrice(mainOracleResponse, decimals);
            }

            // If Main Oracle is live and Backup is frozen, just use last good price (no status change) since we have no basis for comparison
            if (_backupIsFrozen(backupOracleResponse)) {
                return lastGoodPrice;
            }

            // If Main Oracle is live and Backup is working, compare prices. Switch to Main Oracle
            // if prices are within 5%, and return Main Oracle price.
            if (
                _bothOraclesSimilarPrice(
                    mainOracleResponse,
                    backupOracleResponse,
                    decimals,
                    backupDecimals
                )
            ) {
                _changeStatus(Status.mainOracleWorking);
                return _storeGoodPrice(mainOracleResponse, decimals);
            }

            // Otherwise if Main Oracle is live but price not within 5% of Backup, distrust Main Oracle, and return Backup price
            _changeStatus(Status.usingBackupMainUntrusted);
            return _storeGoodPrice(backupOracleResponse, backupDecimals);
        }

        // --- CASE 5: Using Main Oracle, Back up is untrusted ---
        if (status == Status.usingMainBackupUntrusted) {
            // If Main Oracle breaks, now both oracles are untrusted
            if (
                _mainOracleIsBroken(mainOracleResponse, prevMainOracleResponse)
            ) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // If Main Oracle is frozen, return last good price (no status change)
            if (_mainOracleIsFrozen(mainOracleResponse)) {
                return lastGoodPrice;
            }

            // If Main Oracle and Backup are both live, unbroken and similar price, switch back to Main Oracle working and return MainOracle price
            if (
                _bothOraclesLiveAndUnbrokenAndSimilarPrice(
                    mainOracleResponse,
                    prevMainOracleResponse,
                    backupOracleResponse,
                    decimals,
                    backupDecimals
                )
            ) {
                _changeStatus(Status.mainOracleWorking);
                return _storeGoodPrice(mainOracleResponse, decimals);
            }

            // If Main Oracle is live but deviated >17.5% from it's previous price and Backup is still untrusted, switch
            // to bothOraclesUntrusted and return last good price
            if (
                _priceChangeAboveMax(
                    mainOracleResponse,
                    prevMainOracleResponse,
                    decimals
                )
            ) {
                _changeStatus(Status.bothOraclesUntrusted);
                return lastGoodPrice;
            }

            // Otherwise if Main Oracle is live and deviated <17.5% from it's previous price and Backup is still untrusted,
            // return Main Oracle price (no status change)
            return _storeGoodPrice(mainOracleResponse, decimals);
        }
    }

    // --- Helper functions ---

    /* Main Oracle is considered broken if its current or previous round data is in any way bad. We check the previous round
     * for two reasons:
     *
     * 1) It is necessary data for the price deviation check in case 1,
     * and
     * 2) Main Oracle is the PriceFeed's preferred primary oracle - having two consecutive valid round responses adds
     * peace of mind when using or returning to Main Oracle.
     */
    function _mainOracleIsBroken(
        Response memory _currentResponse,
        Response memory _prevResponse
    ) internal view returns (bool) {
        return
            _badMainOracleResponse(_currentResponse) ||
            _badMainOracleResponse(_prevResponse);
    }

    function _badMainOracleResponse(
        Response memory _response
    ) internal view returns (bool) {
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
    ) internal view returns (bool) {
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        return (arbsys.arbBlockNumber() - _response.blockNumber) > TIMEOUT;
    }

    function _priceChangeAboveMax(
        Response memory _currentResponse,
        Response memory _prevResponse,
        uint8 _decimals
    ) internal pure returns (bool) {
        uint currentScaledPrice = _scalePriceByDigits(
            uint256(_currentResponse.answer),
            _decimals
        );
        uint prevScaledPrice = _scalePriceByDigits(
            uint256(_prevResponse.answer),
            _decimals
        );

        uint minPrice = LiquityMath._min(currentScaledPrice, prevScaledPrice);
        uint maxPrice = LiquityMath._max(currentScaledPrice, prevScaledPrice);

        /*
         * Use the larger price as the denominator:
         * - If price decreased, the percentage deviation is in relation to the the previous price.
         * - If price increased, the percentage deviation is in relation to the current price.
         */
        uint difference = maxPrice - minPrice;
        uint threshold = (maxPrice *
            MAX_PRICE_DEVIATION_PERCENTAGE_FROM_PREVIOUS_ROUND) / 1000; // 17.5% of max price

        // Return true if price has more than doubled, or more than halved.
        return difference > threshold;
    }

    function _backupOracleIsBroken(
        Response memory _response
    ) internal view returns (bool) {
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
    ) internal view returns (bool) {
        // Hedgehog Updates: In case of a deployment to Arbitrum we gather current block.number via ArbSys method
        return arbsys.arbBlockNumber() - _backupResponse.blockNumber > TIMEOUT;
    }

    function _bothOraclesLiveAndUnbrokenAndSimilarPrice(
        Response memory _mainOracleResponse,
        Response memory _prevMainOracleResponse,
        Response memory _backupResponse,
        uint8 _mainOracleDecimals,
        uint8 _backupOracleDecimals
    ) internal view returns (bool) {
        // Return false if either oracle is broken or frozen
        if (
            _backupOracleIsBroken(_backupResponse) ||
            _backupIsFrozen(_backupResponse) ||
            _mainOracleIsBroken(_mainOracleResponse, _prevMainOracleResponse) ||
            _mainOracleIsFrozen(_mainOracleResponse)
        ) {
            return false;
        }

        return
            _bothOraclesSimilarPrice(
                _mainOracleResponse,
                _backupResponse,
                _mainOracleDecimals,
                _backupOracleDecimals
            );
    }

    function _bothOraclesSimilarPrice(
        Response memory _mainOracleResponse,
        Response memory _backupResponse,
        uint8 _mainOracleDecimals,
        uint8 _backupOracleDecimals
    ) internal pure returns (bool) {
        uint scaledMainOraclePrice = _scalePriceByDigits(
            uint256(_mainOracleResponse.answer),
            _mainOracleDecimals
        );
        uint scaledBackupPrice = _scalePriceByDigits(
            uint256(_backupResponse.answer),
            _backupOracleDecimals
        );

        // Get the relative price difference between the oracles. Use the lower price as the denominator, i.e. the reference for the calculation.
        uint minPrice = LiquityMath._min(
            scaledBackupPrice,
            scaledMainOraclePrice
        );
        uint maxPrice = LiquityMath._max(
            scaledBackupPrice,
            scaledMainOraclePrice
        );
        uint percentPriceDifference = ((maxPrice - minPrice) *
            DECIMAL_PRECISION) / minPrice;

        /*
         * Return true if the relative price difference is <= 5%: if so, we assume both oracles are probably reporting
         * the honest market price, as it is unlikely that both have been broken/hacked and are still in-sync.
         */
        return percentPriceDifference <= MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES;
    }

    function _scalePriceByDigits(
        uint _price,
        uint _answerDigits
    ) internal pure returns (uint) {
        /*
         * Convert the price returned by an oracle to an 18-digit decimal for use by Hedgehog.
         * At date of Hedgehog launch, MaainOracle uses an 8-digit price, but we also handle the possibility of
         * future changes.
         */
        uint price;
        if (_answerDigits >= TARGET_DIGITS) {
            // Scale the returned price value down to Hedgehog's target precision
            price = _price / (10 ** (_answerDigits - TARGET_DIGITS));
        } else if (_answerDigits < TARGET_DIGITS) {
            // Scale the returned price value up to Hedgehog's target precision
            price = _price * (10 ** (TARGET_DIGITS - _answerDigits));
        }
        return price;
    }

    function _changeStatus(Status _status) internal {
        status = _status;
        emit PriceFeedStatusChanged(_status);
    }

    function _storePrice(uint _currentPrice) internal {
        lastGoodPrice = _currentPrice;
        emit LastGoodPriceUpdated(_currentPrice);
    }

    function _storeGoodPrice(
        Response memory _response,
        uint8 _decimals
    ) internal returns (uint) {
        uint scaledPrice = _scalePriceByDigits(
            uint256(_response.answer),
            _decimals
        );

        _storePrice(scaledPrice);

        return scaledPrice;
    }

    function _getCurrentMainOracleResponse()
        internal
        view
        returns (Response memory response)
    {
        // Try to get latest price data:
        try mainOracle.latestRoundData() returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        ) {
            response.roundId = roundId;
            response.answer = answer;
            response.blockNumber = uint64(currentChainBN);

            return response;
        } catch {
            // If call to Main Oracle aggregator reverts
            return response;
        }
    }

    function _getCurrentBackupResponse()
        internal
        view
        returns (Response memory response)
    {
        // Try to get latest price data:
        try backupOracle.latestRoundData() returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        ) {
            response.roundId = roundId;
            response.answer = answer;
            response.blockNumber = uint64(currentChainBN);

            return response;
        } catch {
            // If call to Backup aggregator reverts with empty response
            return response;
        }
    }

    function _getPrevOracleResponse(
        uint256 _currentRoundId
    ) internal view returns (Response memory prevMainOracleResponse) {
        /*
         * NOTE: Oracle only offers a current decimals() value - there is no way to obtain the decimal precision used in a
         * previous round.  We assume the decimals used in the previous round are the same as the current round.
         */

        // Try to get the price data from the previous round:
        try mainOracle.getRoundData(_currentRoundId - 1) returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        ) {
            // If call to Hedgehog succeeds, return the response and success = true
            prevMainOracleResponse.roundId = roundId;
            prevMainOracleResponse.answer = answer;
            prevMainOracleResponse.blockNumber = uint64(currentChainBN);
            return prevMainOracleResponse;
        } catch {
            // If call to Main Oracle aggregator reverts
            return prevMainOracleResponse;
        }
    }

    function _getPrevBackupOracleResponse(
        uint256 _currentRoundId
    ) internal view returns (Response memory prevBackupOracleResponse) {
        /*
         * NOTE: Oracle only offers a current decimals() value - there is no way to obtain the decimal precision used in a
         * previous round.  We assume the decimals used in the previous round are the same as the current round.
         */

        // Try to get the price data from the previous round:
        try backupOracle.getRoundData(_currentRoundId - 1) returns (
            uint256 roundId,
            int256 answer,
            uint256 blockNumber,
            uint256 currentChainBN,
            uint256 __roundId
        ) {
            // If call to Hedgehog succeeds, return the response and success = true
            prevBackupOracleResponse.roundId = roundId;
            prevBackupOracleResponse.answer = answer;
            prevBackupOracleResponse.blockNumber = uint64(currentChainBN);
            return prevBackupOracleResponse;
        } catch {
            // If call to Main Oracle aggregator reverts
            return prevBackupOracleResponse;
        }
    }
}
