import path from "node:path";

/**
 * The app only supports the injected browser wallet.  RainbowKit's package
 * index still imports the other wallet connectors, which pull in WalletConnect,
 * MetaMask SDK, Coinbase/Base and x402 SDKs.  Stub those optional SDKs out so
 * the dev server stays within the small machine's memory budget and the bundle
 * only contains the injected connector path.
 */
const unusedWalletSdks = [
  "@walletconnect/ethereum-provider",
  "@metamask/sdk",
  "@coinbase/wallet-sdk",
  "@coinbase/cdp-sdk",
  "@base-org/account",
  "@x402/evm",
  "@x402/svm",
  "@x402/svm/exact/client",
  "@safe-global/safe-apps-provider",
  "@safe-global/safe-apps-sdk",
  "pino-pretty",
  "@react-native-async-storage/async-storage",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // taperng-sdk 是本地 workspace 的 ESM+TS 源码包，需让 Next 直接转译。
  transpilePackages: ["taperng-sdk"],
  outputFileTracingRoot: path.resolve(process.cwd()),
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    // 静态预渲染页(/) 默认带 s-maxage=31536000(共享缓存 1 年)，会导致构建后
    // 浏览器/Nginx/CDN 仍命中旧 HTML。这里把文档响应头改为 no-store：
    // 每次更新后无需清缓存即可看到新界面，JS/CSS 仍走带 hash 的资源缓存。
    return [
      { source: "/", headers: [{ key: "Cache-Control", value: "no-store" }] },
      {
        source: "/demo",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/docs",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(unusedWalletSdks.map((id) => [id, false])),
    };
    return config;
  },
};

export default nextConfig;
