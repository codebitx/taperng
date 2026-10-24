// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DrandQuicknetAdapter} from "../../src/beacon/DrandQuicknetAdapter.sol";

contract DrandQuicknetAdapterTest is Test {
    DrandQuicknetAdapter internal adapter;

    // https://api.drand.sh/52db9ba7.../public/1
    uint64 internal constant ROUND = 1;
    bytes internal constant SIGNATURE =
        hex"b55e7cb2d5c613ee0b2e28d6750aabbb78c39dcc96bd9d38c2c2e12198df95571de8e8e402a0cc48871c7089a2b3af4b";
    bytes32 internal constant RANDOMNESS =
        0x1466a6cd24e327188770752f6134001c64d6efcc590ccc26b721611ad96f165a;

    function setUp() public {
        // Foundry's default Shanghai EVM does not implement EIP-2537.  These
        // tests require an EIP-2537-capable EVM (Anvil/Osaka or X Layer).
        if (!vm.envOr("RUN_EIP2537", false)) vm.skip(true);
        adapter = new DrandQuicknetAdapter();
        vm.warp(1_800_000_000);
    }

    function testVerifyKnownQuicknetRound() public view {
        (bool ok, bytes32 randomness) = adapter.verify(ROUND, SIGNATURE);
        assertTrue(ok, "quicknet round 1 signature must verify");
        assertEq(randomness, RANDOMNESS, "randomness must be sha256(signature)");
    }

    function testRejectsTamperedSignature() public view {
        bytes memory tampered = bytes.concat(SIGNATURE);
        tampered[0] = tampered[0] ^ 0x01;
        (bool ok,) = adapter.verify(ROUND, tampered);
        assertFalse(ok, "tampered signature must not verify");
    }

    function testRejectsShortSignature() public view {
        bytes memory shortSig = new bytes(47);
        (bool ok,) = adapter.verify(ROUND, shortSig);
        assertFalse(ok, "short signature must not verify");
    }
}
