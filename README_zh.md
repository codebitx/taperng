# TapeRNG

[English](README.md) | [简体中文](README_zh.md)

> **定位** — 基于 TapeOut 电路的可验证随机数基础设施：汇聚外部熵源，生成可复算、可链上核验的随机数与证明。
>
> 这是面向 X Layer / TapeOut 生态开发者的可复用**基础设施**（SDK / 链上服务），**不是**夺宝抽奖 App。TapeOut 电路本身不产生熵；随机性来自外部（用户 commit、drand 信标、未来区块哈希），电路负责把熵源变成确定性的、可复算的、可组合的随机数。相比 Chainlink VRF / Supra dVRF，它 TapeOut 原生、电路可回放、低成本、可组合，不与非脚本化的信任方绑定。

为 **X Layer** 打造的可验证随机数信标 / SDK，服务于 **X Layer TapeOut 开发者加速计划**。

**线上部署（X Layer 主网 196）：https://tape.futool.com**

TapeRNG 组合了：

- **Organizer commit-reveal** — 组织者在熵源揭晓前先提交一个 32 字节 seed。
- **drand quicknet** — BLS12-381 门限信标，通过 X Layer 的 EIP-2537 预编译在链上验证。
- **未来 X Layer blockhash** — 固定的 `revealBlock` 引入 L2 熵，并提供一条回退路径。
- **TapeOut Keccak-256 IP Core** — 确定性、透明的混合层，其网表可由 SDK 回放（netlist replay）。
- **无偏多赢家抽取** — partial Fisher-Yates + 拒绝采样，不会出现重复赢家。
- **可编辑证明** — `proof.json` 可用 SDK / CLI 离线核验。

第一个消费者是一个 **metadata-only 抽奖 demo**：奖品只是展示数据，不涉及链上托管或领取。demo 刻意保持简单：一张表单、一笔发布交易、一次开奖动作。

## 状态

- 合约：`TapeRNG`、`LotteryDemo`、`DrandQuicknetAdapter`、`MockTapeOutCPU`、`MockBeaconAdapter`；Foundry 单元/模糊测试与主网 fork 的 Keccak-core 回归测试均通过。
- SDK：`packages/sdk`（viem client、TAP-02 解释器、drand 离线验证、与 Solidity 对齐的派生、proof 核验、CLI）。`vitest` 14 项测试通过；CLI 可核验本地 Web 导出的 proof。
- Web：`apps/web`（Next.js App Router，经 Node 24 内置 `node:sqlite` 使用 SQLite，轻量 en/zh i18n，wagmi + viem 上的 **RainbowKit injected-only 模式**；不带 WalletConnect projectId）。生产环境**仅主网(196)**；Anvil 仅保留给合约调试层（见 `contracts/anvil/`）。
- 部署：X Layer 测试网 1952 使用 `MockTapeOutCPU`（测试网没有部署 TapeOut）；X Layer 主网 196 可用真实 Keccak Core #3。

> Web 不使用 `next-intl`；en/zh 词典位于 `apps/web/lib/i18n.ts`。SDK 的服务端派生在 Web 内有镜像实现，用于行内 proof 校验；两者针对同一份 Solidity parity fixture 做测试。

## 仓库结构

```text
taperng/
├── contracts/          # Foundry：协议、消费者、drand adapter、mock、测试
├── packages/sdk/       # viem SDK、TAP-02 解释器、drand 验证器、proof CLI
├── apps/web/           # Next.js UI：发布表单、开奖详情、proof 查看器
├── config/             # 固定的链/电路地址
└── package.json        # pnpm workspace
```

## 快速开始（合约）

```bash
cd taperng/contracts
forge build
forge test --match-path 'test/unit/*'

# 针对真实 Keccak IP Core 的主网 fork 回归：
RUN_FORK=true forge test --match-path test/fork/KeccakCore.t.sol -vv

# BLS 测试需要支持 EIP-2537 的 EVM：
RUN_EIP2537=true forge test --match-path test/unit/DrandQuicknetAdapter.t.sol --evm-version osaka -vv
```

## 快速开始（SDK）

`taperng-sdk` 已发布到 npm（随包附带 TypeScript 源码，viem `^2` 为 peer
依赖）：

```bash
npm install taperng-sdk viem
```

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { createTapeRNG } from "taperng-sdk";
import { xlayerMainnet } from "./your-chain"; // 或自行内联定义 chain

const rng = createTapeRNG({
  publicClient: createPublicClient({ chain: xlayerMainnet, transport: http("https://rpc.xlayer.tech") }),
  walletClient, // 组织者的 viem WalletClient
  addresses: { tapeRng: "0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce" },
  chainId: 196,
});

