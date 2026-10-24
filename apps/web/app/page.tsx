"use client";

import Link from "next/link";
import { EntropyFlow } from "@/components/EntropyFlow";
import { Header } from "@/components/Header";
import { useI18n } from "@/components/LanguageProvider";
import { Roadmap } from "@/components/Roadmap";
import { landingContent } from "@/lib/landing";

export default function HomePage() {
  const { t, locale } = useI18n();
  const content = landingContent(locale);

  return (
    <div className="page landing-page">
      <Header />
      <main>
        <section className="landing-hero">
          <div className="landing-visual">
            <div className="orb orb-a" />
            <div className="orb orb-b" />
            <EntropyFlow />
            <p className="landing-visual-note">
              <strong>{content.visualNoteStrong}</strong> {content.visualNote}
            </p>
          </div>

          <div className="landing-copy">
            <span className="eyebrow">{content.eyebrow}</span>
            <h1>
              {content.title}{" "}
              <span className="gradient-text">{content.titleAccent}</span>
            </h1>
            <p>{content.subtitle}</p>
            <div className="metrics">
              {content.metrics.map((metric) => (
                <div className="metric" key={metric.label}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flow-section" aria-labelledby="flow-title">
          <div className="section-heading">
            <span className="eyebrow">Protocol</span>
            <h2 id="flow-title">{content.flowTitle}</h2>
          </div>
          <div className="flow-steps">
            {content.flow.map((step) => (
              <article className="flow-step" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section" aria-labelledby="feature-title">
          <div className="section-heading">
            <span className="eyebrow">TapeRNG</span>
            <h2 id="feature-title">{content.featuresTitle}</h2>
          </div>
          <div className="feature-grid">
            {content.features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="how-section" aria-labelledby="how-title">
          <div className="section-heading">
            <span className="eyebrow">Demo</span>
            <h2 id="how-title">{content.howTitle}</h2>
          </div>
          <div className="how-grid">
            {content.how.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section" aria-labelledby="tapeout-title">
          <div className="section-heading">
            <span className="eyebrow">TapeOut</span>
            <h2 id="tapeout-title">{content.tapeoutTitle}</h2>
          </div>
          <div className="feature-grid">
            {content.tapeoutUses.map((item) => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section" aria-labelledby="audience-title">
          <div className="section-heading">
            <span className="eyebrow">TapeRNG</span>
            <h2 id="audience-title">{content.audienceTitle}</h2>
          </div>
          <div className="feature-grid">
            {content.audiences.map((item) => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section" aria-labelledby="business-title">
          <div className="section-heading">
            <span className="eyebrow">TapeRNG</span>
            <h2 id="business-title">{content.businessTitle}</h2>
          </div>
          <div className="feature-grid">
            {content.businesses.map((item) => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section" aria-labelledby="why-title">
          <div className="section-heading">
            <span className="eyebrow">TapeRNG</span>
            <h2 id="why-title">{content.whyTitle}</h2>
          </div>
          <div className="feature-grid">
            {content.whys.map((item) => (
              <article className="feature-card" key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <Roadmap />

        <section className="landing-cta">
          <div>
            <span className="eyebrow">{content.demoEyebrow}</span>
            <h2>{content.demoTitle}</h2>
            <p>{content.demoSubtitle}</p>
          </div>
          <div className="cta-row">
            <Link className="primary" href="/demo">
              {content.ctaDemo}
            </Link>
            <Link className="ghost" href="/docs">
              {content.ctaDocs}
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <p>{t("footer")}</p>
        <Link href="/docs" className="footer-link">
          {t("docsLink")}
        </Link>
      </footer>
    </div>
  );
}
