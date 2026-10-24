/**
 * X Layer 主网(196) 抽奖演示脚本：创建 2 笔不同抽奖并在 revealBlock 后 finalize。
 *
 * 注意：X Layer 公共 RPC 拒绝 eth_sendTransaction，本脚本改用
 * 手动签名 + eth_sendRawTransaction 广播（与 cast 部署同路径）。
 *
 * 用法（在 apps/web 下）：
 *   MAINNET_VERSION=A ../../packages/sdk/node_modules/.bin/tsx scripts/mainnet-demo.ts create
 *   ...等待 revealBlock 挖到 + drand 发布（~2 分钟）...
 *   MAINNET_VERSION=A ../../packages/sdk/node_modules/.bin/tsx scripts/mainnet-demo.ts finalize
 *   B 同理。
 *
 * 两笔抽奖（仅供前端 demo 展示，奖品仅元数据）：
 *   A：年会抽奖风格，20 人，6 个奖品槽
 *   B：团队下午茶抽奖，8 人，3 个奖品槽
 */
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lotteryAbi, tapeRngAbi } from "../lib/contracts";
import { fetchBeacon } from "../lib/drand";
import { buildDraw, randomSeed } from "../lib/protocol";

const RPC = process.env.MAINNET_RPC ?? "https://rpc.xlayer.tech";
const LOTTERY = (process.env.MAINNET_LOTTERY ??
  "0xb76AE4c893982E4D25ADC4888c8784369Fbd578D") as Address;
const TAPERNG = (process.env.MAINNET_TAPERNG ??
  "0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce") as Hex;
const VERSION = (process.env.MAINNET_VERSION ?? "A") as "A" | "B" | "C";

function readKey(): Hex {
  if (process.env.MAINNET_PK) return process.env.MAINNET_PK as Hex;
  const envPath = resolve(__dirname, "../../../contracts/.env");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.startsWith("PRIVATE_KEY="));
    if (line) return line.slice("PRIVATE_KEY=".length).trim() as Hex;
  }
  throw new Error("MAINNET_PK 未设置，且 ../contracts/.env 中无 PRIVATE_KEY");
}

const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const account = privateKeyToAccount(readKey());
const publicClient = createPublicClient({ chain: xlayer, transport: http(RPC) });

/** 手动签名 + raw 广播（X Layer 拒绝 eth_sendTransaction）。 */
async function sendRaw(to: Address, data: Hex, gasLimit?: bigint): Promise<Hex> {
  const nonce = await publicClient.getTransactionCount({ address: account.address });
  console.log(`sendRaw: nonce=${nonce}`);
  const gas = gasLimit ?? (await publicClient.estimateGas({ account: account.address, to, data }));
  console.log(`sendRaw: gas=${gas}`);
  const baseFee = await publicClient.getBlock({ blockTag: "latest" });
  const base = baseFee.baseFeePerGas ?? 0n;
  const maxPriorityFeePerGas = 1_000_000n; // 0.001 gwei
  const fee = (base + maxPriorityFeePerGas) * 2n;
  console.log(`sendRaw: base=${base} fee=${fee}`);
  const request = {
    to,
    data,
    value: 0n,
    chain: xlayer,
    account,
    nonce,
    gas,
    maxFeePerGas: fee,
    maxPriorityFeePerGas,
    chainId: xlayer.id,
    type: "eip1559" as const,
  };
  const serialized = await account.signTransaction(request);
  return publicClient.sendRawTransaction({ serializedTransaction: serialized });
}

const PRK = resolve(__dirname, "..", ".mainnet-demo.json");

interface DrawRecord {
  name: string;
  participantCount: number;
  prizeSpecHash: Hex;
  specHash: Hex;
  winnerCount: number;
  seed: Hex;
  drawId: string;
  requestId: string;
  revealBlock: string;
  beaconRound: string;
  beaconTime: number;
  createTx: string;
  finalizeTx?: string;
}
type State = { [v: string]: DrawRecord };

function loadState(): State {
  if (existsSync(PRK)) return JSON.parse(readFileSync(PRK, "utf8")) as State;
  return {};
}
function saveState(state: State) {
  writeFileSync(PRK, JSON.stringify(state, null, 2));
}

