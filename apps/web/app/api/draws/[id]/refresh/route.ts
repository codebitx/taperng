import { NextResponse } from "next/server";
import { isHash } from "viem";
import { getDrawById, updateDraw } from "@/lib/db";
import { serializeDraw } from "@/lib/serialize";
import { syncDraw } from "@/lib/server/sync";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const row = getDrawById(id);
  if (!row) {
    return NextResponse.json({ error: "Draw not found" }, { status: 404 });
  }

  let txFinalize: string | undefined;
  try {
    const body = (await request.json()) as { txFinalize?: string };
    if (body.txFinalize && isHash(body.txFinalize)) {
      txFinalize = body.txFinalize;
    }
  } catch {
    // Body is optional.
  }

  if (txFinalize) updateDraw(id, { tx_finalize: txFinalize });
  const synced = await syncDraw(getDrawById(id) ?? row);
  return NextResponse.json({
    draw: serializeDraw(synced.row),
    expired: synced.expired,
  });
}
