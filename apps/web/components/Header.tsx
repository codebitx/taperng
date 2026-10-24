"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { chain } from "@/lib/config";
import { useI18n } from "./LanguageProvider";

export function Header() {
  const { t, toggleLocale } = useI18n();
  const pathname = usePathname() ?? "";

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span className="brand-mark">TR</span>
        <span>
          <strong>{t("appName")}</strong>
          <small>{t("tagline")}</small>
        </span>
      </Link>
      <nav className="main-nav" aria-label="Main">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          {t("nav.home")}
        </Link>
        <Link
          className={
            pathname === "/demo" || pathname.startsWith("/draws")
              ? "active"
              : ""
          }
          href="/demo"
        >
          {t("nav.demo")}
        </Link>
        <Link
          className={pathname.startsWith("/docs") ? "active" : ""}
          href="/docs"
        >
          {t("nav.docs")}
        </Link>
      </nav>
      <div className="header-actions">
        <span className="network-chip">{chain.name}</span>
        <button className="ghost" type="button" onClick={toggleLocale}>
          {t("language")}
        </button>
        <div className="wallet-connect">
          <ConnectButton
            showBalance={false}
            accountStatus="address"
            chainStatus="icon"
          />
        </div>
      </div>
    </header>
  );
}
