#!/usr/bin/env bash
# 向本地 Anvil fork 部署【真实 Keccak CPU + drand】版本的 TapeRNG/LotteryDemo，
# 产物写入 deployments/{chainId}.json（即 deployments/31337.json）。
# 复用根目录 script/Deploy.s.sol（环境无关，靠 block.chainid 落盘），此处无需改合约。
#
# 用法:
#   ./anvil/deploy.sh
#
# 环境变量:
#   ANVIL_RPC          本地 fork RPC（默认 http://127.0.0.1:8545）
#   ANVIL_PRIVATE_KEY  fork 上的签名私钥（默认 Anvil 标准测试私钥 0xac09...ff80，
#                      「仅本地 fork 使用，勿用于主网、勿提交仓库/外传」）
set -euo pipefail
cd "$(dirname "$0")/.."

RPC="${ANVIL_RPC:-http://127.0.0.1:8545}"
# Anvil 默认测试账户 #0（Anvil 启动时打印的预售私钥）。仅在本地 fork 有效。
KEY="${ANVIL_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "== verify 本地 fork ==="
CHAIN_ID="$(cast chain-id --rpc-url "${RPC}")"
if [[ "${CHAIN_ID}" != "31337" ]]; then
  echo "错误: 期望 31337 (Anvil 主网 fork)，实际拿到 ${CHAIN_ID}。请先运行 ./anvil/start.sh" >&2
  exit 1
fi
echo "本地 fork OK (chainId=31337)"

echo "== 部署真实 CPU + drand =="
CPU_MODE=real \
CPU_ADDRESS=0xd5bc8e63950AA26f0A633D1d9851a20Feacac5Bb \
CIRCUIT_ID=3 \
BEACON_MODE=drand \
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "${RPC}" \
  --private-key "${KEY}" \
  --broadcast

echo "部署完成，产物见 deployments/31337.json"