// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../dependencies/CheckContract.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../dependencies/IERC2612.sol";

/**
 * Based On Liquity Protocol Token
 * @notice Token's functionality based on HOG token.
 * Functions logic remains unchanged.
 * Changes to the contract:
 * - Raised pragma version
 * - Removed an import of Token Interface
 * - Remove native Liquidity Staking contract functionality
 * Even though SafeMath is no longer required, the decision was made to keep it to avoid human factor errors
 *
 * Based upon OpenZeppelin's ERC20 contract:
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol
 *
 * and their EIP2612 (ERC20Permit / ERC712) functionality:
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/53516bc555a454862470e7860a9b5254db4d00f5/contracts/token/ERC20/ERC20Permit.sol
 *
 *
 *  --- Functionality added specific to the HOG ---
 *
 * 1) Transfer protection: blacklist of addresses that are invalid recipients (i.e. core Liquity contracts) in external
 * transfer() and transferFrom() calls. The purpose is to protect users from losing tokens by mistakenly sending HOG directly to a Liquity
 * core contract, when they should rather call the right function.
 *
 * 2) [ DEPRECATED ] sendToHOGStaking(): callable only by Hedgehog core contracts, which move HOG tokens from user -> HOGStaking contract. [ DEPRECATED ]
 *
 * 3) Supply hard-capped at 100 million
 *
 * 4) CommunityIssuance and LockupContractFactory addresses are set at deployment. HEDGHEHOG CHANGES: lockup contract factry is removed
 *
 * 5) Initial CommunityIssuance HOG token alloc is set at 1 million tokens
 *
 * 8) 99 million tokens are minted at deployment to the Hedgehog multisig
 *
 * After one year has passed since deployment of the HOGToken, the restrictions on multisig operations are lifted
 * and the multisig has the same rights as any other address.
 */

