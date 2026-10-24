import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

export type DrawStatus = "created" | "revealed" | "finalized" | "expired";

export interface DrawRow {
  id: string;
  chain_id: number;
  lottery: string;
  draw_id: string;
  request_id: string;
  name: string;
  locale: string;
  organizer: string;
  participant_count: number;
  participants_json: string;
  participants_root: string;
  prize_spec_hash: string;
  spec_hash: string;
  canonical_spec: string;
  prizes_json: string;
  winner_count: number;
  status: DrawStatus;
  reveal_block: string;
  beacon_round: string;
  organizer_seed: string | null;
  tx_create: string | null;
  tx_finalize: string | null;
  final_seed: string | null;
  block_hash: string | null;
  beacon_randomness: string | null;
  circuit_mix: string | null;
  winners_json: string | null;
  prize_slots_json: string | null;
  created_at: number;
  updated_at: number;
}

let db: DatabaseSync | undefined;

function databasePath(): string {
  const value = process.env.DATABASE_URL ?? "./data/taperng.sqlite";
  return isAbsolute(value) ? value : join(process.cwd(), value);
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS draws (
      id TEXT PRIMARY KEY,
      chain_id INTEGER NOT NULL,
      lottery TEXT NOT NULL,
      draw_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      name TEXT NOT NULL,
      locale TEXT NOT NULL,
      organizer TEXT NOT NULL,
      participant_count INTEGER NOT NULL,
      participants_json TEXT NOT NULL,
      participants_root TEXT NOT NULL,
      prize_spec_hash TEXT NOT NULL,
      spec_hash TEXT NOT NULL,
      canonical_spec TEXT NOT NULL,
      prizes_json TEXT NOT NULL,
      winner_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      reveal_block TEXT NOT NULL,
      beacon_round TEXT NOT NULL,
      organizer_seed TEXT,
      tx_create TEXT,
      tx_finalize TEXT,
      final_seed TEXT,
      block_hash TEXT,
      beacon_randomness TEXT,
      circuit_mix TEXT,
      winners_json TEXT,
      prize_slots_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS draws_chain_draw
      ON draws(chain_id, draw_id);
    CREATE INDEX IF NOT EXISTS draws_created ON draws(created_at DESC);
  `);
  return db;
}

export interface NewDrawInput {
  chainId: number;
  lottery: string;
  drawId: string;
  requestId: string;
  name: string;
  locale: string;
  organizer: string;
  participantCount: number;
  participants: unknown;
  participantsRoot: string;
  prizeSpecHash: string;
  specHash: string;
  canonicalSpec: string;
  prizes: unknown;
  winnerCount: number;
  status: DrawStatus;
  revealBlock: string;
  beaconRound: string;
  organizerSeed?: string | null;
  txCreate?: string | null;
}

export function insertDraw(input: NewDrawInput): DrawRow {
  const now = Date.now();
  const row: DrawRow = {
    id: randomUUID(),
    chain_id: input.chainId,
    lottery: input.lottery,
    draw_id: input.drawId,
    request_id: input.requestId,
    name: input.name,
    locale: input.locale,
    organizer: input.organizer,
    participant_count: input.participantCount,
    participants_json: JSON.stringify(input.participants),
    participants_root: input.participantsRoot,
    prize_spec_hash: input.prizeSpecHash,
    spec_hash: input.specHash,
    canonical_spec: input.canonicalSpec,
    prizes_json: JSON.stringify(input.prizes),
    winner_count: input.winnerCount,
    status: input.status,
    reveal_block: input.revealBlock,
    beacon_round: input.beaconRound,
    organizer_seed: input.organizerSeed ?? null,
    tx_create: input.txCreate ?? null,
    tx_finalize: null,
    final_seed: null,
    block_hash: null,
    beacon_randomness: null,
    circuit_mix: null,
    winners_json: null,
    prize_slots_json: null,
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO draws (
        id, chain_id, lottery, draw_id, request_id, name, locale, organizer,
        participant_count, participants_json, participants_root, prize_spec_hash,
        spec_hash, canonical_spec, prizes_json, winner_count, status,
        reveal_block, beacon_round, organizer_seed, tx_create, tx_finalize,
        final_seed, block_hash, beacon_randomness, circuit_mix, winners_json,
        prize_slots_json, created_at, updated_at
      ) VALUES (
        @id, @chain_id, @lottery, @draw_id, @request_id, @name, @locale, @organizer,
        @participant_count, @participants_json, @participants_root, @prize_spec_hash,
        @spec_hash, @canonical_spec, @prizes_json, @winner_count, @status,
        @reveal_block, @beacon_round, @organizer_seed, @tx_create, @tx_finalize,
        @final_seed, @block_hash, @beacon_randomness, @circuit_mix, @winners_json,
        @prize_slots_json, @created_at, @updated_at
      )`,
    )
    .run(row as unknown as Record<string, string | number | null>);
  return row;
}

/** 列表只需要摘要字段，避免把 participants_json / canonical_spec 等大字段读出。 */
export interface DrawSummaryRow {
  id: string;
  name: string;
  participant_count: number;
  winner_count: number;
  status: DrawStatus;
  created_at: number;
}

export function listDraws(limit = 5, offset = 0): DrawSummaryRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, participant_count, winner_count, status, created_at
       FROM draws
       ORDER BY created_at DESC, CAST(draw_id AS INTEGER) DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as unknown as DrawSummaryRow[];
}

export function countDraws(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM draws")
    .get() as { n: number } | undefined;
  return row?.n ?? 0;
}

export function getDrawById(id: string): DrawRow | undefined {
  return getDb()
    .prepare("SELECT * FROM draws WHERE id = ?")
    .get(id) as unknown as DrawRow | undefined;
}

export function getDrawByChain(
  chainId: number,
  drawId: string,
): DrawRow | undefined {
  return getDb()
    .prepare("SELECT * FROM draws WHERE chain_id = ? AND draw_id = ?")
    .get(chainId, drawId) as unknown as DrawRow | undefined;
}

const UPDATABLE = new Set<keyof DrawRow>([
  "status",
  "tx_create",
  "tx_finalize",
  "organizer_seed",
  "final_seed",
  "block_hash",
  "beacon_randomness",
  "circuit_mix",
  "winners_json",
  "prize_slots_json",
  "updated_at",
]);

export function updateDraw(
  id: string,
  patch: Partial<Pick<DrawRow, "status" | "tx_create" | "tx_finalize" | "organizer_seed" | "final_seed" | "block_hash" | "beacon_randomness" | "circuit_mix" | "winners_json" | "prize_slots_json">>,
): void {
  const entries = Object.entries(patch).filter(([key]) =>
    UPDATABLE.has(key as keyof DrawRow),
  );
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = @${key}`).join(", ");
  getDb()
    .prepare(`UPDATE draws SET ${assignments}, updated_at = @updated_at WHERE id = @id`)
    .run({
      ...Object.fromEntries(entries),
      updated_at: Date.now(),
      id,
    });
}