// rng.createRequest(...) → reveal seed → finalize → 核验 proof
```

SDK 导出 `createTapeRNG`、`buildDraw`、`verifyDerivation`、`verifyBeacon`、
`load`/`evalNetlist` 以及两个合约 ABI。完整 API、离线 proof CLI 与 proof
格式见 `packages/sdk/README.md`。若要参与 SDK 本身的开发：

```bash
cd taperng/packages/sdk
pnpm install --ignore-workspace
pnpm test   # vitest；parity 测试将 TS 派生与 Solidity fixture 对比
```

## 快速开始（Web）

生产环境已上线 **https://tape.futool.com**（主网 196）；以下步骤用于本地运行。

```bash
cd taperng/apps/web
cp .env.example .env.local
# 填写 NEXT_PUBLIC_LOTTERY_ADDRESS / NEXT_PUBLIC_TAPE_RNG_ADDRESS
pnpm install --ignore-workspace
./node_modules/.bin/next dev
# 打开 http://localhost:3000
```

UI 有三个顶层页面：

- **`/`** — 视觉化落地页：hero、proof 终端、指标、五步流程、
  特性卡片、工作原理、最新 draws 与 roadmap。
- **`/demo`** — 在线 demo。表单预填年会抽奖示例；连接配置链上的
  injected 钱包后点击 **Publish draw**。在测试网/主网上钱包需要
  持有少量 OKB 作为 gas。
- **`/docs`** — SDK 功能、快速上手代码、发布 / 开奖 / proof /
  CLI 用法、TAP-02 与 drand 细节，以及安全边界。

三个页面都可以通过顶栏语言按钮在英文和中文之间切换。
钱包层是 **RainbowKit injected-only 模式**：连接弹窗只暴露
浏览器/injected 钱包连接器，不带 WalletConnect projectId。
非 injected 钱包 SDK 在 `next.config.mjs` 中被 stub 掉，
不会进入打包产物。

### Anvil 合约调试环境（仅构建者）

Anvil（X Layer 主网 fork，chain-id 31337）**仅用于构建者本人的合约级
调试 / 未来扩展研发**，与已发布的主网(196)前端完全解耦。Web 应用
**仅主网**，不再支持切换到 Anvil fork。全部编排脚本集中在
`taperng/contracts/anvil/`：

```bash
cd taperng/contracts
./anvil/start.sh          # 启动 osaka 主网 fork
./anvil/deploy.sh         # 部署真实 CPU + drand，写入 deployments/31337.json
./anvil/smoke.sh          # cast 级 smoke（circuitInfo/eval + 合约 code）
./anvil/debug.sh --start  # 一键：fork → deploy → smoke → SDK fork E2E
```

深度 fork E2E（真实 Keccak core + drand，happy / 缺 seed / 直发 / 过期 /
负向用例，SDK proof + TAP-02 回放）在 `packages/sdk/scripts/e2e-fork.mts`
（由 `debug.sh` 调用）。详见 `taperng/contracts/anvil/README.md`。

`TapeRNG` 在 `eval` 之前强制 `MIN_CIRCUIT_GAS = 5.2M`，gas limit 过低会
直接 revert，而不是带着 `circuitUsed=false` 静默开奖。

## 部署

```bash
cd taperng/contracts
export XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
export BEACON_MODE=drand      # drand | mock | none
export CPU_MODE=mock          # mock | real
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$XLAYER_TESTNET_RPC_URL" \
  --account taperng-deployer \
  --broadcast
```

脚本会写 `contracts/deployments/<chainId>.json` 并打印地址。把它们复制到
`config/addresses.json` 与 `apps/web/.env.local`。

> 不要把私钥放进仓库或聊天记录。使用专用部署钱包，并执行
> `cast wallet import taperng-deployer --interactive`。

## 主网合约地址（X Layer 196）

生产部署：**https://tape.futool.com**。已固化于 `config/addresses.json`，X Layer
上开发可用 `cast call` 直接读取：

| 合约 | 地址（点击在新标签打开 OKLink） |
|---|---|
| `TapeRNG`（协议） | <a href="https://www.okx.com/web3/explorer/xlayer/address/0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce" target="_blank" rel="noopener">`0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce`</a> |
| `LotteryDemo`（metadata-only 抽奖 demo） | <a href="https://www.okx.com/web3/explorer/xlayer/address/0xb76AE4c893982E4D25ADC4888c8784369Fbd578D" target="_blank" rel="noopener">`0xb76AE4c893982E4D25ADC4888c8784369Fbd578D`</a> |
| `DrandQuicknetAdapter`（drand 信标） | <a href="https://www.okx.com/web3/explorer/xlayer/address/0xa9c170404CaAa16BEff7bBc2AF8c2d0D428d7289" target="_blank" rel="noopener">`0xa9c170404CaAa16BEff7bBc2AF8c2d0D428d7289`</a> |

浏览器地址统一前缀：`https://www.okx.com/web3/explorer/xlayer/address/<address>`（与前端一致，点击地址即新标签直达）。

