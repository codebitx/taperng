// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITapeOutCPU} from "./interfaces/ITapeOutCPU.sol";
import {TapeRNG} from "./TapeRNG.sol";
import {TapeRNGLib} from "./libraries/TapeRNGLib.sol";

/// @title LotteryDemo
/// @notice The first TapeRNG consumer.  Prizes are metadata only: this
///         contract never holds or transfers tokens.  It binds a participant
///         Merkle root, a prize metadata hash, a winner count and the final
///         winner/prize-slot indices.
contract LotteryDemo {
    enum DrawStatus {
        None,
        Created,
        Revealed,
        Finalized
    }

    struct Draw {
        address organizer;
        uint256 requestId;
        bytes32 participantsRoot;
        uint32 participantCount;
        uint32 winnerCount;
        bytes32 prizeSpecHash;
        bytes32 specHash;
        bytes32 organizerCommit;
        uint64 revealBlock;
        uint64 beaconRound;
        DrawStatus status;
        bool fallbackUsed;
        bytes32 finalSeed;
        uint32[] winners;
        uint32[] prizeSlots;
    }

    uint32 public constant MAX_PARTICIPANTS = 5000;
    uint32 public constant MAX_WINNERS = 100;

    // Lottery-specific domain tags.  They intentionally live here, not in the
    // generic TapeRNGLib: the core only derives a seed and never interprets a
    // consumer's context, so the context (with prize/winner semantics) is
    // derived and domain-separated by this consumer.
    bytes32 private constant D_CONTEXT = 0xaa976b1b3ba5f837bc16c5f0b92e859bc20b60534a98d64ff31f58f4c273adfb;
    bytes32 private constant D_SHUFFLE = 0xc56ae30caabad7a8a27fe8c179d40fcfeba562a830ebde1129bcd06d7963e7b5;
    bytes32 private constant D_PRIZE = 0xb181bdeb06d9343739a19ed0c04274b15bea4bf2f924fb07d59fdbed9f8a1425;

    TapeRNG public immutable tapeRng;
    address public immutable cpu;
    uint256 public immutable circuitId;
    bytes32 public immutable netlistHash;

    uint256 public nextDrawId;

    mapping(uint256 drawId => Draw) private _draws;

    uint256 private _locked = 1;

    event DrawCreated(
        uint256 indexed drawId,
        uint256 indexed requestId,
        address indexed organizer,
        bytes32 participantsRoot,
        uint32 participantCount,
        uint32 winnerCount,
        bytes32 prizeSpecHash,
        bytes32 specHash
    );

    event DrawRevealed(uint256 indexed drawId, bytes32 seed);

    event DrawFinalized(
        uint256 indexed drawId,
        bytes32 finalSeed,
        bool fallbackUsed,
        uint32[] winners,
        uint32[] prizeSlots
    );

    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address tapeRng_, address cpu_, uint256 circuitId_, bytes32 netlistHash_) {
        require(tapeRng_ != address(0), "tapeRng=0");
        require(cpu_ != address(0), "cpu=0");
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount) = ITapeOutCPU(cpu_).circuitInfo(circuitId_);
        require(nState == 0 && nIn > 0 && nIn <= 256 && nOut > 0 && gateCount <= 5000, "bad circuit");
        require(keccak256(ITapeOutCPU(cpu_).netlist(circuitId_)) == netlistHash_, "netlist mismatch");

        tapeRng = TapeRNG(tapeRng_);
        cpu = cpu_;
        circuitId = circuitId_;
        netlistHash = netlistHash_;
    }

    function getDraw(uint256 drawId) external view returns (Draw memory) {
        return _draws[drawId];
    }

    function getWinners(uint256 drawId)
        external
        view
        returns (uint32[] memory winners, uint32[] memory prizeSlots)
    {
        Draw storage d = _draws[drawId];
        return (d.winners, d.prizeSlots);
    }

    /// @notice Commitment helper used by the frontend and by createDrawAndReveal.
    function commitSeed(
        bytes32 seed,
        address organizer,
        bytes32 participantsRoot,
        uint32 participantCount,
        uint32 winnerCount,
        bytes32 prizeSpecHash,
        bytes32 specHash
    ) public view returns (bytes32) {
        bytes32 ctx = _contextHash(
            participantsRoot, participantCount, winnerCount, prizeSpecHash, specHash
        );
        return TapeRNGLib.commitment(seed, ctx, organizer, block.chainid, address(tapeRng));
    }

    function createDraw(
        bytes32 participantsRoot,
        uint32 participantCount,
        bytes32 prizeSpecHash,
        bytes32 specHash,
        uint32 winnerCount,
        uint64 revealBlock,
        uint64 beaconRound,
        bytes32 organizerCommit
    ) external nonReentrant returns (uint256 drawId, uint256 requestId) {
        return _createDraw(
            participantsRoot,
            participantCount,
            prizeSpecHash,
            specHash,
            winnerCount,
            revealBlock,
            beaconRound,
            organizerCommit
        );
    }

    /// @notice One-transaction publish path used by the web form: create and
    ///         reveal the organizer seed in the same transaction.
    function createDrawAndReveal(
        bytes32 participantsRoot,
        uint32 participantCount,
        bytes32 prizeSpecHash,
        bytes32 specHash,
        uint32 winnerCount,
        uint64 revealBlock,
        uint64 beaconRound,
        bytes32 seed
    ) external nonReentrant returns (uint256 drawId, uint256 requestId) {
        bytes32 organizerCommit = commitSeed(
            seed, msg.sender, participantsRoot, participantCount, winnerCount, prizeSpecHash, specHash
        );
        (drawId, requestId) = _createDraw(
            participantsRoot,
            participantCount,
            prizeSpecHash,
            specHash,
            winnerCount,
            revealBlock,
            beaconRound,
            organizerCommit
        );
        tapeRng.reveal(requestId, seed);
        _draws[drawId].status = DrawStatus.Revealed;
        emit DrawRevealed(drawId, seed);
    }

    function revealSeed(uint256 drawId, bytes32 seed) external nonReentrant {
        Draw storage d = _draws[drawId];
        require(d.status == DrawStatus.Created, "not created");
        require(msg.sender == d.organizer, "not organizer");
        require(
            commitSeed(
                seed,
                msg.sender,
                d.participantsRoot,
                d.participantCount,
                d.winnerCount,
                d.prizeSpecHash,
                d.specHash
            ) == d.organizerCommit,
            "bad commitment"
        );
        tapeRng.reveal(d.requestId, seed);
        d.status = DrawStatus.Revealed;
        emit DrawRevealed(drawId, seed);
    }

    /// @notice Anyone can finalize once the request's blockhash window is open.
    function finalizeDraw(uint256 drawId, bytes calldata beaconProof)
        external
        nonReentrant
        returns (bytes32 finalSeed)
    {
        Draw storage d = _draws[drawId];
        require(d.status == DrawStatus.Created || d.status == DrawStatus.Revealed, "not active");

        bool usedFallback;
        (finalSeed, usedFallback) = _finalizeRequest(d.requestId, beaconProof);

        d.finalSeed = finalSeed;
        d.fallbackUsed = usedFallback;
        d.winners = shuffleWinners(finalSeed, d.participantCount, d.winnerCount);
        d.prizeSlots = shufflePrizeSlots(finalSeed, d.winnerCount);
        d.status = DrawStatus.Finalized;

        emit DrawFinalized(drawId, finalSeed, usedFallback, d.winners, d.prizeSlots);
    }

    /// @notice Partial Fisher-Yates (selection sampling), O(winnerCount).
    /// @dev Lottery-specific logic; kept out of TapeRNGLib on purpose.
    function shuffleWinners(bytes32 seed, uint32 participantCount, uint32 winnerCount)
        public
        pure
        returns (uint32[] memory winners)
    {
        require(winnerCount <= participantCount, "winnerCount > participantCount");
        winners = new uint32[](winnerCount);
        uint32[] memory arr = new uint32[](participantCount);
        for (uint32 i; i < participantCount; ++i) {
            arr[i] = i;
        }
        for (uint32 i; i < winnerCount; ++i) {
            uint32 range = participantCount - i;
            uint256 w = _uniform(seed, D_SHUFFLE, i, range);
            uint32 j = i + uint32(w % range);
            (arr[i], arr[j]) = (arr[j], arr[i]);
            winners[i] = arr[i];
        }
    }

    /// @notice Full Fisher-Yates permutation of prize slots 0..winnerCount-1.
    function shufflePrizeSlots(bytes32 seed, uint32 winnerCount) public pure returns (uint32[] memory slots) {
        slots = new uint32[](winnerCount);
        for (uint32 i; i < winnerCount; ++i) {
            slots[i] = i;
        }
        if (winnerCount <= 1) return slots;
        for (uint32 i = winnerCount - 1; i > 0; --i) {
            uint32 range = i + 1;
            uint256 w = _uniform(seed, D_PRIZE, i, range);
            uint32 j = uint32(w % range);
            (slots[i], slots[j]) = (slots[j], slots[i]);
        }
    }

    function _uniform(bytes32 seed, bytes32 domain, uint32 index, uint32 range) private pure returns (uint256) {
        require(range > 0, "range=0");
        uint256 limit = type(uint256).max - (type(uint256).max % range);
        uint32 attempt;
        while (true) {
            uint256 w = uint256(keccak256(abi.encode(domain, seed, index, attempt)));
            if (w < limit) return w;
            unchecked {
                ++attempt;
            }
        }
        // Unreachable; satisfies the compiler's return-path analysis.
        return 0;
    }

    function _createDraw(
        bytes32 participantsRoot,
        uint32 participantCount,
        bytes32 prizeSpecHash,
        bytes32 specHash,
        uint32 winnerCount,
        uint64 revealBlock,
        uint64 beaconRound,
        bytes32 organizerCommit
    ) internal returns (uint256 drawId, uint256 requestId) {
        require(participantsRoot != bytes32(0), "root=0");
        require(participantCount > 0 && participantCount <= MAX_PARTICIPANTS, "bad participants");
        require(
            winnerCount > 0 && winnerCount <= MAX_WINNERS && winnerCount <= participantCount,
            "bad winners"
        );

        bytes32 ctx = _contextHash(
            participantsRoot, participantCount, winnerCount, prizeSpecHash, specHash
        );
        drawId = nextDrawId++;
        requestId = tapeRng.createRequest(
            organizerCommit,
            ctx,
            specHash,
            revealBlock,
            beaconRound,
            cpu,
            circuitId,
            msg.sender
        );

        Draw storage d = _draws[drawId];
        d.organizer = msg.sender;
        d.requestId = requestId;
        d.participantsRoot = participantsRoot;
        d.participantCount = participantCount;
        d.winnerCount = winnerCount;
        d.prizeSpecHash = prizeSpecHash;
        d.specHash = specHash;
        d.organizerCommit = organizerCommit;
        d.revealBlock = revealBlock;
        d.beaconRound = beaconRound;
        d.status = DrawStatus.Created;

        emit DrawCreated(
            drawId,
            requestId,
            msg.sender,
            participantsRoot,
            participantCount,
            winnerCount,
            prizeSpecHash,
            specHash
        );
    }

    function _finalizeRequest(uint256 requestId, bytes calldata beaconProof)
        internal
        returns (bytes32 finalSeed, bool usedFallback)
    {
        TapeRNG.Status status = tapeRng.requestStatus(requestId);
        if (status == TapeRNG.Status.Finalized) {
            return (tapeRng.requestFinalSeed(requestId), tapeRng.requestFallbackBlockhash(requestId));
        }

        uint64 revealBlock = tapeRng.requestRevealBlock(requestId);
        if (block.number > uint256(revealBlock) + 256) {
            return (tapeRng.finalizeExpired(requestId, beaconProof), true);
        }
        return (tapeRng.finalize(requestId, beaconProof), false);
    }

    function _contextHash(
        bytes32 participantsRoot,
        uint32 participantCount,
        uint32 winnerCount,
        bytes32 prizeSpecHash,
        bytes32 specHash
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                D_CONTEXT,
                block.chainid,
                address(this),
                participantsRoot,
                participantCount,
                winnerCount,
                prizeSpecHash,
                specHash
            )
        );
    }
}
