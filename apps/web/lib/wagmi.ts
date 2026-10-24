import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
  injected,
} from "wagmi";
import { xlayerMainnet, rpcUrl } from "./config";

/**
 * Injected-only RainbowKit config: no WalletConnect projectId and no
 * WalletConnect QR flow.  The modal lists the browser wallet(s) discovered
 * through EIP-1193 (`window.ethereum`).
 *
 * 对外发布统一以 X Layer 主网(196) 为准，不再注册 anvil/testnet 链。
 */
export const wagmiConfig = createConfig({
  chains: [xlayerMainnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [xlayerMainnet.id]: http(rpcUrl),
  },
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
