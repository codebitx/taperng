import type { Locale } from "./i18n";

export interface LandingMetric {
  value: string;
  label: string;
}

export interface LandingStep {
  number: string;
  title: string;
  text: string;
}

export interface LandingFeature {
  icon: string;
  title: string;
  text: string;
}

export interface LandingContent {
  eyebrow: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  ctaDemo: string;
  ctaDocs: string;
  metrics: LandingMetric[];
  visualNoteStrong: string;
  visualNote: string;
  flowTitle: string;
  flow: LandingStep[];
  featuresTitle: string;
  features: LandingFeature[];
  howTitle: string;
  how: LandingStep[];
  audienceTitle: string;
  audiences: LandingFeature[];
  businessTitle: string;
  businesses: LandingFeature[];
  whyTitle: string;
  whys: LandingFeature[];
  tapeoutTitle: string;
  tapeoutUses: LandingFeature[];
  viewAll: string;
  demoEyebrow: string;
  demoTitle: string;
  demoSubtitle: string;
  demoNote: string;
}

export function landingContent(locale: Locale): LandingContent {
  if (locale === "zh") {
    return {
      eyebrow: "X Layer · TapeOut",
      title: "随机数，",
      titleAccent: "可以被验证。",
      subtitle:
        "把 commit-reveal、drand quicknet、未来 blockhash 和 TapeOut 电路组合成一条可复算的随机数链路。一次发布，一份 proof，任何人都能独立验证。",
      ctaDemo: "进入 Demo",
      ctaDocs: "阅读 SDK 文档",
      metrics: [
        { value: "3", label: "路独立熵源" },
        { value: "1", label: "个随机数合约发布" },
        { value: "0", label: "资产托管" },
        { value: "100%", label: "proof 可复算" },
      ],
      visualNoteStrong: "TapeOut 电路 = 可验证的混合层。",
      visualNote:
        "三个熵源来自外部（承诺、drand、区块哈希）；TapeRNG 用 TapeOut 的 Keccak IP Core 做确定性混合，proof 可重放 netlist",
      flowTitle: "从承诺到最终种子",
      flow: [
        { number: "01", title: "Commit", text: "组织者先提交 seed 承诺，并固定未来的随机源。" },
        { number: "02", title: "drand", text: "固定一个未来的 quicknet 轮次，链上用 EIP-2537 验签。" },
        { number: "03", title: "Blockhash", text: "固定 revealBlock，加入 X Layer L2 熵并防止 keeper 选块。" },
        { number: "04", title: "TapeOut", text: "Keccak IP Core 做确定性混合；主网 proof 可重放 netlist。" },
        { number: "05", title: "Finalize", text: "固定 finalSeed；SDK/CLI 可独立复算从 commit 到最终种子的整套 proof。" },
      ],
      featuresTitle: "为什么是 TapeRNG",
      features: [
        {
          icon: "◈",
          title: "多源熵",
          text: "commit-reveal、drand、blockhash 三层约束；不把安全押在单一信标上。",
        },
        {
          icon: "⬡",
          title: "链上验签",
          text: "drand quicknet 的 BLS12-381 签名直接在 X Layer 上验证，不依赖链下 keeper。",
        },
        {
          icon: "▤",
          title: "TapeOut 原生",
          text: "复用 Keccak IP Core；Roadmap 是自研 32-bit 混合器和专属流片。",
        },
        {
          icon: "✓",
          title: "可复算 proof",
          text: "SDK/CLI 重算 seed、电路输出与最终派生结果，任何人都能独立核对。",
        },
      ],
      howTitle: "三步接入",
      how: [
        { number: "01", title: "发起请求", text: "提交 seed 承诺，固定未来的 drand 轮次与 revealBlock。" },
        { number: "02", title: "固定熵源", text: "链上用 EIP-2537 验证 drand 签名，接入 blockhash 与 TapeOut 电路混合。" },
        { number: "03", title: "复核 proof", text: "任何人用 SDK/CLI 重算 preSeed→finalSeed，独立验证整条链路。" },
      ],
      audienceTitle: "谁在用它",
      audiences: [
        {
          icon: "◈",
          title: "抽奖 / 公平分发",
          text: "需要链上可验证、不可人为篡改结果的抽奖、盲盒与配额分配。",
        },
        {
          icon: "⬡",
          title: "游戏 / NFT",
          text: "掉落、空投白名单、幸运动作等需要可审计随机源的玩法。",
        },
        {
          icon: "▤",
          title: "Web3 应用开发者",
          text: "用几行 SDK 接入可复算的随机数，无需自建 oracle 或信任单一信标。",
        },
      ],
      businessTitle: "商业模式",
      businesses: [
        {
          icon: "◈",
          title: "按次收费",
          text: "每个随机数请求按量计费（约 $0.01–0.10），随调用量增长。",
        },
        {
          icon: "⬡",
          title: "订阅 / 套餐",
          text: "面向高频调用方的月度配额套餐，成本稳定可预期。",
        },
        {
          icon: "▤",
          title: "SDK 企业许可",
          text: "对需要专用部署/定制电路的团队提供授权与企业支持。",
        },
        {
          icon: "✓",
          title: "生态分成",
          text: "与 Launchpad、游戏、Agent 平台按使用量分成，不发行新代币。",
        },
      ],
      whyTitle: "为什么付费、为什么持续用",
      whys: [
        {
          icon: "◈",
          title: "信任免费，验证廉价",
          text: "链上可复现的 proof 让任何人都能核对，省去审计与舆情成本。",
        },
        {
          icon: "⬡",
          title: "低成本、低延迟",
          text: "X Layer 1 秒出块、低 gas，适合高频随机请求。",
        },
        {
          icon: "▤",
          title: "TapeOut 原生、可组合",
          text: "复用 Keccak IP Core，Roadmap 自研混合器与流片，Dapp 可持续叠加能力。",
        },
        {
          icon: "✓",
          title: "不押注单一信标",
          text: "commit + drand + blockhash 多源约束，降低单点风险，长期可信。",
        },
      ],
      tapeoutTitle: "用到的 TapeOut 生态",
      tapeoutUses: [
        {
          icon: "◈",
          title: "Keccak IP Core 电路",
          text: "复用 X Layer 主网 196 真实电路（circuitId=3）做确定性混合。",
        },
        {
          icon: "⬡",
          title: "TAP-02 netlist 复算",
          text: "proof 携带网表，SDK/CLI 本地重放电路输出，完成离线验证。",
        },
        {
          icon: "▤",
          title: "X Layer 主网 196",
          text: "链上 BLS12-381 验签 + 区块哈希熵，全部跑在 X Layer 上。",
        },
      ],
      viewAll: "查看全部",
      demoEyebrow: "Live demo",
      demoTitle: "体验可验证随机数",
      demoSubtitle:
        "提交一次请求、发布一次交易、收到一份可复算的 proof。",
      demoNote:
        "本页所有抽奖均在 X Layer 主网可查，随机数由 drand quicknet 与真实 TapeOut Keccak IP Core（circuitId=3）共同生成。抽奖合约：",
    };
  }

  return {
    eyebrow: "X Layer · TapeOut",
    title: "Randomness you can",
    titleAccent: "actually verify.",
    subtitle:
      "Commit-reveal, drand quicknet, a future blockhash and a TapeOut circuit combined into one replayable pipeline. Publish once; anyone can verify the proof.",
    ctaDemo: "Launch the demo",
    ctaDocs: "Read the SDK docs",
    metrics: [
      { value: "3", label: "entropy sources" },
      { value: "1", label: "randomness contract" },
      { value: "0", label: "asset custody" },
      { value: "100%", label: "replayable proof" },
    ],
    visualNoteStrong: "TapeOut circuit = the verifiable mix layer.",
    visualNote:
      "Entropy comes from outside (commitment, drand, block hash); TapeRNG mixes it deterministically with the TapeOut Keccak IP Core — the proof replays the netlist",
    flowTitle: "From commitment to final seed",
    flow: [
      { number: "01", title: "Commit", text: "The organizer commits a seed and pins the future randomness sources first." },
      { number: "02", title: "drand", text: "A future quicknet round is fixed and verified on-chain via EIP-2537." },
      { number: "03", title: "Blockhash", text: "A fixed revealBlock adds L2 entropy and prevents keeper block selection." },
      { number: "04", title: "TapeOut", text: "The Keccak IP Core mixes deterministically; mainnet proofs replay the netlist." },
      { number: "05", title: "Finalize", text: "Pin the finalSeed; the SDK/CLI replays the whole proof from commit to final seed." },
    ],
    featuresTitle: "Why TapeRNG",
    features: [
      {
        icon: "◈",
        title: "Multi-source entropy",
        text: "Commit-reveal, drand and blockhash constrain each other; no single beacon is trusted blindly.",
      },
      {
        icon: "⬡",
        title: "On-chain beacon",
        text: "The drand quicknet BLS12-381 signature is verified directly on X Layer, not by an off-chain keeper.",
      },
      {
        icon: "▤",
        title: "TapeOut-native",
        text: "The Keccak IP Core is reused today; the roadmap adds a custom 32-bit mixer and a dedicated tapeout.",
      },
      {
        icon: "✓",
        title: "Replayable proof",
        text: "The SDK/CLI recomputes the seed, circuit output and derived result; anyone can check.",
      },
    ],
    howTitle: "Three steps",
    how: [
      { number: "01", title: "Create a request", text: "Commit a seed and pin a future drand round and revealBlock." },
      { number: "02", title: "Pin the entropy", text: "Verify the drand signature on-chain via EIP-2537, then mix in blockhash and the TapeOut circuit." },
      { number: "03", title: "Replay the proof", text: "Anyone recomputes preSeed → finalSeed with the SDK/CLI to verify the whole pipeline." },
    ],
    audienceTitle: "Who it's for",
    audiences: [
      {
        icon: "◈",
        title: "Lotteries & fair distribution",
        text: "Draws, blind boxes and allocations that need chain-verifiable, tamper-proof outcomes.",
      },
      {
        icon: "⬡",
        title: "Games & NFTs",
        text: "Drops, allowlist raffles and lucky actions that need an auditable randomness source.",
      },
      {
        icon: "▤",
        title: "Web3 app developers",
        text: "A few lines of SDK to get replayable randomness, without building an oracle or trusting one beacon.",
      },
    ],
    businessTitle: "Business model",
    businesses: [
      {
        icon: "◈",
        title: "Per-request fee",
        text: "Pay-per-call (~$0.01–0.10 per random request) that scales with volume.",
      },
      {
        icon: "⬡",
        title: "Subscriptions / plans",
        text: "Monthly quota plans for high-frequency callers with predictable cost.",
      },
      {
        icon: "▤",
        title: "SDK enterprise license",
        text: "Licensing and support for teams that want dedicated deployments or custom circuits.",
      },
      {
        icon: "✓",
        title: "Ecosystem revenue share",
        text: "Usage-based splits with launchpads, games and agent platforms — without issuing a new token.",
      },
    ],
    whyTitle: "Why pay, why stay",
    whys: [
      {
        icon: "◈",
        title: "Trust is free, verification is cheap",
        text: "A replayable on-chain proof lets anyone check — saving audit and reputation costs.",
      },
      {
        icon: "⬡",
        title: "Low cost, low latency",
        text: "X Layer's 1-second blocks and low gas suit high-frequency randomness requests.",
      },
      {
        icon: "▤",
        title: "TapeOut-native, composable",
        text: "Built on the Keccak IP Core today, with custom mixers and tapeouts planned — Dapps can keep stacking capabilities.",
      },
      {
        icon: "✓",
        title: "No single-beacon bet",
        text: "Commit + drand + blockhash constrain each other, reducing single points of failure for long-term trust.",
      },
    ],
    tapeoutTitle: "TapeOut ecosystem used",
    tapeoutUses: [
      {
        icon: "◈",
        title: "Keccak IP Core circuit",
        text: "Reuses the real circuit on X Layer mainnet 196 (circuitId=3) for deterministic mixing.",
      },
      {
        icon: "⬡",
        title: "TAP-02 netlist replay",
        text: "Proofs carry the netlist; the SDK/CLI replays the circuit output locally for offline verification.",
      },
      {
        icon: "▤",
        title: "X Layer mainnet 196",
        text: "On-chain BLS12-381 verification and block-hash entropy, all running on X Layer.",
      },
    ],
    viewAll: "View all",
    demoEyebrow: "Live demo",
    demoTitle: "Try verifiable randomness",
    demoSubtitle:
      "Submit one request, publish one transaction, and receive a replayable proof.",
    demoNote:
      "Every draw on this page is verifiable on X Layer mainnet. Randomness combines drand quicknet with the real TapeOut Keccak IP Core (circuitId=3). Lottery contract:",
  };
}
