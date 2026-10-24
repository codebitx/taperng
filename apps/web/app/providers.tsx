"use client";

import {
  darkTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { useI18n } from "@/components/LanguageProvider";
import { ToastProvider } from "@/components/Toast";
import { chain } from "@/lib/config";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#35e0b0",
            accentColorForeground: "#04131c",
            borderRadius: "large",
            fontStack: "system",
          })}
          modalSize="compact"
          initialChain={chain}
          locale={locale === "zh" ? "zh-CN" : "en-US"}
          appInfo={{ appName: "TapeRNG" }}
        >
          <ToastProvider>{children}</ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
