import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <main>
        <section className="demo-hero">
          <span className="eyebrow">404</span>
          <h1>Page not found</h1>
          <p>
            <Link className="inline-link" href="/">
              Back to TapeRNG
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
