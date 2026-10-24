import { publicClient } from "../chain";
import { readDraw, readRequest } from "../contracts";
import {
  getDrawById,
  updateDraw,
  type DrawRow,
  type DrawStatus,
} from "../db";

export interface SyncResult {
  row: DrawRow;
  chainStatus: number;
  expired: boolean;
}

export async function syncDraw(row: DrawRow): Promise<SyncResult> {
  try {
    const draw = await readDraw(BigInt(row.draw_id));
    const request = await readRequest(BigInt(row.request_id));
    const blockNumber = await publicClient.getBlockNumber();
    const expired =
      draw.status < 3 && blockNumber > draw.revealBlock + 256n;

    const status: DrawStatus =
      draw.status === 3
        ? "finalized"
        : expired
          ? "expired"
          : draw.status === 2
            ? "revealed"
            : "created";

    const patch: Parameters<typeof updateDraw>[1] = { status };
    if (draw.status === 3) {
      patch.final_seed = draw.finalSeed;
      patch.block_hash = request.blockHash;
      patch.beacon_randomness = request.beaconRandomness;
      patch.circuit_mix = request.circuitMix;
      patch.winners_json = JSON.stringify(draw.winners);
      patch.prize_slots_json = JSON.stringify(draw.prizeSlots);
    }
    updateDraw(row.id, patch);
    const updated = getDrawById(row.id) ?? row;
    return { row: updated, chainStatus: draw.status, expired };
  } catch {
    return { row, chainStatus: 0, expired: false };
  }
}