const DRAW_BY_VERSION: Record<"A" | "B" | "C", {
  name: string;
  participantCount: number;
  prizes: { name: string; quantity: number }[];
}> = {
  A: {
    name: "年会抽奖",
    participantCount: 20,
    prizes: [
      { name: "5 元红包", quantity: 3 },
      { name: "10 元红包", quantity: 2 },
      { name: "笔记本电脑", quantity: 1 },
    ],
  },
  B: {
    name: "团队下午茶抽奖",
    participantCount: 8,
    prizes: [
      { name: "下午茶", quantity: 2 },
      { name: "免加班卡", quantity: 1 },
    ],
  },
  C: {
    name: "产品发布抽奖",
    participantCount: 25,
    prizes: [
      { name: "现金红包", quantity: 2 },
      { name: "徽章礼盒", quantity: 2 },
    ],
  },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 与 SDK 保持一致的紧凑 beacon 计划：latest+22 round(≈66s)，reveal +10s，下界 20 块。
async function planBeacon(currentBlock: bigint, now = Math.floor(Date.now() / 1000)) {
  const latest = await fetchBeacon("latest");
  const beaconRound = latest.round + 22;
  const genesisTime = 1_692_803_367;
  const period = 3;
  const beaconTime = genesisTime + beaconRound * period;
  const revealBlock = currentBlock + BigInt(Math.max(20, beaconTime - now + 10));
  return { beaconRound, beaconTime, revealBlock };
}

async function actionCreate() {
  const cfg = DRAW_BY_VERSION[VERSION];
  if (!cfg) throw new Error(`unknown MAINNET_VERSION: ${VERSION}`);

  const built = buildDraw({
    name: cfg.name,
    participantCount: cfg.participantCount,
    prizes: cfg.prizes,
    locale: "zh",
    chainId: 196,
    lottery: LOTTERY,
  });
  console.log(`[${VERSION}] 参数已构造`, {
    name: cfg.name,
    participants: cfg.participantCount,
    winners: built.winnerCount,
    participantsRoot: built.participantsRoot,
    prizeSpecHash: built.prizeSpecHash,
    specHash: built.specHash,
  });

  const currentBlock = await publicClient.getBlockNumber();
  const plan = await planBeacon(currentBlock);
  const seed = randomSeed();
  console.log(
    `[${VERSION}] beaconRound=${plan.beaconRound} beaconTime=${plan.beaconTime} revealBlock=${plan.revealBlock}`,
  );

  const data = encodeFunctionData({
    abi: lotteryAbi,
    functionName: "createDrawAndReveal",
    args: [
      built.participantsRoot,
      cfg.participantCount,
      built.prizeSpecHash,
      built.specHash,
      built.winnerCount,
      plan.revealBlock,
      BigInt(plan.beaconRound),
      seed,
    ],
  });
  console.log(
    `[${VERSION}] args: root=${built.participantsRoot} pc=${cfg.participantCount} winner=${built.winnerCount} reveal=${plan.revealBlock} beacon=${plan.beaconRound}`,
  );
  const hash = await sendRaw(LOTTERY, data);
  console.log(`[${VERSION}] created tx=${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`[${VERSION}] 交易失败 status=${receipt.status} tx=${hash}`);
    process.exitCode = 1;
    return;
  }
  const events = parseEventLogs({
    abi: lotteryAbi,
    eventName: "DrawCreated",
    logs: receipt.logs,
  });
  const ev = events[0]?.args as { drawId?: bigint; requestId?: bigint };
  if (ev.drawId === undefined) throw new Error("DrawCreated 事件缺失");
  if (ev.requestId === undefined) throw new Error("DrawCreated 事件缺少 requestId");
  console.log(`[${VERSION}] drawId=${ev.drawId} requestId=${ev.requestId}`);

  const state = loadState();
  state[VERSION] = {
    name: cfg.name,
    participantCount: cfg.participantCount,
    prizeSpecHash: built.prizeSpecHash,
    specHash: built.specHash,
    winnerCount: built.winnerCount,
    seed,
    drawId: ev.drawId.toString(),
    requestId: ev.requestId.toString(),
    revealBlock: plan.revealBlock.toString(),
    beaconRound: String(plan.beaconRound),
    beaconTime: plan.beaconTime,
    createTx: hash,
  };
  saveState(state);
  const eta = Math.max(0, plan.beaconTime + 12 - Math.floor(Date.now() / 1000));
  console.log(`[${VERSION}] 已保存运行记录；预计 ~${Math.ceil(eta)}s 后 finalize`);
}

async function actionFinalize() {
  const state = loadState();
  const rec = state[VERSION];
  if (!rec) throw new Error(`没有 ${VERSION} 记录，先 create`);
  const drawId = BigInt(rec.drawId);
  const revealBlock = BigInt(rec.revealBlock);

  let block = await publicClient.getBlockNumber();
  let tries = 0;
  while (block < revealBlock) {
    if (tries % 10 === 0) {
      console.log(`[${VERSION}] waiting revealBlock ${revealBlock} (current ${block})...`);
    }
    await wait(5000);
    block = await publicClient.getBlockNumber();
    tries += 1;
  }
  console.log(`[${VERSION}] revealBlock reached ${block}`);

  const beaconRound = Number(rec.beaconRound);
  let beacon;
  for (let i = 0; i < 60; i++) {
    try {
      beacon = await fetchBeacon(beaconRound);
      break;
    } catch {
      await wait(5000);
    }
  }
  if (!beacon) throw new Error(`drand round ${beaconRound} 未发布`);
  console.log(`[${VERSION}] beacon round=${beacon.round}`);

  const data = encodeFunctionData({
    abi: lotteryAbi,
    functionName: "finalizeDraw",
    args: [drawId, beacon.signature],
  });
  // finalize 会执行真实 Keccak 电路（~3.5M gas）+ drand 验签；给足 gas
  const hash = await sendRaw(LOTTERY, data, 12_000_000n);
  console.log(`[${VERSION}] finalize tx=${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`[${VERSION}] finalize 失败 status=${receipt.status} tx=${hash}`);
    process.exitCode = 1;
    return;
  }
  rec.finalizeTx = hash;
  state[VERSION] = rec;
  saveState(state);
  console.log(`[${VERSION}] finalize 成功 status=${receipt.status} gasUsed=${receipt.gasUsed}`);

  // 读取结果（TapeRNG getRequest 第 3 段状态），仅读不回写
  const request = (await publicClient.readContract({
    address: TAPERNG,
    abi: tapeRngAbi,
    functionName: "getRequest",
    args: [BigInt(rec.requestId)],
  })) as unknown as Record<string, unknown>;
  console.log(`[${VERSION}] request`, {
    status: String(request.status),
    circuitUsed: request.circuitUsed,
    beaconUsed: request.beaconUsed,
    finalSeed: request.finalSeed,
  });
}

const action = process.argv[2];
function fail(e: unknown) {
  console.error(`${action} 失败:`, e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
if (action === "create") actionCreate().catch(fail);
else if (action === "finalize") actionFinalize().catch(fail);
else {
  console.error("用法: mainnet-demo.ts create|finalize");
  process.exitCode = 1;
}