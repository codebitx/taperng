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
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
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
