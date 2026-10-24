// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBeaconAdapter} from "../interfaces/IBeaconAdapter.sol";
import {BLS2} from "../lib/bls/BLS2.sol";

/// @title DrandQuicknetAdapter
/// @notice On-chain verification of drand quicknet beacons.
/// @dev Quicknet is a BLS12-381, unchained, 3-second network.  Signatures are
///      48-byte compressed G1 points; the public key is a 96-byte compressed
///      G2 point (stored here as an uncompressed BLS2.PointG2).  The beacon
///      randomness is sha256(signature), matching the drand API.
///      Requires EIP-2537 precompiles 0x0b / 0x0f / 0x10 and MODEXP 0x05.
contract DrandQuicknetAdapter is IBeaconAdapter {
    bytes32 public constant QUICKNET_CHAIN_HASH =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;
    uint64 public constant GENESIS_TIME = 1692803367;
    uint64 public constant PERIOD = 3;
    string public constant DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

    /// @dev Quicknet G2 public key, uncompressed, in BLS2 field ordering.
    function PUBLIC_KEY() public pure returns (BLS2.PointG2 memory) {
        return BLS2.PointG2(
            0x03cf0f2896adee7eb8b5f01fcad39122,
            0x12c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d106451,
            0x0d1fec758c921cc22b0e17e63aaf4bcb,
            0x5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a,
            0x01a714f2edb74119a2f2b0d5a7c75ba9,
            0x02d163700a61bc224ededd8e63aef7be1aaf8e93d7a9718b047ccddb3eb5d68b,
            0x0e5db2b6bfbb01c867749cadffca88b3,
            0x6c24f3012ba09fc4d3022c5c37dce0f977d3adb5d183c7477c442b1f04515273
        );
    }

    function verify(uint64 round, bytes calldata proof)
        external
        view
        returns (bool ok, bytes32 randomness)
    {
        if (proof.length != 48) return (false, bytes32(0));
        if (block.timestamp < roundTime(round)) return (false, bytes32(0));

        bytes memory signatureBytes = proof;
        BLS2.PointG1 memory signature = BLS2.g1UnmarshalCompressed(signatureBytes);
        BLS2.PointG1 memory message =
            BLS2.hashToPoint(bytes(DST), abi.encodePacked(sha256(abi.encodePacked(round))));

        (bool pairingSuccess, bool callSuccess) = BLS2.verifySingle(signature, PUBLIC_KEY(), message);
        ok = pairingSuccess && callSuccess;
        randomness = ok ? sha256(signatureBytes) : bytes32(0);
    }

    function roundAt(uint64 timestamp) external pure returns (uint64) {
        if (timestamp < GENESIS_TIME) return 0;
        return (timestamp - GENESIS_TIME) / PERIOD;
    }

    function roundTime(uint64 round) public pure returns (uint64) {
        return GENESIS_TIME + round * PERIOD;
    }

    function chainHash() external pure returns (bytes32) {
        return QUICKNET_CHAIN_HASH;
    }
}
