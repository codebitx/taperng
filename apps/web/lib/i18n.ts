export type Locale = "en" | "zh";

export const messages = {
  en: {
    appName: "TapeRNG",
    tagline: "Verifiable randomness for X Layer",
    subtitle:
      "Commit-reveal + drand quicknet + a future X Layer blockhash + a TapeOut circuit. One form, one publish transaction, one verifiable draw.",
    connect: "Connect wallet",
    connected: "Connected",
    switchNetwork: "Switch network",
    installWallet: "Install MetaMask or OKX Wallet to publish a draw.",
    notConfigured:
      "Contracts are not configured yet. Set NEXT_PUBLIC_LOTTERY_ADDRESS and NEXT_PUBLIC_TAPE_RNG_ADDRESS.",
    mockBeaconWarning:
      "Mock beacon mode is for contract tests. Set BEACON_MODE=drand for the web demo.",
    form: {
      title: "Publish a draw",
      subtitle:
        "A random example is prefilled. Edit it (or publish as-is), then publish once.",
      autoFilled: "Auto-filled random example",
      name: "Draw name",
      namePlaceholder: "Annual Party Lottery",
      participants: "Participants",
      participantsHint: "We generate Participant 001…N for this demo.",
      prizes: "Prizes",
      prizeName: "Prize name",
      prizeQuantity: "Qty",
      addPrize: "Add prize",
      removePrize: "Remove",
      publish: "Publish draw",
      publishing: "Publishing…",
      totalWinners: "{count} winners",
      wallet: "Wallet",
      network: "Network",
    },
    status: {
      created: "Committed",
      revealed: "Revealed",
      finalized: "Finalized",
      expired: "Expired",
      unknown: "Unknown",
    },
    detail: {
      back: "All draws",
      draw: "Draw",
      participants: "Participants",
      winners: "Winners",
      prize: "Prize",
      winner: "Winner",
      participant: "Participant",
      noWinners: "Winners have not been drawn yet.",
      drawWinners: "Draw winners",
      drawing: "Drawing…",
      refresh: "Refresh",
      timeline: "Timeline",
      createdAt: "Created",
      committedAt: "Committed + seed revealed",
      finalizedAt: "Finalized",
      entropy: "Entropy sources",
      organizerSeed: "Organizer seed",
      drandRound: "drand round",
      drandTime: "Beacon time",
      revealBlock: "Fixed reveal block",
      blockHash: "Block hash",
      beaconRandomness: "Beacon randomness",
      circuit: "TapeOut circuit",
      circuitMix: "Circuit mix",
      finalSeed: "Final seed",
      flags: "Flags",
      seedMissing: "Organizer seed missing (fallback)",
      fallbackBlockhash: "Expired blockhash fallback",
      beaconUsed: "drand beacon used",
      circuitUsed: "TapeOut circuit used",
      proof: "Proof",
      verify: "Verify proof",
      verifying: "Verifying…",
      verified: "Proof verified",
      verifyFailed: "Proof verification failed",
      viewTx: "View transaction",
      specHash: "Spec hash",
      root: "Participants root",
      organizerCommit: "Organizer commitment",
      countdown: "Waiting for the beacon and reveal block",
      ready: "Ready to draw",
      remaining: "≈ {m}min {s}s to draw · {blocks} blocks left",
      expiredHint:
        "The blockhash window expired. The contract will use the expired fallback and mark the proof.",
      noProof: "The proof appears after finalization.",
    },
    roadmap: {
      title: "Roadmap",
      now: "Now",
      nowText:
        "X Layer testnet demo: commit-reveal + drand quicknet + blockhash + TapeOut Keccak IP Core; inline proof verification.",
      next1: "Next: custom TapeOut circuit",
      next1Text:
        "Design and tape out a 32-bit NLFSR or a larger Keccak-based mixer, replacing the reused IP Core with TapeRNG-specific hardware.",
      next2: "Next: advanced cryptography",
      next2Text:
        "Explore zk proofs of BLS verification, VDFs, threshold signatures and post-quantum options beyond on-chain BLS12-381.",
      later: "Later",
      laterText:
        "More consumers (NFT drops, games, fair launch), multi-chain adapters and SDK plugins.",
    },
    recent: {
      title: "Recent draws",
      empty: "No draws yet. Publish the first one above.",
      open: "Open",
      prev: "Previous",
      next: "Next",
      page: "Page {page} / {pages}",
    },
    footer:
      "Demo only: no assets are escrowed or settled on-chain. Contracts and the BLS library are unaudited. No trustless claim.",
    language: "中文",
    docsLink: "SDK docs",
    nav: {
      home: "Home",
      demo: "Demo",
      docs: "SDK docs",
    },
    toast: {
      published: "Draw published",
      finalized: "Draw finalized — winners are ready",
    },
    error: {
      rejected: "The wallet rejected the request.",
      noWallet: "No injected wallet found.",
      generic: "Something went wrong.",
      notReady: "The beacon or reveal block is not ready yet.",
      invalidForm: "Please check the draw name, participants and prizes.",
      notConfigured: "Contract addresses are not configured.",
    },
  },
  zh: {
    appName: "TapeRNG",
    tagline: "X Layer 上的可验证随机数",
    subtitle:
      "commit-reveal + drand quicknet + 未来 X Layer blockhash + TapeOut 电路。一个表单、一次发布交易、一次可复算的开奖。",
    connect: "连接钱包",
    connected: "已连接",
    switchNetwork: "切换网络",
    installWallet: "请安装 MetaMask 或 OKX Wallet 后发布抽奖。",
    notConfigured:
      "合约地址尚未配置。请设置 NEXT_PUBLIC_LOTTERY_ADDRESS 和 NEXT_PUBLIC_TAPE_RNG_ADDRESS。",
    mockBeaconWarning:
      "Mock beacon 模式仅用于合约测试。Web Demo 请设置 BEACON_MODE=drand。",
    form: {
      title: "发布抽奖",
      subtitle: "已随机预填一例。可直接发布或修改后发布。",
      autoFilled: "已随机预填",
      name: "抽奖名称",
      namePlaceholder: "年会抽奖",
      participants: "参与人数",
      participantsHint: "Demo 会自动生成以 Participant 001…N 命名的英文标识。",
      prizes: "奖品配置",
      prizeName: "奖品名称",
      prizeQuantity: "数量",
      addPrize: "添加奖品",
      removePrize: "删除",
      publish: "发布抽奖",
      publishing: "发布中…",
      totalWinners: "共 {count} 个中奖名额",
      wallet: "钱包",
      network: "网络",
    },
    status: {
      created: "已提交",
      revealed: "已揭示",
      finalized: "已开奖",
      expired: "已过期",
      unknown: "未知",
    },
    detail: {
      back: "全部抽奖",
      draw: "抽奖",
      participants: "参与者",
      winners: "中奖名单",
      prize: "奖品",
      winner: "中奖者",
      participant: "参与者",
      noWinners: "尚未开奖。",
      drawWinners: "开奖",
      drawing: "开奖中…",
      refresh: "刷新",
      timeline: "时间线",
      createdAt: "已创建",
      committedAt: "已提交 + 已揭示 seed",
      finalizedAt: "已开奖",
      entropy: "熵源",
      organizerSeed: "组织者 seed",
      drandRound: "drand 轮次",
      drandTime: "信标时间",
      revealBlock: "固定揭示区块",
      blockHash: "区块哈希",
      beaconRandomness: "信标随机数",
      circuit: "TapeOut 电路",
      circuitMix: "电路混合结果",
      finalSeed: "最终 seed",
      flags: "标志",
      seedMissing: "组织者 seed 缺失（fallback）",
      fallbackBlockhash: "区块哈希过期 fallback",
      beaconUsed: "已使用 drand 信标",
      circuitUsed: "已使用 TapeOut 电路",
      proof: "证明",
      verify: "验证证明",
      verifying: "验证中…",
      verified: "证明验证通过",
      verifyFailed: "证明验证失败",
      viewTx: "查看交易",
      specHash: "Spec 哈希",
      root: "参与者 Merkle root",
      organizerCommit: "组织者承诺",
      countdown: "等待信标与揭示区块",
      ready: "可以开奖",
      remaining: "约 {m} 分 {s} 秒后可开奖 · 剩 {blocks} 块",
      expiredHint: "区块哈希窗口已过期。合约将使用过期 fallback，并在证明中标记。",
      noProof: "开奖后显示证明。",
    },
    roadmap: {
      title: "路线图",
      now: "现在",
      nowText:
        "X Layer 测试网 Demo：commit-reveal + drand quicknet + blockhash + TapeOut Keccak IP Core；页面内验证 proof。",
      next1: "下一步：自研 TapeOut 电路",
      next1Text:
        "设计并流片 32-bit NLFSR 或更大的 Keccak-based mixer，把复用的 IP Core 升级为 TapeRNG 专属硬件。",
      next2: "下一步：更复杂的密码学",
      next2Text:
        "探索 BLS 验签的 zk proof、VDF、阈值签名和后量子方案，降低对链上 BLS12-381 的依赖。",
      later: "后续",
      laterText: "更多 consumer（NFT drop、游戏、fair launch）、多链 adapter 和 SDK 插件。",
    },
    recent: {
      title: "最近抽奖",
      empty: "还没有抽奖。在上方发布第一个。",
      open: "打开",
      prev: "上一页",
      next: "下一页",
      page: "第 {page} / {pages} 页",
    },
    footer:
      "仅用于 Demo：不托管、不结算任何资产。合约与 BLS 库未审计，不宣称无信任。",
    language: "English",
    docsLink: "SDK 文档",
    nav: {
      home: "首页",
      demo: "Demo",
      docs: "SDK 文档",
    },
    toast: {
      published: "抽奖已发布",
      finalized: "开奖完成，中奖名单已生成",
    },
    error: {
      rejected: "钱包拒绝了请求。",
      noWallet: "未检测到注入式钱包。",
      generic: "出现错误。",
      notReady: "信标或揭示区块尚未就绪。",
      invalidForm: "请检查抽奖名称、参与人数和奖品。",
      notConfigured: "合约地址尚未配置。",
    },
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

export function translate(
  locale: Locale,
  key: string,
  values?: Record<string, string | number>,
): string {
  const parts = key.split(".");
  let current: unknown = messages[locale];
  for (const part of parts) {
    if (!current || typeof current !== "object") return key;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") return key;
  if (!values) return current;
  return current.replace(/\{(\w+)\}/g, (_, name: string) =>
    values[name] === undefined ? `{${name}}` : String(values[name]),
  );
}
