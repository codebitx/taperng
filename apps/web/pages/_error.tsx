import type { NextPageContext } from "next";

function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#08111a",
        color: "#e6f0f7",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#35e0b0", letterSpacing: 2 }}>TapeRNG</p>
        <h1 style={{ fontSize: 72, margin: 0 }}>{statusCode}</h1>
        <p style={{ color: "#8ea6b8" }}>This page could not be found.</p>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 404,
});

export default ErrorPage;
