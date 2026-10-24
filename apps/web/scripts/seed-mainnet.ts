/**
 * 一次性播种脚本：把主网(196) .mainnet-demo.json 里的三笔已 finalized draw (A/B/C)
 * 导入生产 SQLite，供首页 RecentDraws / 详情页展示。
 *
 * 依据 lib/protocol.ts：participants 由 (participantCount, locale) 确定性派生，
 * 因此用与创建时相同的 name/participantCount/prizes/chainId/lottery 重建
 * buildDraw 即可复现与链上一致的 root / specHash。
 * final_seed / winners 等由 syncDraw() 从链上实时读取回填。
 *
 * 注意：本脚本服务的这三笔历史 draw 创建于参与者为中文名（“参与者 00N”）时期；
 * 自 2026-10-21 起 buildDraw 已把参与者名改为统一 ASCII（“Participant 00N”）。
 * 这是一次性导入、已完成；请勿用改动后的 buildDraw 重跑本脚本——
 * 重建的 root 会与链上旧 draw(中文名) 失配导致校验失败。新 draw 的导入走发布流程。
 *
 * 用法（在 apps/web 下，需先设好 .env.local 指向主网；env 通过命令行传入，
 * 因为 tsx 不会自动加载 .env.local）：
 *   NEXT_PUBLIC_CHAIN_ID=196 \
 *   NEXT_PUBLIC_RPC_URL=https://rpc.xlayer.tech \
 *   NEXT_PUBLIC_LOTTERY_ADDRESS=0xb76AE4c893982E4D25ADC4888c8784369Fbd578D \
 *   NEXT_PUBLIC_TAPE_RNG_ADDRESS=0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce \
 *   NEXT_PUBLIC_BEACON_MODE=drand NEXT_PUBLIC_CIRCUIT_MODE=tapeout \
 *   DATABASE_URL=./data/taperng.sqlite \
 *   ../../packages/sdk/node_modules/.bin/tsx scripts/seed-mainnet.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDraw } from "../lib/protocol";
import { readDraw } from "../lib/contracts";
import {
  countDraws,
  getDrawByChain,
  insertDraw,
  updateDraw,
} from "../lib/db";
import { syncDraw } from "../lib/server/sync";

const CHAIN = 196;
const LOTTERY = "0xb76AE4c893982E4D25ADC4888c8784369Fbd578D" as const;

// 与 scripts/mainnet-demo.ts 的 DRAW_BY_VERSION 保持一致（奖品仅元数据展示）
const PRIZES: Record<
  "A" | "B" | "C",
  { name: string; quantity: number }[]
> = {
  A: [
    { name: "5 元红包", quantity: 3 },
    { name: "10 元红包", quantity: 2 },
    { name: "笔记本电脑", quantity: 1 },
  ],
  B: [
    { name: "下午茶", quantity: 2 },
    { name: "免加班卡", quantity: 1 },
  ],
  C: [
    { name: "现金红包", quantity: 2 },
    { name: "徽章礼盒", quantity: 2 },
  ],
};

type Record_ = {
  name: string;
  participantCount: number;
  prizeSpecHash: string;
  specHash: string;
  winnerCount: number;
  seed: string;
  drawId: string;
  requestId: string;
  revealBlock: string;
  beaconRound: string;
  beaconTime: number;
  createTx: string;
  finalizeTx?: string;
};

async function main() {
  const path = resolve(__dirname, "..", ".mainnet-demo.json");
  const all = JSON.parse(readFileSync(path, "utf8")) as Record<string, Record_>;

  for (const v of ["A", "B", "C"] as const) {
    const rec = all[v];
    if (!rec) {
      console.log(`[${v}] 无记录，跳过`);
      continue;
    }
    if (getDrawByChain(CHAIN, rec.drawId)) {
      console.log(`[${v}] drawId=${rec.drawId} 已存在，跳过`);
      continue;
    }

    const built = buildDraw({
      name: rec.name,
      participantCount: rec.participantCount,
      prizes: PRIZES[v],
      locale: "zh",
      chainId: CHAIN,
      lottery: LOTTERY,
    });

    // 校验重建输入与链上记录一致（.json 里保存的 prizeSpecHash/specHash）
    if (built.prizeSpecHash.toLowerCase() !== rec.prizeSpecHash.toLowerCase()) {
      throw new Error(`[${v}] prizeSpecHash 重建不一致`);
    }
    if (built.specHash.toLowerCase() !== rec.specHash.toLowerCase()) {
      throw new Error(`[${v}] specHash 重建不一致`);
    }

    const draw = await readDraw(BigInt(rec.drawId)); // 取链上 organizer
    const row = insertDraw({
      chainId: CHAIN,
      lottery: LOTTERY,
      drawId: String(rec.drawId),
      requestId: String(rec.requestId),
      name: rec.name,
      locale: "zh",
      organizer: draw.organizer,
      participantCount: rec.participantCount,
      participants: built.participants,
      participantsRoot: built.participantsRoot,
      prizeSpecHash: built.prizeSpecHash,
      specHash: built.specHash,
      canonicalSpec: built.canonicalSpec,
      prizes: built.prizes,
      winnerCount: built.winnerCount,
      status: "finalized",
      revealBlock: String(rec.revealBlock),
      beaconRound: String(rec.beaconRound),
      organizerSeed: rec.seed,
      txCreate: rec.createTx,
    });
    if (rec.finalizeTx) updateDraw(row.id, { tx_finalize: rec.finalizeTx });

    const res = await syncDraw(row); // 从链上拉 finalSeed / blockHash / winners
    const nWin = res.row.winners_json
      ? (JSON.parse(res.row.winners_json) as unknown[]).length
      : "?";
    console.log(
      `[${v}] 已导入 drawId=${rec.drawId} requestId=${rec.requestId} ` +
        `status=${res.row.status} winners=${nWin}`,
    );
  }

  console.log("导入完成，当前库 draw 数:", countDraws());
}

main().catch((e) => {
  console.error("seed 失败:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});