# Anvil 合约调试环境（内部 · 构建者专用）

> **定位**：anvil（X Layer 主网 196 的本地 fork，chainId `31337` / `127.0.0.1:8545`）
> 是本项目的**合约调试 / 后续扩展研发**跑场，**仅供项目原始构建者使用**，
> 与对外发布的 X Layer 主网(196)完全解耦。
>
> **对外发布（web / SDK）统一以主网 196 为准**，前端已 mainnet-only，
> 不再包含 anvil 分支（`lib/config.ts` 单链、无 switch-env / anvil.env / fork 库）。

本目录把历史上散落在 anvil 联调阶段各文档中的
复现步骤收拢成脚本，方便在**合约层**验证 TapeRNG 的真实 Keccak电路 + drand 集成。

## 为什么存在

- 主网真实 CPU `0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb`（FAB-Genisis 承载
  Keccak core #3，circuitId=3）由 fork 复用主网世界状态，无需重部署即可 `cast call` 调试。
- 使用 `--hardfork osaka` 启用 EIP-2537（drand quicknet 验签所需的 precompile）。
- 本地 fork 上可以直接控制时间抽/挖块（`anvil_mine` / `evm_setNextBlockTimestamp`），
  这在主网上无法做到，是**调试时序逻辑（commit-reveal、256 块 finalize 窗口）唯一途径**。

## 脚本一览

| 脚本 | 作用 |
|---|---|
| `start.sh`  | 启动 X Layer 主网 fork（chain-id 31337 / osaka / gas-limit 30M）；`FORK_BLOCK_NUMBER=<块>` 可固定区块复现 |
| `deploy.sh` | 部署【真实 CPU + drand】版 `TapeRNG`/`LotteryDemo`，产物写 `deployments/31337.json`（复用 `script/Deploy.s.sol`） |
| `smoke.sh`  | 合约级冒烟：cast 直读 `circuitInfo(3)`/`eval(3,0x123456)`，并确认本轮部署合约有代码 |
| `debug.sh`  | 一键联调：就绪校验 → 部署 → 冒烟 → SDK fork E2E（复用 `packages/sdk/scripts/e2e-fork.mts`） |

另有深层联调脚本：`packages/sdk/scripts/e2e-fork.mts`（真实 drand、负向用例、
missing-seed、过期 fallback、SDK proof + TAP-02 replay）。

## 快速开始

```bash
# 最省事：一键（自动起 fork → 部署 → 冒烟 → 深测，结束后自动关 fork）
cd taperng/contracts
./anvil/debug.sh --start

# 或分步：
./anvil/start.sh                     # 终端 1：起 fork（前台；可加 FORK_BLOCK_NUMBER=<块>）
# 终端 2：
./anvil/deploy.sh
./anvil/smoke.sh
cd ../packages/sdk && ANVIL_PRIVATE_KEY=0xac0974...ff80 node_modules/.bin/tsx scripts/e2e-fork.mts
```

固定到与历史联调报告一致的区块（结果可复现）：

```bash
FORK_BLOCK_NUMBER=73700790 ./anvil/start.sh
```

## 关键常量（来自主网 fork 世界状态，勿改动）

- 真实 CPU：`0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb`，circuitId=`3`
- `circuitInfo(3)` = `(24,24,0,1488)`；netlist `10,416` 字节
- `eval(3, 0x123456)` = `0xf6ec15`

## 安全与边界（务必遵守）

- **anvil 测试私钥**（默认 `0xac09...ff80`）为 Anvil 启动时打印的公开测试私钥，
  **仅可在本地 fork 使用，绝不可用于主网，也不要提交仓库 / 外传**。
- fork 上所有 commitment/context/proof 使用 **chainId 31337**；主网部署用 **196**，
  二者会得到不同的 seed/commitment/proof。**fork 结果用于验证行为/gas/集成，不能作为主网 proof 复用**；
  主网部署后需重新跑最小 draw 与完整示例。
- 本目录只服务**合约调试**。若需在主网复现 / 验证一笔 draw，用：
  `taperng/apps/web/scripts/verify-draw.ts`（只读、无链上副作用）。