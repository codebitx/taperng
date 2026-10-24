// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TapeRNGLib
/// @notice Core-domain TapeRNG derivation helpers shared by the core, consumers
///         and the Solidity/TypeScript parity harness.  This library is
///         consumer-agnostic: it never interprets a consumer's context, prize or
///         winner semantics -- those live in the consumer contracts (e.g.
///         LotteryDemo) and enter here only as opaque bytes32 values.
/// @dev Every hash input is domain-separated.  The TypeScript SDK must encode
///      the same types (notably uint32/uint64) with viem's encodeAbiParameters.
library TapeRNGLib {
    // Domain tags: keccak256("TapeRNG-v1/<name>")
    bytes32 internal constant D_PRESEED = 0x99308e96a51932c5dd8bc7388afcb25294bf9f8055e71615b9fdb9bad9b3a65c;
    bytes32 internal constant D_CIRCUIT_INPUT = 0x2a41fd1c050ea81a6738f86811598486a1dc9f453d71734dfb7124746224566f;
    bytes32 internal constant D_CIRCUIT_MIX = 0x8992da79c1dbdbbe9eb0b5b5d42957b20e69a3aa04d597bb11a6d1b45ab503d4;
    bytes32 internal constant D_FINAL_SEED = 0xea72d5d213a9e1ee600a87ade8998cabd4c9f7181d8f9da0fb5eddb64264d0bd;
    bytes32 internal constant D_ORGANIZER = 0x09a464732924d476898b2a0341a34cf1cc9b10bcac0cc53fd620cbbe5944c34e;

    struct Entropy {
        uint256 chainId;
        address tapeRng;
        uint256 requestId;
        bytes32 contextHash; // opaque, defined by the consumer; never parsed here
        bytes32 organizerSeed;
        bytes32 blockHash;
        bytes32 beaconRandomness;
        address cpu;
        uint256 circuitId;
        bytes32 netlistHash;
        uint64 beaconRound;
        bool seedMissing;
        bool fallbackBlockhash;
    }

    function commitment(bytes32 seed, bytes32 context, address organizer, uint256 chainId, address tapeRng)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(D_ORGANIZER, seed, context, organizer, chainId, tapeRng));
    }

    function preSeed(Entropy memory e) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                D_PRESEED,
                e.chainId,
                e.tapeRng,
                e.requestId,
                e.contextHash,
                e.organizerSeed,
                e.blockHash,
                e.beaconRandomness,
                e.cpu,
                e.circuitId,
                e.netlistHash,
                e.beaconRound,
                e.seedMissing,
                e.fallbackBlockhash
            )
        );
    }

    /// @notice First ceil(nIn/8) bytes of keccak256(D_CIRCUIT_INPUT || preSeed).
    /// @dev nIn is capped at 256 by TapeRNG.createRequest.
    function circuitInput(bytes32 pre, uint32 nIn) internal pure returns (bytes memory out) {
        uint256 len = (uint256(nIn) + 7) / 8;
        bytes32 h = keccak256(abi.encode(D_CIRCUIT_INPUT, pre));
        out = new bytes(len);
        for (uint256 i; i < len; ++i) {
            out[i] = h[i];
        }
    }

    function circuitMix(uint256 circuitId, bytes32 netlistHash, bytes memory output)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(D_CIRCUIT_MIX, circuitId, netlistHash, output));
    }

    function finalSeed(
        bytes32 pre,
        bytes32 mix,
        bool circuitUsed,
        bool seedMissing,
        bool fallbackBlockhash,
        bool beaconUsed
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(D_FINAL_SEED, pre, mix, circuitUsed, seedMissing, fallbackBlockhash, beaconUsed)
        );
    }

}
