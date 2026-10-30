
const app = require("./app");
const pool = require("./config/db");

const PORT = Number(process.env.PORT || 5000);
const HOST = "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`MediTrail backend listening on ${HOST}:${server.address().port}`);
});

server.on("error", (error) => {
  console.error("MediTrail HTTP server failed:", error.code || "server error");
  process.exitCode = 1;
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing MediTrail gracefully.`);

  const shutdownTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);
  shutdownTimer.unref();

  server.close(async (error) => {
    clearTimeout(shutdownTimer);
    if (error) {
      console.error("HTTP server shutdown failed:", error.code || "server error");
      process.exitCode = 1;
    }
    try {
      await pool.end();
    } catch {
      console.error("Database pool shutdown failed.");
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
