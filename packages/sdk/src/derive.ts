import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";

/**
 * TapeRNG 核心随机数的链上派生（与 Solidity TapeRNGLib 对拍）。
 *
 * 定位：通用可验证随机数。此处只覆盖「从 commit 到 finalSeed」的核心推导，
 * 不含任何领域语义（抽奖/选取/排序）。contextHash 由调用方（消费者）生成并
 * 作为盲 bytes32 传入——SDK 不改解释它，只校验链上 registered 的 contextHash
 * 与调用方期望一致。最终随机数 finalSeed 之后的消费方派生（如 winners/prizeSlots）
 * 不属于本模块。
 *
 * ⚠️ 不要改动各函数 encodeAbiParameters 的字段顺序/类型：顺序一变，派生结果
 * 就不再等于链上最终 seed。parity 测试负责锁定与 Solidity 的一致性。
 */
export const DOMAIN = {
  context: keccak256(toBytes("TapeRNG-v1/context")),
  preSeed: keccak256(toBytes("TapeRNG-v1/preSeed")),
  circuitInput: keccak256(toBytes("TapeRNG-v1/circuitInput")),
  circuitMix: keccak256(toBytes("TapeRNG-v1/circuitMix")),
  finalSeed: keccak256(toBytes("TapeRNG-v1/finalSeed")),
  organizer: keccak256(toBytes("TapeRNG-v1/organizer")),
} as const;

/** TapeRNG.getRequest 中参与派生校验的字段子集（字段名与链上 struct 对齐）。 */
export interface DeriveRequest {
  revealer: Address;
  commit: Hex;
  contextHash: Hex;
  revealBlock: bigint;
  beaconRound: bigint;
  cpu: Address;
  circuitId: bigint;
  netlistHash: Hex;
  nIn: number;
  seedMissing: boolean;
  fallbackBlockhash: boolean;
  beaconUsed: boolean;
  circuitUsed: boolean;
  organizerSeed: Hex;
  blockHash: Hex;
  beaconRandomness: Hex;
  circuitMix: Hex;
  preSeed: Hex;
  finalSeed: Hex;
}

export interface DeriveCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DeriveResult {
  ok: boolean;
  checks: DeriveCheck[];
  contextHash: Hex;
  preSeed: Hex;
  circuitInput: Hex;
  circuitOutput?: Hex;
  circuitMix: Hex;
  finalSeed: Hex;
}

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 组织者（revealer）对 seed+context 的承诺。encode 布局与 Solidity
 * commitment() 一致：DOMAIN.organizer, seed, context, provider, chainId, tapeRng。
 */
export function commitment(
  seed: Hex,
  context: Hex,
  provider: Address,
  chainId: number,
  tapeRng: Address,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
      ],
      [DOMAIN.organizer, seed, context, provider, BigInt(chainId), tapeRng],
    ),
  );
}

export interface PreSeedInput {
  chainId: number;
  tapeRng: Address;
  requestId: bigint;
  context: Hex;
  request: DeriveRequest;
}

/** 混合 pre-seed。context 是本模块外部（消费者）生成的盲哈希，直接参与派生。 */
export function preSeed(input: PreSeedInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "bool" },
        { type: "bool" },
      ],
      [
        DOMAIN.preSeed,
        BigInt(input.chainId),
        input.tapeRng,
        input.requestId,
        input.context,
        input.request.organizerSeed,
        input.request.blockHash,
        input.request.beaconRandomness,
        input.request.cpu,
        input.request.circuitId,
        input.request.netlistHash,
        input.request.beaconRound,
        input.request.seedMissing,
        input.request.fallbackBlockhash,
      ],
    ),
  );
}

export function circuitInput(pre: Hex, nIn: number): Hex {
  const length = Math.ceil(nIn / 8);
  const hash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [DOMAIN.circuitInput, pre],
    ),
  );
  return `0x${hash.slice(2, 2 + length * 2)}` as Hex;
}

export function circuitMix(
  circuitId: bigint,
  netlistHash: Hex,
  output: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes" },
      ],
      [DOMAIN.circuitMix, circuitId, netlistHash, output],
    ),
  );
}

export function finalSeed(
  pre: Hex,
  mix: Hex,
  circuitUsed: boolean,
  seedMissing: boolean,
  fallbackBlockhash: boolean,
  beaconUsed: boolean,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bool" },
        { type: "bool" },
        { type: "bool" },
        { type: "bool" },
      ],
      [
        DOMAIN.finalSeed,
        pre,
        mix,
        circuitUsed,
        seedMissing,
        fallbackBlockhash,
        beaconUsed,
      ],
    ),
  );
}

export interface VerifyDerivationInput {
  chainId: number;
  tapeRng: Address;
  /** 请求 ID，参与 pre-seed 派生（链上 getRequest 的入参）。 */
  requestId: bigint;
  revealer: Address;
  /** 领域层生成的 context 摘要，需与 request.contextHash 一致。 */
  contextHash: Hex;
  request: DeriveRequest;
  circuitOutput?: Hex;
  beaconSignature?: Hex;
}

/**
 * 复算一条随机数请求的派生，逐项与链上 request 比对。
 * 校验到 finalSeed 为止；finalSeed 之后的消费方派生由调用方自行处理。
 */
export function verifyDerivation(
  input: VerifyDerivationInput,
): DeriveResult {
  const checks: DeriveCheck[] = [];
  const { chainId, tapeRng, requestId, revealer, contextHash: context } = input;
  const request = input.request;

  checks.push({
    name: "context hash",
    ok: eq(context, request.contextHash),
  });

  if (!request.seedMissing) {
    checks.push({
      name: "organizer commitment",
      ok: eq(
        commitment(request.organizerSeed, context, revealer, chainId, tapeRng),
        request.commit,
      ),
    });
  }

  const pre = preSeed({ chainId, tapeRng, requestId, context, request });
  checks.push({ name: "pre-seed", ok: eq(pre, request.preSeed) });

  let output = input.circuitOutput;
  let mix =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
  if (request.circuitUsed) {
    if (!output) {
      checks.push({
        name: "TapeOut circuit output",
        ok: false,
        detail: "circuit output not supplied; pass cpu.eval(...) output",
      });
    } else {
      mix = circuitMix(request.circuitId, request.netlistHash, output);
      checks.push({
        name: "TapeOut circuit eval",
        ok: eq(mix, request.circuitMix),
      });
    }
  } else {
    checks.push({
      name: "TapeOut circuit skipped",
      ok: eq(request.circuitMix, mix),
    });
  }

  const final = finalSeed(
    pre,
    mix,
    request.circuitUsed,
    request.seedMissing,
    request.fallbackBlockhash,
    request.beaconUsed,
  );
  checks.push({ name: "final seed", ok: eq(final, request.finalSeed) });

  if (request.beaconUsed) {
    if (input.beaconSignature) {
      const digest = bytesToHex(sha256(hexToBytes(input.beaconSignature)));
      checks.push({
        name: "drand randomness = sha256(signature)",
        ok: eq(digest, request.beaconRandomness),
      });
    } else {
      checks.push({
        name: "drand signature supplied",
        ok: false,
        detail: "signature not supplied",
      });
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    contextHash: context,
    preSeed: pre,
    circuitInput: circuitInput(pre, request.nIn),
    circuitOutput: output,
    circuitMix: mix,
    finalSeed: final,
  };
}