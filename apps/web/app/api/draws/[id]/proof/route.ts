import { NextResponse } from "next/server";
import { createTapeRNG } from "taperng-sdk";
import { chainId, lotteryAddress, tapeRngAddress } from "@/lib/config";
import { publicClient } from "@/lib/chain";
import { readDraw, readRequest } from "@/lib/contracts";
import { getDrawById } from "@/lib/db";
import { lotteryChecks, lotteryContextHash } from "@/lib/server/lottery";

export const runtime = "nodejs";

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = jsonSafe(item);
    }
    return output;
  }
  return value;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!lotteryAddress || !tapeRngAddress) {
    return NextResponse.json(
      { error: "Contracts are not configured" },
      { status: 500 },
    );
  }
  const { id } = await context.params;
  const row = getDrawById(id);
  if (!row) {
    return NextResponse.json({ error: "Draw not found" }, { status: 404 });
  }

  try {
    const draw = await readDraw(BigInt(row.draw_id));
    const request = await readRequest(BigInt(row.request_id));
    const requestId = BigInt(row.request_id);

    // 核心随机数 proof 由 taperng-sdk 生成（含 circuit 输出、netlist、beacon）。
    const rng = createTapeRNG({
      publicClient,
      addresses: { tapeRng: tapeRngAddress },
      chainId,
    });
    const core = await rng.getProof(requestId);

    // 抽奖领域派生校验：draw context 绑定 + finalSeed 名次核对。
    const drawContext = lotteryContextHash(chainId, lotteryAddress, draw);
    const draws = lotteryChecks({
      finalSeed: core.derivation.finalSeed,
      participantCount: draw.participantCount,
      winnerCount: draw.winnerCount,
      winners: draw.winners,
      prizeSlots: draw.prizeSlots,
    });
    const derivation: Record<string, unknown> & {
      checks: { name: string; ok: boolean; detail?: string }[];
    } = {
      ...(jsonSafe(core.derivation) as Record<string, unknown>),
      checks: [
        {
          name: "draw context",
          ok: drawContext.toLowerCase() === request.contextHash.toLowerCase(),
        },
        ...(core.derivation.checks as { name: string; ok: boolean; detail?: string }[]),
        ...(draws as { name: string; ok: boolean; detail?: string }[]),
      ],
    };
    derivation.ok = derivation.checks.every((c) => c.ok);

    const proof = {
      ok: derivation.ok,
      toolVersion: "0.1.0-web",
      version: core.version,
      chainId,
      requestId: core.requestId,
      contracts: {
        tapeRng: core.contracts.tapeRng,
        lottery: lotteryAddress,
        cpu: core.contracts.cpu,
      },
      draw: {
        drawId: row.draw_id,
        requestId: row.request_id,
        organizer: draw.organizer,
        status: draw.status,
        revealBlock: draw.revealBlock.toString(),
        beaconRound: draw.beaconRound.toString(),
        participantsRoot: draw.participantsRoot,
        participantCount: draw.participantCount,
        winnerCount: draw.winnerCount,
        prizeSpecHash: draw.prizeSpecHash,
        specHash: draw.specHash,
        contextHash: request.contextHash,
        fallbackUsed: draw.fallbackUsed,
        finalSeed: draw.finalSeed,
        winners: draw.winners,
        prizeSlots: draw.prizeSlots,
      },
      context: core.context,
      spec: JSON.parse(row.canonical_spec) as unknown,
      participants: JSON.parse(row.participants_json) as unknown,
      prizes: JSON.parse(row.prizes_json) as unknown,
      request: jsonSafe(request),
      circuit: {
        ...core.circuit,
        gateCount: request.gateCount,
      },
      beacon: core.beacon
        ? { ...core.beacon, onChainVerified: request.beaconUsed }
        : null,
      derivation,
      result: {
        winners: draw.winners,
        prizeSlots: draw.prizeSlots,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ proof });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build proof",
      },
      { status: 500 },
    );
  }
}