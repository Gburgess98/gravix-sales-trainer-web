// src/app/not-found.tsx
// Global 404 page for the App Router

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          404 — Page not found
        </h1>
        <p style={{ opacity: 0.8 }}>The page you’re looking for doesn’t exist.</p>
      </div>
    </div>
  );
}