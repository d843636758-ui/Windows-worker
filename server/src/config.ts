export type ServerConfig = ReturnType<typeof loadConfig>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig() {
  const workerSecret = required("WORKER_SHARED_SECRET");
  const mcpToken = required("MCP_AUTH_TOKEN");
  if (workerSecret.length < 24 || mcpToken.length < 24) {
    throw new Error("WORKER_SHARED_SECRET and MCP_AUTH_TOKEN must be at least 24 characters");
  }
  return {
    port: Number(process.env.PORT || 8080),
    workerSecret,
    mcpToken,
    allowedWorkers: new Set((process.env.ALLOW_WORKERS || "windows-main").split(",").map(v => v.trim()).filter(Boolean)),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 180_000),
    maxScreenshotBytes: Number(process.env.MAX_SCREENSHOT_BYTES || 5_000_000),
  };
}
