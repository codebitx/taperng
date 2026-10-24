#!/usr/bin/env bash
# 启动 X Layer 主网(196) 的本地 Anvil fork，仅供合约调试 / 扩展研发，勿用于主网。
#
# 用法:
#   ./anvil/start.sh                         # 最新主网区块
#   FORK_BLOCK_NUMBER=73700790 ./anvil/start.sh   # 固定区块（可复现）
#
# 环境变量:
#   FORK_RPC_URL     fork 源 RPC（默认 https://rpc.xlayer.tech）
#   ANVIL_PORT       本地端口（默认 8545）
#   ANVIL_GAS_LIMIT  区块 gas limit（默认 30000000，主网真实 CPU 的 eval 需 ~3.5M）
#   FORK_BLOCK_NUMBER 固定 fork 区块（可选，省略则拉最新）
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_RPC="${FORK_RPC_URL:-https://rpc.xlayer.tech}"
PORT="${ANVIL_PORT:-8545}"
GAS_LIMIT="${ANVIL_GAS_LIMIT:-30000000}"

FORK_BLOCK=()
if [[ -n "${FORK_BLOCK_NUMBER:-}" ]]; then
  FORK_BLOCK=(--fork-block-number "${FORK_BLOCK_NUMBER}")
fi

echo "启动 Anvil fork: 源=${FORK_RPC} chain-id=31337 hardfork=osaka(EIP-2537) 端口=${PORT}"
exec anvil \
  --fork-url "${FORK_RPC}" \
  --chain-id 31337 \
  --hardfork osaka \
  --gas-limit "${GAS_LIMIT}" \
  --port "${PORT}" \
  "${FORK_BLOCK[@]}" \
  "$@"