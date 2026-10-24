// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TapeRNG} from "../../src/TapeRNG.sol";
import {TapeRNGLib} from "../../src/libraries/TapeRNGLib.sol";
import {MockTapeOutCPU} from "../../src/mocks/MockTapeOutCPU.sol";
import {MockBeaconAdapter} from "../../src/beacon/MockBeaconAdapter.sol";
import {ITapeOutCPU} from "../../src/interfaces/ITapeOutCPU.sol";

contract ShortCPU is ITapeOutCPU {
    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        return "";
    }

    function step(uint256, bytes calldata, bytes calldata) external pure returns (bytes memory, bytes memory) {
        return ("", "");
    }

    function circuitInfo(uint256) external pure returns (uint32, uint32, uint32, uint32) {
        return (24, 24, 0, 1488);
    }

    function netlist(uint256) external pure returns (bytes memory) {
        return hex"00";
    }
}

contract TapeRNGTest is Test {
    MockTapeOutCPU internal cpu;
    MockBeaconAdapter internal beacon;
    TapeRNG internal rng;

    bytes32 internal constant CTX = keccak256("test-context");
    bytes32 internal constant SPEC = keccak256("test-spec");
    bytes32 internal constant SEED = keccak256("organizer-seed");

    function setUp() public {
        vm.warp(1_000);
        vm.roll(100);
        cpu = new MockTapeOutCPU();
        beacon = new MockBeaconAdapter(uint64(block.timestamp), 60);
        rng = new TapeRNG(address(beacon));
    }

    function _beaconRound() internal view returns (uint64) {
        return beacon.roundAt(uint64(block.timestamp)) + 2;
    }

    function _create(address revealer, uint64 revealBlock, uint64 round, bytes32 seed)
        internal
        returns (uint256 id)
    {
        bytes32 commit = TapeRNGLib.commitment(seed, CTX, revealer, block.chainid, address(rng));
        vm.prank(revealer);
        id = rng.createRequest(commit, CTX, SPEC, revealBlock, round, address(cpu), 1, revealer);
    }

    function testCreateRevealFinalize() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        bytes32 blockHash = keccak256("blockhash");
        beacon.setBeacon(round, keccak256("beacon"));

        uint256 id = _create(address(this), revealBlock, round, SEED);
        assertEq(uint256(rng.requestStatus(id)), uint256(TapeRNG.Status.Committed));

        rng.reveal(id, SEED);
        assertEq(uint256(rng.requestStatus(id)), uint256(TapeRNG.Status.Revealed));

        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, blockHash);
        bytes32 finalSeed = rng.finalize(id, "proof");

        assertEq(uint256(rng.requestStatus(id)), uint256(TapeRNG.Status.Finalized));
        assertEq(rng.requestFinalSeed(id), finalSeed);
        assertTrue(rng.verify(id, "proof"));
        TapeRNG.Request memory req = rng.getRequest(id);
        assertFalse(req.seedMissing);
        assertTrue(req.beaconUsed);
        assertTrue(req.circuitUsed);
    }

    function testSeedMissingFallback() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        bytes32 blockHash = keccak256("blockhash-missing");
        beacon.setBeacon(round, keccak256("beacon-missing"));

        uint256 id = _create(address(this), revealBlock, round, SEED);
        // Do not reveal.
        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, blockHash);
        rng.finalize(id, "proof");

        TapeRNG.Request memory req = rng.getRequest(id);
        assertTrue(req.seedMissing);
        assertTrue(req.circuitUsed);
    }

    function testFinalizeExpiredFallback() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        beacon.setBeacon(round, keccak256("beacon-expired"));

        uint256 id = _create(address(this), revealBlock, round, SEED);
        rng.reveal(id, SEED);

        vm.roll(revealBlock + 257);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(block.number - 1, keccak256("expired-recent"));
        rng.finalizeExpired(id, "");

        TapeRNG.Request memory req = rng.getRequest(id);
        assertFalse(req.seedMissing);
        assertTrue(req.fallbackBlockhash);
        assertFalse(req.beaconUsed);
        assertTrue(req.circuitUsed);
    }

    function testShortCircuitOutputFallsBack() public {
        ShortCPU shortCpu = new ShortCPU();
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        beacon.setBeacon(round, keccak256("short-beacon"));
        bytes32 commit = TapeRNGLib.commitment(SEED, CTX, address(this), block.chainid, address(rng));
        uint256 id = rng.createRequest(
            commit, CTX, SPEC, revealBlock, round, address(shortCpu), 1, address(this)
        );
        rng.reveal(id, SEED);
        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, keccak256("short"));
        rng.finalize(id, "proof");
        TapeRNG.Request memory req = rng.getRequest(id);
        assertFalse(req.circuitUsed);
    }

    function testBadCommitmentReverts() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        uint256 id = _create(address(this), revealBlock, round, SEED);
        vm.expectRevert("bad commitment");
        rng.reveal(id, keccak256("wrong-seed"));
    }

    function testRevealAfterBeaconTimeReverts() public {
        uint64 revealBlock = uint64(block.number + 20);
        uint64 round = _beaconRound();
        uint256 id = _create(address(this), revealBlock, round, SEED);
        vm.warp(beacon.roundTime(round));
        vm.expectRevert("beacon published");
        rng.reveal(id, SEED);
    }

    function testFinalizeEarlyReverts() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        uint256 id = _create(address(this), revealBlock, round, SEED);
        rng.reveal(id, SEED);
        vm.expectRevert("too early");
        rng.finalize(id, "proof");
    }

    function testFinalizeRequiresBeaconProof() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        uint256 id = _create(address(this), revealBlock, round, SEED);
        rng.reveal(id, SEED);
        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, keccak256("no-beacon-proof"));
        vm.expectRevert("beacon proof required");
        rng.finalize(id, "");
    }

    function testFinalizeWithoutBeaconRound() public {
        uint64 revealBlock = uint64(block.number + 10);
        bytes32 commit = TapeRNGLib.commitment(SEED, CTX, address(this), block.chainid, address(rng));
        uint256 id = rng.createRequest(commit, CTX, SPEC, revealBlock, 0, address(cpu), 1, address(this));
        rng.reveal(id, SEED);
        vm.roll(revealBlock + 1);
        vm.setBlockhash(revealBlock, keccak256("no-beacon"));
        rng.finalize(id, "");
        TapeRNG.Request memory req = rng.getRequest(id);
        assertFalse(req.beaconUsed);
        assertTrue(rng.verify(id, ""));
    }

    function testFinalizeRequiresCircuitGas() public {
        uint64 revealBlock = uint64(block.number + 10);
        bytes32 commit = TapeRNGLib.commitment(SEED, CTX, address(this), block.chainid, address(rng));
        uint256 id = rng.createRequest(commit, CTX, SPEC, revealBlock, 0, address(cpu), 1, address(this));
        rng.reveal(id, SEED);
        vm.roll(revealBlock + 1);
        vm.setBlockhash(revealBlock, keccak256("gas-floor"));

        vm.expectRevert("insufficient gas for circuit");
        rng.finalize{gas: 4_000_000}(id, "");

        // With enough gas the same request finalizes and uses the circuit.
        rng.finalize{gas: 5_500_000}(id, "");
        TapeRNG.Request memory req = rng.getRequest(id);
        assertTrue(req.circuitUsed);
    }

    function testStatefulCircuitRejected() public {
        uint64 revealBlock = uint64(block.number + 10);
        bytes32 commit = keccak256("commit");
        vm.mockCall(
            address(cpu),
            abi.encodeCall(ITapeOutCPU.circuitInfo, (2)),
            abi.encode(uint32(24), uint32(24), uint32(1), uint32(100))
        );
        vm.expectRevert("stateful circuit");
        rng.createRequest(commit, CTX, SPEC, revealBlock, 0, address(cpu), 2, address(this));
    }

    function testRevealOnlyOnce() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _beaconRound();
        uint256 id = _create(address(this), revealBlock, round, SEED);
        rng.reveal(id, SEED);
        vm.expectRevert("not committed");
        rng.reveal(id, SEED);
    }
}