contract HOGToken is CheckContract, IERC20, IERC2612 {
    using SafeMath for uint256;

    // --- ERC20 Data ---

    string internal constant _NAME = "Hedgehog";
    string internal constant _SYMBOL = "HOG";
    string internal constant _VERSION = "1";
    uint8 internal constant _DECIMALS = 18;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint private _totalSupply;

    // --- EIP 2612 Data ---

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 private constant _PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _TYPE_HASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    // Cache the domain separator as an immutable value, but also store the chain id that it corresponds to, in order to
    // invalidate the cached domain separator if the chain id changes.
    bytes32 private immutable _CACHED_DOMAIN_SEPARATOR;
    uint256 private immutable _CACHED_CHAIN_ID;

    bytes32 private immutable _HASHED_NAME;
    bytes32 private immutable _HASHED_VERSION;

    mapping(address => uint256) private _nonces;

    // --- HOGToken specific data ---

    uint public constant ONE_YEAR_IN_SECONDS = 31536000; // 60 * 60 * 24 * 365

    // uint for use with SafeMath
    uint internal _1_MILLION = 1e24; // 1e6 * 1e18 = 1e24

    uint internal immutable deploymentStartTime;
    address public immutable multisigAddress;

    address public immutable communityIssuanceAddress;

    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);

    // --- Functions ---

    constructor(address _communityIssuanceAddress, address _multisigAddress) {
        checkContract(_communityIssuanceAddress);
        // TODO: Pass addresses of all core contract to be able to restrict transfers to them
        multisigAddress = _multisigAddress;
        deploymentStartTime = block.timestamp;

        communityIssuanceAddress = _communityIssuanceAddress;

        bytes32 hashedName = keccak256(bytes(_NAME));
        bytes32 hashedVersion = keccak256(bytes(_VERSION));

        _HASHED_NAME = hashedName;
        _HASHED_VERSION = hashedVersion;
        _CACHED_CHAIN_ID = _chainID();
        _CACHED_DOMAIN_SEPARATOR = _buildDomainSeparator(
            _TYPE_HASH,
            hashedName,
            hashedVersion
        );

        // --- Initial HOG allocations ---

        /*
        * Hedgehog Updates:
        Not allocating anymore tokens for differrent purposes to different accounts.
        Instead only initial HogSupplyCap goes to Community Issuance contract.
        The rest is going to Multisig address including:
        Bounty Entitlement, LP Rewards Entitlement, Multisig Entitlement and potential additional rewards for depositors in community issuance address
        */

        // HEDGEHOG UPDATES: Allocate 1 million instead of 32 initially for the stabiltiy pool entitlement
        uint depositorsAndFrontEndsEntitlement = _1_MILLION; // Allocate 1 million to the algorithmic issuance schedule
        _mint(_communityIssuanceAddress, depositorsAndFrontEndsEntitlement);

        // Allocate the remainder to the HOG Multisig: (100 - 1) million = 99 million
        uint multisigEntitlement = _1_MILLION.mul(99);

        _mint(_multisigAddress, multisigEntitlement);
    }

    // --- External functions ---

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(
        address account
    ) external view override returns (uint256) {
        return _balances[account];
    }

    function getDeploymentStartTime() external view returns (uint256) {
        return deploymentStartTime;
    }

    function transfer(
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        /**
         * Hedgehog Updates:
         * No Longer restricting transfers for a multisig wallet
         * Neither restricting transfers during the first year
         */

        _requireValidRecipient(recipient);

        // Otherwise, standard transfer functionality
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(
        address owner,
        address spender
    ) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) external override returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(sender);
        }

        _requireValidRecipient(recipient);

        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            _allowances[sender][msg.sender].sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) external returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender].add(addedValue)
        );
        return true;
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) external returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender].sub(
                subtractedValue,
                "ERC20: decreased allowance below zero"
            )
        );
        return true;
    }

    // --- EIP 2612 functionality ---

    function domainSeparator() public view override returns (bytes32) {
        if (_chainID() == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        } else {
            return
                _buildDomainSeparator(
                    _TYPE_HASH,
                    _HASHED_NAME,
                    _HASHED_VERSION
                );
        }
    }

    function permit(
        address owner,
        address spender,
        uint amount,
        uint deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(deadline >= block.timestamp, "HOG: expired deadline");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(
                    abi.encode(
                        _PERMIT_TYPEHASH,
                        owner,
                        spender,
                        amount,
                        _nonces[owner]++,
                        deadline
                    )
                )
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress == owner, "HOG: invalid signature");
        _approve(owner, spender, amount);
    }

    function nonces(address owner) external view override returns (uint256) {
        // FOR EIP 2612
        return _nonces[owner];
    }

    // --- Internal operations ---

    function _chainID() private view returns (uint256 chainID) {
        assembly {
            chainID := chainid()
        }
    }

    function _buildDomainSeparator(
        bytes32 _typeHash,
        bytes32 _name,
        bytes32 _version
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _typeHash,
                    _name,
                    _version,
                    _chainID(),
                    address(this)
                )
            );
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        _balances[sender] = _balances[sender].sub(
            amount,
            "ERC20: transfer amount exceeds balance"
        );
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to the zero address");

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    // --- Helper functions ---

    function _callerIsMultisig() internal view returns (bool) {
        return (msg.sender == multisigAddress);
    }

    function _isFirstYear() internal view returns (bool) {
        return (block.timestamp.sub(deploymentStartTime) < ONE_YEAR_IN_SECONDS);
    }

    // --- 'require' functions ---

    /**
     * Hedgehog Updates:
     * No Longer revert transfer on transfers to communityIssuance
     */
    function _requireValidRecipient(address _recipient) internal view {
        require(
            _recipient != address(0) && _recipient != address(this),
            "HOG: Cannot transfer tokens directly to the HOG token contract or the zero address"
        );
    }

    function _requireSenderIsNotMultisig(address _sender) internal view {
        require(
            _sender != multisigAddress,
            "HOGToken: sender must not be the multisig"
        );
    }

    function _requireCallerIsNotMultisig() internal view {
        require(
            !_callerIsMultisig(),
            "HOGToken: caller must not be the multisig"
        );
    }

    // --- Optional functions ---

    function name() external pure returns (string memory) {
        return _NAME;
    }

    function symbol() external pure returns (string memory) {
        return _SYMBOL;
    }

    function decimals() external pure returns (uint8) {
        return _DECIMALS;
    }

    function version() external pure override returns (string memory) {
        return _VERSION;
    }

    function permitTypeHash() external pure override returns (bytes32) {
        return _PERMIT_TYPEHASH;
    }
}
