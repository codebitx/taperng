#!/usr/bin/env bash
# 一键合约级联调：确保本地 fork 就绪 → 部署真实 CPU+drand → 冒烟 → SDK fork E2E。
# 仅供构建者合约调试 / 扩展研发使用，与对外发布(mainnet)完全解耦。
#
# 用法:
#   ./anvil/debug.sh                  # 复用已在跑的 fork；否则自动启动
#   ./anvil/debug.sh --start          # 强制自己启动 fork（固定区块可加 FORK_BLOCK_NUMBER）
#
# 完成后会自动清理自启动的 anvil 进程；复用已存在的 fork 则不去动它。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"          # taperng/
cd "$ROOT"

RPC="${ANVIL_RPC:-http://127.0.0.1:8545}"
ANVIL_KEY="${ANVIL_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

# --- fork 就绪性 ----------------------------------------------------------
ANVIL_PID=""
chain_ready() { cast chain-id --rpc-url "$RPC" 2>/dev/null | grep -qx "31337"; }

if [[ "${1:-}" == "--start" ]] || ! chain_ready; then
  if chain_ready; then
    echo "检测到本地 fork 已在运行(31337)，复用。"
  else
    echo "启动 Anvil fork ..."
    ./anvil/start.sh >/tmp/taperng-anvil.log 2>&1 &
    ANVIL_PID=$!
    for _ in $(seq 1 30); do
      chain_ready && break
      sleep 1
    done
    chain_ready || { echo "anvil 启动失败，见 /tmp/taperng-anvil.log"; exit 1; }
    echo "anvil 就绪 (chainId=31337)"
  fi
else
  chain_ready || { echo "本地 fork 未在运行，请先 ./anvil/start.sh 或 ./anvil/debug.sh --start"; exit 1; }
fi

cleanup() { if [[ -n "$ANVIL_PID" ]]; then kill "$ANVIL_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

# --- 部署 + 冒烟 -----------------------------------------------------------
echo
echo "===== 部署真实 CPU + drand ====="
ANVIL_PRIVATE_KEY="$ANVIL_KEY" ./anvil/deploy.sh

echo
echo "===== 合约级冒烟 ====="
ANVIL_RPC="$RPC" ./anvil/smoke.sh

# --- SDK 合约级深测 --------------------------------------------------------
echo
echo "===== SDK fork E2E（真实 drand + 负向 + fallback + proof）====="
cd "$ROOT/packages/sdk"
ANVIL_PRIVATE_KEY="$ANVIL_KEY" RPC_URL="$RPC" \
  node_modules/.bin/tsx scripts/e2e-fork.mts

echo
echo "合约级联调全部通过。自启的 anvil 已自动关闭。"