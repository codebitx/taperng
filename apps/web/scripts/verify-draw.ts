/**
 * 主网抽奖端到端验证脚本：对已创建/已开奖的 draw 复核——
 *  核心随机数（SDK createTapeRNG().getProof/verifyProof，request-centered）
 *  + 抽奖领域派生（draw context 绑定 + finalSeed 名次核对，见 lib/server/lottery）。
 *
 * 与 Web proof 页同源（复用同一个 taperng-sdk 与 lib/server/lottery），可离线核对。
 *
 * 用法（在 apps/web 下）：
 *   tsx scripts/verify-draw.ts 4               # 验证单个 draw
 *   tsx scripts/verify-draw.ts 4 0 1 2         # 一次性验证多笔
 *   tsx scripts/verify-draw.ts 4 --json        # 追加完整 JSON proof（request+circuit+beacon）到 stdout
 *   tsx scripts/verify-draw.ts 4 --tx 0x创建交易 [--tx 0x开奖交易]
 *                                              # 解析收据事件，与 getDraw/getRequest 逐字段对比
 *
 * 环境覆盖（可选）：
 *   MAINNET_RPC  默认 https://rpc.xlayer.tech
 *   MAINNET_LOTTERY 默认 0xb76AE4c893982E4D25ADC4888c8784369Fbd578D
 *   MAINNET_TAPERNG 默认 0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce
 * 注意：只读链上状态 + 读 drand，不会发送交易，执行后无链上副作用。
 */
import {
  createPublicClient,
  defineChain,
  http,
  parseEventLogs,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { createTapeRNG } from "../../../packages/sdk/src/client";
import { lotteryAbi, tapeRngAbi } from "../lib/contracts";
import {
  lotteryChecks,
  lotteryContextHash,
} from "../lib/server/lottery";

const RPC = process.env.MAINNET_RPC ?? "https://rpc.xlayer.tech";
const LOTTERY = (process.env.MAINNET_LOTTERY ??
  "0xb76AE4c893982E4D25ADC4888c8784369Fbd578D") as `0x${string}`;
const TAPERNG = (process.env.MAINNET_TAPERNG ??
  "0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce") as `0x${string}`;

const chain = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pc = createPublicClient({ chain, transport: http() });
const rng = createTapeRNG({
  publicClient: pc,
  chainId: 196,
  chain,
  beaconMode: "drand",
  circuitMode: "tapeout",
  addresses: { tapeRng: TAPERNG },
});

interface CircuitInfo {
  mode?: string;
  output?: unknown;
  netlist?: string;
  input?: unknown;
}

interface Lotterydraw {
  requestId: bigint;
  organizer: Hex;
  participantsRoot: Hex;
  participantCount: number;
  winnerCount: number;
  prizeSpecHash: Hex;
  specHash: Hex;
  status: number;
  fallbackUsed: boolean;
  finalSeed: Hex;
  winners: number[];
  prizeSlots: number[];
}

/** 读取抽奖侧数据（LotteryDemo.getDraw）并归一化数字/数组字段。 */
async function readDraw(drawId: bigint): Promise<Lotterydraw> {
  const raw = (await pc.readContract({
    address: LOTTERY,
    abi: lotteryAbi,
    functionName: "getDraw",
    args: [drawId],
  })) as unknown as Record<string, unknown>;
  return {
    requestId: BigInt(raw.requestId as string),
    organizer: raw.organizer as Hex,
    participantsRoot: raw.participantsRoot as Hex,
    participantCount: Number(raw.participantCount),
    winnerCount: Number(raw.winnerCount),
    prizeSpecHash: raw.prizeSpecHash as Hex,
    specHash: raw.specHash as Hex,
    status: Number(raw.status),
    fallbackUsed: Boolean(raw.fallbackUsed),
    finalSeed: raw.finalSeed as Hex,
    winners: (raw.winners as unknown[]).map(Number),
    prizeSlots: (raw.prizeSlots as unknown[]).map(Number),
  };
}

interface ParsedEvent {
  name: string;
  args: Record<string, unknown>;
  txHash: Hex;
}

interface EventCheck {
  ok: boolean;
  name: string;
  detail?: string;
}

function parseReceiptEvents(receipt: TransactionReceipt): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const abi of [lotteryAbi, tapeRngAbi]) {
    const logs = parseEventLogs({ abi, logs: receipt.logs });
    for (const log of logs) {
      events.push({
        name: log.eventName,
        args: log.args as Record<string, unknown>,
        txHash: receipt.transactionHash,
      });
    }
  }
  return events;
}

const same = (a: unknown, b: unknown) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const sameArray = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const short = (hash: Hex) => `${hash.slice(0, 10)}…`;

