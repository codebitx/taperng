import { NextResponse } from "next/server";
import { isHash, type Hex } from "viem";
import { buildDraw, type Locale, type PrizeInput } from "@/lib/protocol";
import { chainId, lotteryAddress } from "@/lib/config";
import { waitForReceipt } from "@/lib/chain";
import {
  parseDrawCreated,
  readDraw,
  readRequest,
  type Draw,
  type RequestState,
} from "@/lib/contracts";
import {
  countDraws,
  getDrawByChain,
  insertDraw,
  listDraws,
  type DrawStatus,
} from "@/lib/db";
import { serializeDraw, serializeDrawSummary } from "@/lib/serialize";

export const runtime = "nodejs";

interface PublishBody {
  txHash: string;
  name: string;
  locale: Locale;
  participantCount: number;
  prizes: PrizeInput[];
  seed: string;
  revealBlock: string;
  beaconRound: string;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * X Layer 的 Flashblock 预确认会先返回 receipt，而 canonical 状态可能尚未应用
 * 该交易。此时 getDraw / getRequest 对不存在的 id 返回全零 struct（合约是
 * mapping 默认值，不会 revert），若直接校验会把一次合法发布误判成
 * “Participants root does not match”。这里短暂重试最新状态，直到可见。
 * 不固定 receipt.blockNumber：预确认块与 canonical 同高但哈希可能不同。
 */
async function readWhenVisible(
  drawId: bigint,
  requestId: bigint,
): Promise<{ draw?: Draw; state?: RequestState }> {
  const deadline = Date.now() + 20_000;
  let last: { draw?: Draw; state?: RequestState } = {};
  while (Date.now() < deadline) {
    try {
      const [draw, state] = await Promise.all([
        readDraw(drawId),
        readRequest(requestId),
      ]);
      last = { draw, state };
      const drawVisible =
        draw.participantCount > 0 && draw.participantsRoot !== ZERO_ROOT;
      const requestVisible = state.organizerSeed !== ZERO_ROOT;
      if (drawVisible && requestVisible) return { draw, state };
    } catch {
      // 节点尚未有该区块/状态，继续重试。
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isInteger(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  // 多取一条用于判断是否还有下一页，省掉额外查询。
  const rows = listDraws(limit + 1, offset);
  return NextResponse.json({
    draws: rows.slice(0, limit).map(serializeDrawSummary),
    limit,
    offset,
    total: countDraws(),
    hasMore: rows.length > limit,
  });
}

export async function POST(request: Request) {
  if (!lotteryAddress) {
    return fail("LotteryDemo address is not configured", 500);
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return fail("Invalid JSON body");
  }

  if (!body.txHash || !isHash(body.txHash)) return fail("Invalid txHash");
  if (!body.name || typeof body.name !== "string") return fail("Invalid name");
  if (!Number.isInteger(body.participantCount)) {
    return fail("Invalid participantCount");
  }
  if (!Array.isArray(body.prizes)) return fail("Invalid prizes");
  if (!body.seed || !isHash(body.seed)) return fail("Invalid seed");
  if (!body.revealBlock || !body.beaconRound) {
    return fail("Missing revealBlock or beaconRound");
  }

  let built;
  try {
    built = buildDraw({
      name: body.name,
      participantCount: body.participantCount,
      prizes: body.prizes,
      locale: body.locale === "zh" ? "zh" : "en",
      chainId,
      lottery: lotteryAddress,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid draw");
  }

  let revealBlock: bigint;
  let beaconRound: bigint;
  try {
    revealBlock = BigInt(body.revealBlock);
    beaconRound = BigInt(body.beaconRound);
  } catch {
    return fail("Invalid block/round");
  }

  try {
    const receipt = await waitForReceipt(body.txHash as Hex, {
      timeoutMs: 60_000,
    });
    if (receipt.status !== "success") return fail("Transaction reverted");

    const created = parseDrawCreated(receipt);
    if (!created) return fail("DrawCreated event not found");

    const existing = getDrawByChain(
      chainId,
      created.drawId.toString(),
    );
    if (existing) {
      return NextResponse.json({
        draw: serializeDraw(existing),
        duplicate: true,
      });
    }

    const { draw, state } = await readWhenVisible(
      created.drawId,
      created.requestId,
    );
    if (!draw || !state || draw.participantCount === 0) {
      // 交易已确认但链上状态暂不可见：不要误报成表单不一致。
      return fail(
        "On-chain draw is not readable yet; wait a moment and retry",
        503,
      );
    }

    // 组织者以链上 getDraw.organizer 为准。不能与 receipt.from 硬比对：
    // 智能账户(AA)钱包下 receipt.from 是执行器地址，而 organizer 是用户智能钱包地址，
    // 二者必然不同（EOA 直签才相等）。其余基于链上 state 的校验仍保留。
    if (
      draw.participantsRoot.toLowerCase() !==
      built.participantsRoot.toLowerCase()
    ) {
      return fail("Participants root does not match the form");
    }
    if (draw.specHash.toLowerCase() !== built.specHash.toLowerCase()) {
      return fail("Spec hash does not match the form");
    }
    if (
      draw.prizeSpecHash.toLowerCase() !==
      built.prizeSpecHash.toLowerCase()
    ) {
      return fail("Prize hash does not match the form");
    }
    if (draw.participantCount !== body.participantCount) {
      return fail("Participant count does not match");
    }
    if (draw.winnerCount !== built.winnerCount) {
      return fail("Winner count does not match");
    }
    if (draw.revealBlock !== revealBlock) {
      return fail("Reveal block does not match");
    }
    if (draw.beaconRound !== beaconRound) {
      return fail("Beacon round does not match");
    }
    if (
      state.seedMissing ||
      state.organizerSeed.toLowerCase() !== body.seed.toLowerCase()
    ) {
      return fail("Organizer seed was not revealed as expected");
    }

    const status: DrawStatus =
      draw.status === 3
        ? "finalized"
        : draw.status === 2
          ? "revealed"
          : "created";

    const row = insertDraw({
      chainId,
      lottery: lotteryAddress,
      drawId: created.drawId.toString(),
      requestId: created.requestId.toString(),
      name: body.name,
      locale: body.locale === "zh" ? "zh" : "en",
      organizer: draw.organizer,
      participantCount: draw.participantCount,
      participants: built.participants,
      participantsRoot: built.participantsRoot,
      prizeSpecHash: built.prizeSpecHash,
      specHash: built.specHash,
      canonicalSpec: built.canonicalSpec,
      prizes: built.prizes,
      winnerCount: built.winnerCount,
      status,
      revealBlock: draw.revealBlock.toString(),
      beaconRound: draw.beaconRound.toString(),
      organizerSeed: state.organizerSeed,
      // AA 钱包下钱包返回的可能是 userOp hash；以真实收据的交易哈希入库。
      txCreate: receipt.transactionHash,
    });

    return NextResponse.json({ draw: serializeDraw(row) }, { status: 201 });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to verify transaction",
      500,
    );
  }
}
