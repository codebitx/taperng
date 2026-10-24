import type { DrawRow, DrawStatus, DrawSummaryRow } from "./db";
import type { FlattenedPrize, Participant } from "./protocol";

export interface DrawSummary {
  id: string;
  name: string;
  participantCount: number;
  winnerCount: number;
  status: DrawStatus;
  createdAt: number;
}

export function serializeDrawSummary(row: DrawSummaryRow): DrawSummary {
  return {
    id: row.id,
    name: row.name,
    participantCount: row.participant_count,
    winnerCount: row.winner_count,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface DrawApi {
  id: string;
  chainId: number;
  lottery: string;
  drawId: string;
  requestId: string;
  name: string;
  locale: string;
  organizer: string;
  participantCount: number;
  participants: Participant[];
  participantsRoot: string;
  prizeSpecHash: string;
  specHash: string;
  canonicalSpec: unknown;
  prizes: FlattenedPrize[];
  winnerCount: number;
  status: DrawStatus;
  revealBlock: string;
  beaconRound: string;
  organizerSeed: string | null;
  txCreate: string | null;
  txFinalize: string | null;
  finalSeed: string | null;
  blockHash: string | null;
  beaconRandomness: string | null;
  circuitMix: string | null;
  winners: number[] | null;
  prizeSlots: number[] | null;
  createdAt: number;
  updatedAt: number;
}

export function serializeDraw(row: DrawRow): DrawApi {
  return {
    id: row.id,
    chainId: row.chain_id,
    lottery: row.lottery,
    drawId: row.draw_id,
    requestId: row.request_id,
    name: row.name,
    locale: row.locale,
    organizer: row.organizer,
    participantCount: row.participant_count,
    participants: JSON.parse(row.participants_json) as Participant[],
    participantsRoot: row.participants_root,
    prizeSpecHash: row.prize_spec_hash,
    specHash: row.spec_hash,
    canonicalSpec: JSON.parse(row.canonical_spec) as unknown,
    prizes: JSON.parse(row.prizes_json) as FlattenedPrize[],
    winnerCount: row.winner_count,
    status: row.status,
    revealBlock: row.reveal_block,
    beaconRound: row.beacon_round,
    organizerSeed: row.organizer_seed,
    txCreate: row.tx_create,
    txFinalize: row.tx_finalize,
    finalSeed: row.final_seed,
    blockHash: row.block_hash,
    beaconRandomness: row.beacon_randomness,
    circuitMix: row.circuit_mix,
    winners: row.winners_json
      ? (JSON.parse(row.winners_json) as number[])
      : null,
    prizeSlots: row.prize_slots_json
      ? (JSON.parse(row.prize_slots_json) as number[])
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
