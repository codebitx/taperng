// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutCPU} from "./interfaces/ITapeOutCPU.sol";
import {IBeaconAdapter} from "./interfaces/IBeaconAdapter.sol";
import {TapeRNGLib} from "./libraries/TapeRNGLib.sol";

/// @title TapeRNG
/// @notice Permissionless commit-reveal + drand quicknet + blockhash random
///         derivation core.  No owner, no upgradeability, no funds.
/// @dev A consumer (e.g. LotteryDemo) creates a request and later reads the
///      final seed.  The TapeOut circuit is a deterministic, transparent mix
///      layer; entropy comes from the organizer commitment, drand and blockhash.
contract TapeRNG {
    enum Status {
        None,
        Committed,
        Revealed,
        Finalized
    }

    struct Request {
        address requester;
        address revealer;
        bytes32 commit;
        bytes32 contextHash;
        bytes32 specHash;
        uint64 revealBlock;
        uint64 beaconRound;
        address cpu;
        uint256 circuitId;
        bytes32 netlistHash;
        uint32 nIn;
        uint32 nOut;
        uint32 gateCount;
        bool seedMissing;
        bool fallbackBlockhash;
        bool beaconUsed;
        bool circuitUsed;
        bytes32 organizerSeed;
        bytes32 blockHash;
        bytes32 beaconRandomness;
        bytes32 circuitMix;
        bytes32 preSeed;
        bytes32 finalSeed;
        Status status;
    }

    /// @notice Gas cap forwarded to the TapeOut circuit during finalization.
    uint256 public constant CIRCUIT_EVAL_GAS = 4_500_000;

    /// @notice Minimum gasleft required before the circuit call.  EIP-150 only
    ///         forwards 63/64 of the remaining gas; without this floor a low
    ///         gas limit would OOG the eval, be swallowed by the catch below,
    ///         and silently set circuitUsed=false.  The extra headroom also
    ///         covers the post-eval storage writes and event.
    uint256 public constant MIN_CIRCUIT_GAS = 5_200_000;

    uint256 public nextRequestId = 1;
    mapping(uint256 requestId => Request) public requests;
    IBeaconAdapter public immutable beaconAdapter;

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }

    function requestStatus(uint256 requestId) external view returns (Status) {
        return requests[requestId].status;
    }

    function requestFinalSeed(uint256 requestId) external view returns (bytes32) {
        return requests[requestId].finalSeed;
    }

    function requestFallbackBlockhash(uint256 requestId) external view returns (bool) {
        return requests[requestId].fallbackBlockhash;
    }

    function requestRevealBlock(uint256 requestId) external view returns (uint64) {
        return requests[requestId].revealBlock;
    }

    uint256 private _entered = 1;

    event RequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        address indexed revealer,
        bytes32 commit,
        bytes32 contextHash,
        bytes32 specHash,
        uint64 revealBlock,
        uint64 beaconRound,
        address cpu,
        uint256 circuitId,
        bytes32 netlistHash
    );
    event SeedRevealed(uint256 indexed requestId, bytes32 seed);
    event RequestFinalized(
        uint256 indexed requestId,
        bytes32 preSeed,
        bytes32 finalSeed,
        bytes32 blockHash,
        bytes32 beaconRandomness,
        bytes32 circuitMix,
        bool seedMissing,
        bool fallbackBlockhash,
        bool beaconUsed,
        bool circuitUsed
    );

    modifier nonReentrant() {
        require(_entered == 1, "reentrant");
        _entered = 2;
        _;
        _entered = 1;
    }

    constructor(address beaconAdapter_) {
        beaconAdapter = IBeaconAdapter(beaconAdapter_);
    }

    function createRequest(
        bytes32 commit,
        bytes32 contextHash,
        bytes32 specHash,
        uint64 revealBlock,
        uint64 beaconRound,
        address cpu,
        uint256 circuitId,
        address revealer
    ) external returns (uint256 requestId) {
        require(cpu != address(0), "cpu=0");
        require(revealer != address(0), "revealer=0");
        require(uint256(revealBlock) > block.number, "revealBlock past");
        require(uint256(revealBlock) <= block.number + 7200, "revealBlock too far");
        require(beaconRound == 0 || address(beaconAdapter) != address(0), "no beacon adapter");

        if (beaconRound != 0) {
            require(beaconRound > beaconAdapter.roundAt(uint64(block.timestamp)), "beacon in past");
            uint256 beaconTime = uint256(beaconAdapter.roundTime(beaconRound));
            require(beaconTime > block.timestamp + 60, "beacon too soon");
            require(beaconTime <= block.timestamp + 7 days, "beacon too far");
        }

        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount) =
            ITapeOutCPU(cpu).circuitInfo(circuitId);
        require(nState == 0, "stateful circuit");
        require(nIn > 0 && nIn <= 256, "bad nIn");
        require(nOut > 0, "bad nOut");
        require(gateCount <= 5000, "too many gates");
        bytes memory netlistBytes = ITapeOutCPU(cpu).netlist(circuitId);
        bytes32 netlistHash = keccak256(netlistBytes);

        requestId = nextRequestId++;
        requests[requestId] = Request({
            requester: msg.sender,
            revealer: revealer,
            commit: commit,
            contextHash: contextHash,
            specHash: specHash,
            revealBlock: revealBlock,
            beaconRound: beaconRound,
            cpu: cpu,
            circuitId: circuitId,
            netlistHash: netlistHash,
            nIn: nIn,
            nOut: nOut,
            gateCount: gateCount,
            seedMissing: false,
            fallbackBlockhash: false,
            beaconUsed: false,
            circuitUsed: false,
            organizerSeed: bytes32(0),
            blockHash: bytes32(0),
            beaconRandomness: bytes32(0),
            circuitMix: bytes32(0),
            preSeed: bytes32(0),
            finalSeed: bytes32(0),
            status: Status.Committed
        });

        emit RequestCreated(
            requestId,
            msg.sender,
            revealer,
            commit,
            contextHash,
            specHash,
            revealBlock,
            beaconRound,
            cpu,
            circuitId,
            netlistHash
        );
    }

    function reveal(uint256 requestId, bytes32 seed) external {
        Request storage r = requests[requestId];
        require(r.status == Status.Committed, "not committed");
        require(msg.sender == r.requester || msg.sender == r.revealer, "not revealer");
        require(uint256(r.revealBlock) > block.number, "reveal closed");
        if (r.beaconRound != 0) {
            require(block.timestamp < uint256(beaconAdapter.roundTime(r.beaconRound)), "beacon published");
        }
        require(
            TapeRNGLib.commitment(seed, r.contextHash, r.revealer, block.chainid, address(this)) == r.commit,
            "bad commitment"
        );

        r.organizerSeed = seed;
        r.status = Status.Revealed;
        emit SeedRevealed(requestId, seed);
    }

    /// @notice Finalize within the 256-block blockhash window.
    /// @dev If the organizer did not reveal, the request can still be finalized
    ///      with seedMissing=true.  A valid beacon proof is mandatory when
    ///      beaconRound != 0; keepers cannot silently drop the beacon.
    function finalize(uint256 requestId, bytes calldata beaconProof)
        external
        nonReentrant
        returns (bytes32 finalSeed)
    {
        Request storage r = requests[requestId];
        require(r.status == Status.Committed || r.status == Status.Revealed, "bad status");
        require(uint256(r.revealBlock) < block.number, "too early");
        require(block.number <= uint256(r.revealBlock) + 256, "blockhash expired");
        bytes32 bh = blockhash(uint256(r.revealBlock));
        require(bh != bytes32(0), "blockhash=0");
        return _finalize(r, requestId, bh, false, beaconProof, false);
    }

    /// @notice Emergency finalization after the blockhash window.
    /// @dev Uses blockhash(block.number-1) and sets fallbackBlockhash=true.
    ///      After the window, a missing/invalid beacon may be skipped and
    ///      beaconUsed=false; the proof/UI must disclose this degraded mode.
    function finalizeExpired(uint256 requestId, bytes calldata beaconProof)
        external
        nonReentrant
        returns (bytes32 finalSeed)
    {
        Request storage r = requests[requestId];
        require(r.status == Status.Committed || r.status == Status.Revealed, "bad status");
        require(block.number > uint256(r.revealBlock) + 256, "not expired");
        bytes32 bh = blockhash(block.number - 1);
        require(bh != bytes32(0), "blockhash=0");
        return _finalize(r, requestId, bh, true, beaconProof, true);
    }

    /// @notice Lightweight on-chain consistency check.  The SDK performs the
    ///         full netlist/drand/merkle verification.
    function verify(uint256 requestId, bytes calldata beaconProof) external view returns (bool) {
        Request storage r = requests[requestId];
        if (r.status != Status.Finalized) return false;

        if (r.beaconRound != 0 && r.beaconUsed && beaconProof.length > 0) {
            (bool ok, bytes32 randomness) = beaconAdapter.verify(r.beaconRound, beaconProof);
            if (!ok || randomness != r.beaconRandomness) return false;
        }

        TapeRNGLib.Entropy memory e = TapeRNGLib.Entropy({
            chainId: block.chainid,
            tapeRng: address(this),
            requestId: requestId,
            contextHash: r.contextHash,
            organizerSeed: r.organizerSeed,
            blockHash: r.blockHash,
            beaconRandomness: r.beaconRandomness,
            cpu: r.cpu,
            circuitId: r.circuitId,
            netlistHash: r.netlistHash,
            beaconRound: r.beaconRound,
            seedMissing: r.seedMissing,
            fallbackBlockhash: r.fallbackBlockhash
        });
        bytes32 pre = TapeRNGLib.preSeed(e);
        bytes32 fs = TapeRNGLib.finalSeed(
            pre, r.circuitMix, r.circuitUsed, r.seedMissing, r.fallbackBlockhash, r.beaconUsed
        );
        return pre == r.preSeed && fs == r.finalSeed;
    }

    function _finalize(
        Request storage r,
        uint256 requestId,
        bytes32 blockHash,
        bool fallbackBlockhash,
        bytes calldata beaconProof,
        bool allowBeaconSkip
    ) private returns (bytes32 finalSeed) {
        bool beaconUsed;
        bytes32 beaconRandomness;

        if (r.beaconRound != 0) {
            if (beaconProof.length == 0) {
                require(allowBeaconSkip, "beacon proof required");
            } else {
                try beaconAdapter.verify(r.beaconRound, beaconProof) returns (bool ok, bytes32 randomness) {
                    if (ok) {
                        beaconUsed = true;
                        beaconRandomness = randomness;
                    } else {
                        require(allowBeaconSkip, "bad beacon");
                    }
                } catch {
                    require(allowBeaconSkip, "beacon verify failed");
                }
            }
        }

        bool seedMissing = r.status != Status.Revealed;

        TapeRNGLib.Entropy memory e = TapeRNGLib.Entropy({
            chainId: block.chainid,
            tapeRng: address(this),
            requestId: requestId,
            contextHash: r.contextHash,
            organizerSeed: r.organizerSeed,
            blockHash: blockHash,
            beaconRandomness: beaconRandomness,
            cpu: r.cpu,
            circuitId: r.circuitId,
            netlistHash: r.netlistHash,
            beaconRound: r.beaconRound,
            seedMissing: seedMissing,
            fallbackBlockhash: fallbackBlockhash
        });
        bytes32 pre = TapeRNGLib.preSeed(e);
        bytes memory mixIn = TapeRNGLib.circuitInput(pre, r.nIn);
        bytes32 mix;
        bool circuitUsed;

        // Make a too-low gas limit an explicit failure instead of a silent
        // circuitUsed=false fallback.  This also makes eth_estimateGas return
        // a limit that can actually forward CIRCUIT_EVAL_GAS under EIP-150.
        require(gasleft() >= MIN_CIRCUIT_GAS, "insufficient gas for circuit");

        try ITapeOutCPU(r.cpu).eval{gas: CIRCUIT_EVAL_GAS}(r.circuitId, mixIn) returns (bytes memory output) {
            uint256 expected = (uint256(r.nOut) + 7) / 8;
            if (output.length == expected) {
                mix = TapeRNGLib.circuitMix(r.circuitId, r.netlistHash, output);
                circuitUsed = true;
            }
        } catch {}

        finalSeed = TapeRNGLib.finalSeed(
            pre, mix, circuitUsed, seedMissing, fallbackBlockhash, beaconUsed
        );

        r.organizerSeed = e.organizerSeed;
        r.blockHash = blockHash;
        r.beaconRandomness = beaconRandomness;
        r.circuitMix = mix;
        r.preSeed = pre;
        r.finalSeed = finalSeed;
        r.seedMissing = seedMissing;
        r.fallbackBlockhash = fallbackBlockhash;
        r.beaconUsed = beaconUsed;
        r.circuitUsed = circuitUsed;
        r.status = Status.Finalized;

        emit RequestFinalized(
            requestId,
            pre,
            finalSeed,
            blockHash,
            beaconRandomness,
            mix,
            seedMissing,
            fallbackBlockhash,
            beaconUsed,
            circuitUsed
        );
    }
}
