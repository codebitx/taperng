import { addressUrl } from "./config";
import type { Locale } from "./i18n";

export interface DocAddress {
  label: string;
  value: string;
  url?: string;
}

export interface DocSection {
  id: string;
  eyebrow: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
  codeTitle?: string;
}

export interface DocsContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  back: string;
  navTitle: string;
  note: string;
  addresses: DocAddress[];
  sections: DocSection[];
}

export interface DocsContext {
  tapeRngAddress?: string;
  lotteryAddress?: string;
}

const INSTALL_CODE = `npm install taperng-sdk
# 或 pnpm
pnpm add taperng-sdk`;

const QUICKSTART_CODE = `import { createTapeRNG } from "taperng-sdk";
import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({
  transport: http("https://rpc.xlayer.tech"),
});

// For writes: createWalletClient({ account, chain, transport: custom(window.ethereum) })
const taperng = createTapeRNG({
  publicClient,
  walletClient,                 // optional for read-only
  addresses: { tapeRng, cpu }, // cpu optional; createRequest can override
  chainId: 196,
  beaconMode: "drand",          // or "none"
  circuitMode: "tapeout",       // "mock" on testnet/fork
});`;

const REQUEST_CODE = `// contextHash / specHash are opaque domain hashes you define from your app's
// rules (e.g. a canonical JSON). The SDK binds them into the random request.
const req = await taperng.createRequest({
  contextHash,
  specHash,
  circuitId: 3n,
  seed,                   // your secret; the SDK commits it for you
});
// → { requestId, commit, seed, revealBlock, beaconRound }`;

const FINALIZE_CODE = `await taperng.reveal(req.requestId, req.seed);
await taperng.finalize(req.requestId);          // mixes drand + blockhash + circuit

const proof = await taperng.getProof(req.requestId);
const result = taperng.verifyProof(proof);

if (!result.ok) {
  throw new Error("proof failed");
}
console.log(result.checks);`;

const CLI_CODE = `# taperng-sdk is published on npm; the verify CLI has no global bin yet,
# so run it from the SDK directory (or via Node + tsx):
cd taperng/packages/sdk && pnpm cli verify proof.json`;

const TAP02_CODE = `import { load, evalNetlist } from "taperng-sdk";

// TAP-02: NAND / LATCH / REF, LSB-first packing
const circuit = load(netlist, nIn, nOut);
const output = evalNetlist(circuit, input);`;

const DRAND_CODE = `import { fetchBeacon, verifyBeacon } from "taperng-sdk";

const beacon = await fetchBeacon("latest");
const { ok, randomness } = verifyBeacon(beacon);

// randomness === sha256(beacon.signature)`;

function makeAddresses(ctx: DocsContext): DocAddress[] {
  const list: DocAddress[] = [];
  if (ctx.tapeRngAddress) {
    list.push({
      label: "TapeRNG",
      value: ctx.tapeRngAddress,
      url: addressUrl(ctx.tapeRngAddress),
    });
  }
  return list;
}

