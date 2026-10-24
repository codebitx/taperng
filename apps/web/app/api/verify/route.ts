import { NextResponse } from "next/server";
import { createTapeRNG } from "taperng-sdk";
import { chainId, lotteryAddress, tapeRngAddress } from "@/lib/config";
import { publicClient } from "@/lib/chain";
import { readDraw, readRequest } from "@/lib/contracts";
import { getDrawById } from "@/lib/db";
import {
  lotteryChecks,
  lotteryContextHash,
} from "@/lib/server/lottery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!lotteryAddress || !tapeRngAddress) {
    return NextResponse.json(
      { error: "Contracts are not configured" },
      { status: 500 },
    );
  }
  let id: string | undefined;
  try {
    const body = (await request.json()) as { id?: string };
    id = body.id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Missing draw id" }, { status: 400 });

  const row = getDrawById(id);
  if (!row) {
    return NextResponse.json({ error: "Draw not found" }, { status: 404 });
  }

  try {
    const draw = await readDraw(BigInt(row.draw_id));
    const requestState = await readRequest(BigInt(row.request_id));

    // 核心随机数校验：commit/preSeed/circuit/finalSeed —— 复用 taperng-sdk。
    const rng = createTapeRNG({
      publicClient,
      addresses: { tapeRng: tapeRngAddress },
      chainId,
    });
    const proof = await rng.getProof(BigInt(row.request_id));

    // 抽奖领域校验：draw 的 context 必须绑定链上请求 + finalSeed 派生名次正确。
    const drawContext = lotteryContextHash(chainId, lotteryAddress, draw);
    const draws = lotteryChecks({
      finalSeed: proof.derivation.finalSeed,
      participantCount: draw.participantCount,
      winnerCount: draw.winnerCount,
      winners: draw.winners,
      prizeSlots: draw.prizeSlots,
    });

    const checks = [
      {
        name: "draw context",
        ok:
          drawContext.toLowerCase() ===
          requestState.contextHash.toLowerCase(),
      },
      ...proof.derivation.checks,
      ...draws,
    ];
    return NextResponse.json({
      ok: checks.every((check) => check.ok),
      checks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Verification failed",
      },
      { status: 500 },
    );
  }
}