### TapeOut 电路 —— Keccak-256 IP Core

`TapeRNG` 用该电路混合熵源。每次请求都把 CPU 地址 / circuit ID / 网表哈希
固化在链上（可用 `TapeRNG.getRequest` 核验，例如 request `1`），使 proof 能
在链下回放同一份网表。输入 `nIn = 24` 字节预像，输出 `nOut = 24` 字节。

| 项目 | 值 |
|---|---|
| 处理器工厂 | <a href="https://www.okx.com/web3/explorer/xlayer/address/0x1f09DAeFA827f02CBb40967cc91b259763760761" target="_blank" rel="noopener">`0x1f09DAeFA827f02CBb40967cc91b259763760761`</a> |
| FAB-Genisis（fab 模板） | <a href="https://www.okx.com/web3/explorer/xlayer/address/0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6" target="_blank" rel="noopener">`0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6`</a> |
| **CPU / Keccak core 电路地址** | <a href="https://www.okx.com/web3/explorer/xlayer/address/0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb" target="_blank" rel="noopener">`0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb`</a> |
| circuitId | `3` |
| 网表哈希 | `0x998f29f1ad8dfab25871559ff695af7e6e7d0580cd73e6f1b07edeb10830600b` |
| 网表字节数 | `10416` |
| nIn / nOut | `24` / `24` |
| gateCount | `1488` |

直接从协议读取：

```bash
export RPC=https://rpc.xlayer.tech
cast call 0x3fadc14280A850dd31De8c7A83172Ded8BE717Ce \
  "getRequest(uint256)((address,address,bytes32,bytes32,bytes32,uint64,uint64,address,uint256,bytes32,uint32,uint32,uint32,bool,bool,bool,bool,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint8))" 1 --rpc-url $RPC
```

## 随机数如何派生

```text
ctx      = H(D0, chainId, lottery, participantsRoot, participantCount,
             winnerCount, prizeSpecHash, specHash)
commit   = H(D7, seed, ctx, organizer, chainId, tapeRng)
preSeed  = H(D1, chainId, tapeRng, requestId, ctx, organizerSeed,
             blockHash, beaconRandomness, cpu, circuitId, netlistHash,
             beaconRound, seedMissing, fallbackBlockhash)
mixIn    = first ceil(nIn/8) bytes of H(D2, preSeed)
mix      = H(D3, circuitId, netlistHash, cpu.eval(circuitId, mixIn))
finalSeed= H(D4, preSeed, mix, circuitUsed, seedMissing,
             fallbackBlockhash, beaconUsed)
```

赢家抽取是带拒绝采样的 partial Fisher-Yates（`D5`）；奖品槽位使用独立的
置换（`D6`）。TypeScript SDK 必须编码相同的 `uint32`/`uint64` 类型与
domain tags。

## 安全假设

- 组织者在 drand 轮次与未来区块哈希揭晓前提交；drand 轮次公布后无法再 reveal。
- drand quicknet 依赖 League of Entropy 的门限假设。
- 固定的 `revealBlock` 防止 keeper 挑选有利的区块；256 个区块后走过期路径，
  使用近期 blockhash 并显式标记。
- X Layer 的 sequencer 可以影响 blockhash / 审查交易；organizer 与 sequencer
  合谋仍是残余风险。本项目**不**宣称 trustlessness。
- 合约未经审计。vendored 的 BLS 库是实验性/未审计的。当前部署中 TapeOut
  工厂尚未封印；CPU/电路通过地址、circuit ID 与网表哈希固定，但生产部署前
  应重新核查。
- 奖品数据仅为 metadata；链上合约只存 `prizeSpecHash`，不存奖品清单。
  proof 内嵌规范化的 spec 并校验 `sum(quantity) == winnerCount`。

## Roadmap（Web UI 中同步展示）

- **Now**：X Layer 测试网 demo；organizer commit-reveal + drand quicknet +
  blockhash + TapeOut Keccak IP Core；行内 proof 核验。
- **Next 1**：自定义 TapeOut RNG 电路 / 流片（例如 32 位 NLFSR 或更大的
  Keccak 混合器）。
- **Next 2**：超越链上 BLS12-381 的高级密码学（BLS 验证的 zk proof、VDF、
  门限签名、后量子选项）。
- **Later**：更多消费者（NFT drops、游戏、fair launch）、多链 adapter、
  SDK 插件。
