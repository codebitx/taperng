// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TapeRNG} from "../../src/TapeRNG.sol";
import {LotteryDemo} from "../../src/LotteryDemo.sol";
import {MockTapeOutCPU} from "../../src/mocks/MockTapeOutCPU.sol";
import {MockBeaconAdapter} from "../../src/beacon/MockBeaconAdapter.sol";

contract LotteryDemoTest is Test {
    MockTapeOutCPU internal cpu;
    MockBeaconAdapter internal beacon;
    TapeRNG internal rng;
    LotteryDemo internal lottery;

    bytes32 internal constant ROOT = keccak256("participants-root");
    bytes32 internal constant PRIZE_SPEC = keccak256("prize-spec");
    bytes32 internal constant SPEC = keccak256("draw-spec");
    bytes32 internal constant SEED = keccak256("organizer-seed");

    function setUp() public {
        vm.warp(1_000);
        vm.roll(100);
        cpu = new MockTapeOutCPU();
        beacon = new MockBeaconAdapter(uint64(block.timestamp), 60);
        rng = new TapeRNG(address(beacon));
        lottery = new LotteryDemo(address(rng), address(cpu), 1, keccak256(cpu.netlist(1)));
    }

    function _round() internal view returns (uint64) {
        return beacon.roundAt(uint64(block.timestamp)) + 2;
    }

    function _assertWinners(uint256 drawId, uint32 participantCount, uint32 winnerCount) internal view {
        (uint32[] memory winners, uint32[] memory prizeSlots) = lottery.getWinners(drawId);
        assertEq(winners.length, winnerCount);
        assertEq(prizeSlots.length, winnerCount);
        for (uint32 i; i < winnerCount; ++i) {
            assertLt(winners[i], participantCount);
            for (uint32 j; j < i; ++j) {
                assertTrue(winners[i] != winners[j], "duplicate winner");
            }
            assertLt(prizeSlots[i], winnerCount);
            for (uint32 j; j < i; ++j) {
                assertTrue(prizeSlots[i] != prizeSlots[j], "duplicate prize slot");
            }
        }
    }

    function testCreateAndRevealThenFinalize() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _round();
        beacon.setBeacon(round, keccak256("beacon"));

        (uint256 drawId, uint256 requestId) = lottery.createDrawAndReveal(
            ROOT, 100, PRIZE_SPEC, SPEC, 7, revealBlock, round, SEED
        );
        assertEq(drawId, 0);
        assertEq(requestId, 1);
        LotteryDemo.Draw memory d = lottery.getDraw(drawId);
        assertEq(uint256(d.status), uint256(LotteryDemo.DrawStatus.Revealed));
        assertEq(d.organizer, address(this));

        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, keccak256("lottery-blockhash"));
        bytes32 finalSeed = lottery.finalizeDraw(drawId, "proof");

        d = lottery.getDraw(drawId);
        assertEq(uint256(d.status), uint256(LotteryDemo.DrawStatus.Finalized));
        assertEq(d.finalSeed, finalSeed);
        assertFalse(d.fallbackUsed);
        _assertWinners(drawId, 100, 7);
        assertTrue(rng.verify(requestId, "proof"));
    }

    function testSeparateCommitAndReveal() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _round();
        beacon.setBeacon(round, keccak256("beacon-separate"));
        bytes32 commit = lottery.commitSeed(SEED, address(this), ROOT, 50, 5, PRIZE_SPEC, SPEC);

        (uint256 drawId,) = lottery.createDraw(
            ROOT, 50, PRIZE_SPEC, SPEC, 5, revealBlock, round, commit
        );
        assertEq(uint256(lottery.getDraw(drawId).status), uint256(LotteryDemo.DrawStatus.Created));
        lottery.revealSeed(drawId, SEED);
        assertEq(uint256(lottery.getDraw(drawId).status), uint256(LotteryDemo.DrawStatus.Revealed));

        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, keccak256("lottery-blockhash-2"));
        lottery.finalizeDraw(drawId, "proof");
        _assertWinners(drawId, 50, 5);
    }

    function testWrongRevealerReverts() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _round();
        bytes32 commit = lottery.commitSeed(SEED, address(this), ROOT, 10, 2, PRIZE_SPEC, SPEC);
        (uint256 drawId,) = lottery.createDraw(ROOT, 10, PRIZE_SPEC, SPEC, 2, revealBlock, round, commit);
        vm.prank(address(0xBEEF));
        vm.expectRevert("not organizer");
        lottery.revealSeed(drawId, SEED);
    }

    function testWinnerCountBounds() public {
        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _round();
        vm.expectRevert("bad winners");
        lottery.createDrawAndReveal(ROOT, 10, PRIZE_SPEC, SPEC, 11, revealBlock, round, SEED);
        vm.expectRevert("bad winners");
        lottery.createDrawAndReveal(ROOT, 10, PRIZE_SPEC, SPEC, 0, revealBlock, round, SEED);
    }

    function testFuzzWinners(uint32 participantCount, uint32 winnerCount) public {
        participantCount = uint32(bound(participantCount, 1, 200));
        winnerCount = uint32(bound(winnerCount, 1, participantCount));
        if (winnerCount > lottery.MAX_WINNERS()) winnerCount = lottery.MAX_WINNERS();

        uint64 revealBlock = uint64(block.number + 10);
        uint64 round = _round();
        beacon.setBeacon(round, keccak256(abi.encode("fuzz-beacon", participantCount, winnerCount)));

        bytes32 root = keccak256(abi.encode("root", participantCount, winnerCount));
        bytes32 prizeSpec = keccak256(abi.encode("prize", participantCount, winnerCount));
        bytes32 spec = keccak256(abi.encode("spec", participantCount, winnerCount));
        bytes32 seed = keccak256(abi.encode("seed", participantCount, winnerCount));

        (uint256 drawId,) = lottery.createDrawAndReveal(
            root, participantCount, prizeSpec, spec, winnerCount, revealBlock, round, seed
        );

        vm.roll(revealBlock + 1);
        vm.warp(beacon.roundTime(round) + 1);
        vm.setBlockhash(revealBlock, keccak256(abi.encode("bh", participantCount, winnerCount)));
        lottery.finalizeDraw(drawId, "proof");
        _assertWinners(drawId, participantCount, winnerCount);
    }
}
