export default function Home() {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      fontFamily: "sans-serif",
      flexDirection: "column",
      gap: "10px"
    }}>
      <h1>🚀 Backend работает</h1>
      <p>Проверь /api маршруты.</p>
    </div>
  );
}