function verifyEvents(drawId: bigint, draw: Lotterydraw, events: ParsedEvent[]): EventCheck[] {
  const checks: EventCheck[] = [];
  const find = (name: string, field: string, value: unknown) =>
    events.find(
      (event) =>
        event.name === name && String(event.args[field]) === String(value),
    );

  const created = find("DrawCreated", "drawId", drawId);
  if (created) {
    const fields = [
      "requestId",
      "organizer",
      "participantsRoot",
      "participantCount",
      "winnerCount",
      "prizeSpecHash",
      "specHash",
    ];
    const mismatch = fields.filter((f) => !same(created.args[f], (draw as unknown as Record<string, unknown>)[f]));
    checks.push({
      ok: mismatch.length === 0,
      name: "event: DrawCreated",
      detail:
        mismatch.length === 0
          ? `tx ${short(created.txHash)} · ${fields.length} 个字段与 getDraw 一致`
          : `不一致: ${mismatch.join(", ")}`,
    });
  }

  const revealed = find("DrawRevealed", "drawId", drawId);
  if (revealed) {
    checks.push({
      ok: true,
      name: "event: DrawRevealed",
      detail: `tx ${short(revealed.txHash)} · seed ${same(revealed.args.seed, String(revealed.args.seed)) ? "存在" : ""}`,
    });
  }

  if (checks.length === 0) {
    checks.push({
      ok: false,
      name: "event: 匹配",
      detail: "提供的交易收据中没有该 draw 的事件",
    });
  }
  return checks;
}

async function verifyDraw(drawId: bigint, asJson: boolean, events: ParsedEvent[]) {
  const draw = await readDraw(drawId);
  const requestId = draw.requestId;

  // 核心随机数证明（request-centered，SDK）。
  const proof = await rng.getProof(requestId);
  const req = proof.request as Record<string, unknown>;
  const circuit = proof.circuit as CircuitInfo | undefined;

  if (asJson) {
    console.log(JSON.stringify({ drawId, draw: { ...draw, requestId: requestId.toString() }, proof }, null, 2));
    return;
  }

  console.log(`===== draw#${drawId} · status=${draw.status} · requestId=${requestId} =====`);
  console.log("-- 合约逻辑(request) --");
  for (const k of ["status", "seedMissing", "fallbackBlockhash", "beaconUsed", "circuitUsed", "beaconRound", "beaconRandomness", "circuitMix", "finalSeed"]) {
    const v = String(req[k]).slice(0, 66);
    console.log(`   ${k.padEnd(18)} ${v}`);
  }
  console.log("-- 电路(circuit) --");
  console.log(`   cpu=${String(req.cpu)} circuitId=${String(req.circuitId)} nIn=${String(req.nIn)} netlistHash=${String(req.netlistHash).slice(0, 18)}`);
  console.log(`   mode=${circuit?.mode} netlistBytes=${circuit?.netlist?.length ?? 0} out=${String(circuit?.output).slice(0, 18)}`);

  // 核心校验：SDK verifyProof。
  console.log("-- verifyProof(核心) --");
  const res = rng.verifyProof(proof);
  for (const c of res.checks) {
    console.log(`   [${c.ok ? "PASS" : "FAIL"}] ${c.name}${c.detail ? " :: " + c.detail : ""}`);
  }

  // 抽奖领域校验：draw context 绑定 + finalSeed 名次。
  console.log("-- 抽奖领域(consumer) --");
  const contextOk =
    lotteryContextHash(196, LOTTERY, draw).toLowerCase() ===
    String(req.contextHash).toLowerCase();
  const winnerChecks = lotteryChecks({
    finalSeed: proof.derivation.finalSeed,
    participantCount: draw.participantCount,
    winnerCount: draw.winnerCount,
    winners: draw.winners,
    prizeSlots: draw.prizeSlots,
  });
  const domainChecks = [
    { name: "draw context", ok: contextOk },
    ...winnerChecks,
  ];
  for (const c of domainChecks) {
    console.log(`   [${c.ok ? "PASS" : "FAIL"}] ${c.name}`);
  }

  const allOk = res.ok && domainChecks.every((c) => c.ok);
  console.log(`   结果: ${allOk ? "通过 ✅" : "失败 ❌"}  (核心 ${res.checks.filter((c) => c.ok).length}/${res.checks.length} + 领域 ${domainChecks.filter((c) => c.ok).length}/${domainChecks.length})`);
  if (!allOk) process.exitCode = 1;

  if (events.length > 0) {
    console.log("-- 事件(event) --");
    const eventChecks = verifyEvents(drawId, draw, events);
    for (const c of eventChecks) {
      console.log(`   [${c.ok ? "PASS" : "FAIL"}] ${c.name}${c.detail ? " :: " + c.detail : ""}`);
    }
    if (eventChecks.some((c) => !c.ok)) process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const txHashes: Hex[] = [];
  const ids: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--json") continue;
    if (arg === "--tx") {
      const value = args[i + 1];
      if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
        console.error("--tx 需要一个 32 字节交易哈希");
        process.exit(1);
      }
      txHashes.push(value as Hex);
      i += 1;
      continue;
    }
    ids.push(arg);
  }

  if (ids.length === 0) {
    console.error(
      "用法: tsx scripts/verify-draw.ts <drawId> [drawId...] [--json] [--tx <txHash> ...]",
    );
    process.exit(1);
  }

  const events: ParsedEvent[] = [];
  for (const hash of txHashes) {
    const receipt = await pc
      .getTransactionReceipt({ hash })
      .catch(() => undefined);
    if (!receipt) {
      console.error(`未找到交易收据: ${hash}`);
      process.exit(1);
    }
    if (receipt.status !== "success") {
      console.error(`交易执行失败: ${hash}`);
      process.exit(1);
    }
    events.push(...parseReceiptEvents(receipt));
  }

  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      console.error(`无效 drawId: ${id}`);
      process.exit(1);
    }
    await verifyDraw(BigInt(id), asJson, events);
  }
}

main().catch((e) => {
  console.error("验证失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});