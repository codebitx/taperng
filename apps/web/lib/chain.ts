import {
  createPublicClient,
  http,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { chain, rpcUrl } from "./config";

/** Read-only viem client used by the server and the browser SDK helpers. */
export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

/**
 * 轮询交易收据。
 *
 * 不用 viem 的 waitForTransactionReceipt：它在替换交易检测分支里会调用
 * eth_getBlockByNumber(receipt.blockNumber, true)。X Layer 的 Flashblock
 * 预确认块号可能暂时领先 canonical 链头，RPC 返回 "block is out of range"
 * （不是 viem 只会重试的 BlockNotFoundError），等待会直接失败。
 * 这里只轮询 eth_getTransactionReceipt，对瞬时节点差异更宽容。
 */
export async function waitForReceipt(
  hash: Hex,
  { timeoutMs = 180_000, intervalMs = 1_000 } = {},
): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      // 尚未确认或 RPC 瞬时错误，继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    "Transaction not confirmed yet; refresh the page to check its status",
  );
}
