import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "TapeRNG — verifiable randomness on X Layer",
  description:
    "Commit-reveal + drand quicknet + X Layer blockhash + TapeOut circuit. Request a verifiable final seed in one flow.",
  // public/favicon.ico 内置 16–256px 六个尺寸，这里显式声明，避免浏览器只取 16px。
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48 64x64 128x128 256x256",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <Providers>{children}</Providers>
        </LanguageProvider>
      </body>
    </html>
  );
}