export function docsContent(locale: Locale, ctx: DocsContext): DocsContent {
  const addresses = makeAddresses(ctx);
  if (locale === "zh") {
    return {
      eyebrow: "TapeRNG 通用 SDK",
      title: "把可验证随机数接进你的应用",
      subtitle:
        "SDK 把 TapeRNG 合约调用、canonical spec、drand 离线验证、TAP-02 电路复算和 proof 校验封装成一套 viem-first API。",
      back: "返回首页",
      navTitle: "目录",
      note: "",
      addresses,
      sections: [
        {
          id: "features",
          eyebrow: "功能",
          title: "SDK 包含什么",
          bullets: [
            "createTapeRNG：基于 viem 的 publicClient/walletClient，封装 TapeRNG 合约的 createRequest / reveal / finalize / getProof / verifyProof。",
            "createRequest：一笔交易提交盲随机数请求——自动选择未来的 drand round 和固定的 revealBlock，seed 藏在 commitment 之后。",
            "getProof / verifyProof：复算 pre-seed、电路输出、final seed，并可离线重放 TAP-02 网表。",
            "TAP-02 解释器：decode/encode/load/beat/pack/unpack/evalNetlist/stepNetlist，严格复刻官方 reference.py。",
            "drand：fetchBeacon 多端点、verifyBeacon 离线 BLS12-381 验签、sha256(signature) 校验。",
            "CLI：verify proof.json，退出码 0/1，适合 CI 或第三方复算。",
            "通用工具：randomSeed / canonicalJson / merkleRoot，供消费方构建自己的领域 spec。",
          ],
        },
        {
          id: "install",
          eyebrow: "安装",
          title: "从 npm 安装",
          paragraphs: [
            "taperng-sdk 已发布到 npm registry。包以 TypeScript 源码分发（main/types 指向 src）：Node 22+ 的 strip-types 可直接运行，或用 tsx / vite / Next（transpilePackages）转译。",
          ],
          code: INSTALL_CODE,
          codeTitle: "terminal",
        },
        {
          id: "quickstart",
          eyebrow: "接入",
          title: "创建 client",
          paragraphs: [
            "主网 196 使用真实 Keccak IP Core（circuitMode: \"tapeout\"）；测试网/本地 fork 无 TapeOut 部署，用 \"mock\"。beaconMode 只在不想用 drand 时改为 \"none\"。",
          ],
          code: QUICKSTART_CODE,
          codeTitle: "client.ts",
        },
        {
          id: "requests",
          eyebrow: "请求",
          title: "创建一条随机数请求",
          paragraphs: [
            "contextHash / specHash 是消费方自己定义的领域摘要（例如对应用规则的 canonical JSON 取哈希）。SDK 把它们当作盲 bytes32 绑定进请求与 commitment，不做领域解释。cpu / circuitId 指定用于混合的 TapeOut 电路。",
          ],
          code: REQUEST_CODE,
          codeTitle: "request.ts",
        },
        {
          id: "finalize",
          eyebrow: "开奖前的核心",
          title: "揭示、finalize 与 proof",
          paragraphs: [
            "等待 revealBlock + drand round 后执行 reveal + finalize：TapeRNG 把组织者 seed、区块哈希、drand random、电路输出混合成最终随机数。getProof 返回终态 proof；verifyProof 是基于 proof JSON 的纯复算。",
          ],
          code: FINALIZE_CODE,
          codeTitle: "finalize.ts",
        },
        {
          id: "cli",
          eyebrow: "CLI",
          title: "第三方独立验证",
          code: CLI_CODE,
          codeTitle: "terminal",
        },
        {
          id: "tap02",
          eyebrow: "TAP-02",
          title: "离线复算 TapeOut 电路",
          paragraphs: [
            "proof 里带 netlist；tapeout 模式下 SDK 会本地 load/eval 电路，把输出和链上 circuitMix 对比。mock 模式会明确跳过 TAP-02 复算。",
          ],
          code: TAP02_CODE,
          codeTitle: "netlist.ts",
        },
        {
          id: "drand",
          eyebrow: "drand",
          title: "不依赖 RPC 的信标验证",
          paragraphs: [
            "verifyBeacon 使用 @noble/curves 做 BLS12-381 验签，消息是 sha256(uint64_be(round))；randomness 必须是 sha256(signature)。",
          ],
          code: DRAND_CODE,
          codeTitle: "drand.ts",
        },
        {
          id: "proof",
          eyebrow: "复算",
          title: "proof 具体验证什么",
          bullets: [
            "context hash：消费方上传的盲 context 与链上登记一致。",
            "organizer commitment：seed、context、revealer、chainId 与 TapeRNG 地址比对。",
            "pre-seed：requestId、blockHash、beaconRandomness、CPU/circuit/netlistHash 和所有 fallback flag。",
            "TapeOut 电路输出与 circuitMix；tapeout 模式会本地重放 netlist。",
            "finalSeed 与最终随机数。",
            "sha256(drand signature) 与 beaconRandomness 一致。",
          ],
        },
        {
          id: "security",
          eyebrow: "边界",
          title: "安全假设与限制",
          bullets: [
            "核心合约与 vendored BLS 库未审计；这是参赛 Demo，不宣称生产级安全。",
            "测试网没有 TapeOut 部署，用 MockCPU；主网/fork 才使用真实 Keccak IP Core。",
            "组织者 + X Layer sequencer 合谋仍有残余风险；固定的 revealBlock 和 drand 只能降低，不能完全消除。",
            "drand 依赖 League of Entropy 阈值假设；blockhash 仅作为附加/兜底。",
            "finalSeed 之后的消费方派生（如抽奖中奖名单）由领域层自理，不属于本 SDK。",
            "proof 内嵌 netlist；隐私场景需要额外的哈希/披露策略。",
          ],
        },
        {
          id: "web",
          eyebrow: "Web",
          title: "前端 demo 与 SDK 的关系",
          paragraphs: [
            "前端 /demo 抽奖应用复用 SDK 的核心推导（createRequest → reveal → finalize → getProof → verifyProof）。抽奖领域——buildDraw、participants/prizes、winners 派生与 LotteryDemo 合约调用——留在前端，不进通用 SDK。这样同一个核心证明逻辑只有一份来源。",
          ],
        },
      ],
    };
  }

  return {
    eyebrow: "TapeRNG SDK",
    title: "Add verifiable randomness to your app",
    subtitle:
      "The SDK wraps TapeRNG contract calls, canonical specs, drand verification, TAP-02 circuit replay and proof checks behind a viem-first API.",
    back: "Back to home",
    navTitle: "Contents",
    note: "",
    addresses,
    sections: [
      {
        id: "features",
        eyebrow: "Features",
        title: "What is in the SDK",
        bullets: [
          "createTapeRNG: a viem publicClient/walletClient wrapper for the TapeRNG contract: createRequest / reveal / finalize / getProof / verifyProof.",
          "createRequest: opens a blind random request in one transaction — an automatic future drand round and a fixed revealBlock, with your seed hidden behind a commitment.",
          "getProof / verifyProof: recompute the pre-seed, circuit output and final seed; optionally replay the TAP-02 netlist offline.",
          "TAP-02 interpreter: decode/encode/load/beat/pack/unpack/evalNetlist/stepNetlist, a strict port of the official reference.py.",
          "drand: multi-endpoint fetchBeacon, offline BLS12-381 verifyBeacon, and sha256(signature) validation.",
          "CLI: verify proof.json with exit code 0/1 for CI or third-party replay.",
          "Utilities: randomSeed / canonicalJson / merkleRoot for consumers building their own domain spec.",
        ],
      },
      {
        id: "install",
        eyebrow: "Install",
        title: "Install from npm",
        paragraphs: [
          "taperng-sdk is published on the npm registry. The package ships TypeScript source (main/types point at src): Node 22+ strip-types runs it directly, or transpile with tsx / vite / Next (transpilePackages).",
        ],
        code: INSTALL_CODE,
        codeTitle: "terminal",
      },
      {
        id: "quickstart",
        eyebrow: "Quick start",
        title: "Create a client",
        paragraphs: [
          "Mainnet 196 uses the real Keccak IP Core (circuitMode: \"tapeout\"); testnet/local forks have no TapeOut deployment and use \"mock\". Set beaconMode to \"none\" only when you do not want drand.",
        ],
        code: QUICKSTART_CODE,
        codeTitle: "client.ts",
      },
      {
        id: "requests",
        eyebrow: "Requests",
        title: "Open a random request",
        paragraphs: [
          "contextHash / specHash are opaque domain hashes you define from your app's rules (e.g. a canonical JSON hash). The SDK binds them into the request and commitment as blind bytes32, without interpreting them. cpu / circuitId select the TapeOut circuit used for the mix.",
        ],
        code: REQUEST_CODE,
        codeTitle: "request.ts",
      },
      {
        id: "finalize",
        eyebrow: "Finalize",
        title: "Reveal, finalize and verify",
        paragraphs: [
          "Once the revealBlock and the drand round have arrived, call reveal + finalize: TapeRNG mixes the organizer seed, block hash, drand randomness and circuit output into the final seed. getProof returns the terminal proof; verifyProof is a pure replay of the proof JSON.",
        ],
        code: FINALIZE_CODE,
        codeTitle: "finalize.ts",
      },
      {
        id: "cli",
        eyebrow: "CLI",
        title: "Independent verification",
        code: CLI_CODE,
        codeTitle: "terminal",
      },
      {
        id: "tap02",
        eyebrow: "TAP-02",
        title: "Replay the TapeOut circuit offline",
        paragraphs: [
          "The proof carries the netlist. In tapeout mode the SDK loads/evals the circuit locally and compares the output to circuitMix. Mock mode skips TAP-02 replay explicitly.",
        ],
        code: TAP02_CODE,
        codeTitle: "netlist.ts",
      },
      {
        id: "drand",
        eyebrow: "drand",
        title: "Verify the beacon without RPC",
        paragraphs: [
          "verifyBeacon uses @noble/curves for BLS12-381; the message is sha256(uint64_be(round)) and randomness must equal sha256(signature).",
        ],
        code: DRAND_CODE,
        codeTitle: "drand.ts",
      },
      {
        id: "proof",
        eyebrow: "Replay",
        title: "What the proof verifies",
        bullets: [
          "Context hash: the consumer's blind context matches the on-chain registered one.",
          "Organizer commitment: seed, context, revealer, chainId and the TapeRNG address.",
          "Pre-seed: requestId, blockHash, beaconRandomness, CPU/circuit/netlistHash and every fallback flag.",
          "TapeOut circuit output and circuitMix; tapeout mode replays the netlist locally.",
          "finalSeed and the final seed random value.",
          "sha256(drand signature) equals beaconRandomness.",
        ],
      },
      {
        id: "security",
        eyebrow: "Boundaries",
        title: "Security assumptions and limits",
        bullets: [
          "The contracts and the vendored BLS library are unaudited; this is a hackathon demo, not a production security claim.",
          "TapeOut is not deployed on testnet, so the demo uses MockCPU; only mainnet/fork uses the real Keccak IP Core.",
          "Provider + X Layer sequencer collusion remains a residual risk; a fixed revealBlock and drand reduce it but do not eliminate it.",
          "drand relies on the League of Entropy threshold assumption; blockhash is only an additional/fallback source.",
          "Consumer-side derivation after finalSeed (e.g. lottery winners) is the domain layer's job, not this SDK's.",
          "The proof embeds the netlist; privacy use cases need an extra disclosure/hashing strategy.",
        ],
      },
      {
        id: "web",
        eyebrow: "Web",
        title: "How the demo relates to the SDK",
        paragraphs: [
          "The /demo lottery app reuses the SDK's core derivation (createRequest → reveal → finalize → getProof → verifyProof). The lottery domain — buildDraw, participants/prizes, winner derivation and the LotteryDemo contract calls — stays in the frontend, not in the generic SDK, so there is a single source of truth for the core proof logic.",
        ],
      },
    ],
  };
}