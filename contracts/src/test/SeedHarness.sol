// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TapeRNGLib} from "../libraries/TapeRNGLib.sol";

/// @notice Thin wrapper over the derivation helpers for SDK parity fixtures.
/// @dev Not used by production contracts.  The SDK calls these functions (or
///      recomputes the same values) to check byte-for-byte parity.  The core
///      library is consumer-agnostic, so the lottery context hash is inlined
///      here -- mirroring LotteryDemo's consumer-side derivation.
contract SeedHarness {
    // Lottery context domain tag; must match LotteryDemo.D_CONTEXT.
    bytes32 private constant D_CONTEXT = 0xaa976b1b3ba5f837bc16c5f0b92e859bc20b60534a98d64ff31f58f4c273adfb;

    function contextHash(
        uint256 chainId,
        address lottery,
        bytes32 participantsRoot,
        uint32 participantCount,
        uint32 winnerCount,
        bytes32 prizeSpecHash,
        bytes32 specHash
    ) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                D_CONTEXT,
                chainId,
                lottery,
                participantsRoot,
                participantCount,
                winnerCount,
                prizeSpecHash,
                specHash
            )
        );
    }

    function commitment(bytes32 seed, bytes32 context, address organizer, uint256 chainId, address tapeRng)
        external
        pure
        returns (bytes32)
    {
        return TapeRNGLib.commitment(seed, context, organizer, chainId, tapeRng);
    }

    function preSeed(TapeRNGLib.Entropy calldata e) external pure returns (bytes32) {
        return TapeRNGLib.preSeed(e);
    }

    function circuitInput(bytes32 pre, uint32 nIn) external pure returns (bytes memory) {
        return TapeRNGLib.circuitInput(pre, nIn);
    }

    function circuitMix(uint256 circuitId, bytes32 netlistHash, bytes calldata output)
        external
        pure
        returns (bytes32)
    {
        return TapeRNGLib.circuitMix(circuitId, netlistHash, output);
    }

    function finalSeed(
        bytes32 pre,
        bytes32 mix,
        bool circuitUsed,
        bool seedMissing,
        bool fallbackBlockhash,
        bool beaconUsed
    ) external pure returns (bytes32) {
        return TapeRNGLib.finalSeed(pre, mix, circuitUsed, seedMissing, fallbackBlockhash, beaconUsed);
    }

}
