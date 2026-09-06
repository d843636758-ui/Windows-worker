import path from "node:path";
import os from "node:os";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadWorkerConfig() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return {
    relayUrl: required("RELAY_URL"),
    workerId: process.env.WORKER_ID?.trim() || "windows-main",
    sharedSecret: required("WORKER_SHARED_SECRET"),
    edgeProfileDir: (process.env.EDGE_PROFILE_DIR || path.join(local, "AI-Browser-Worker", "edge-profile")).replace(/^%LOCALAPPDATA%/i, local),
    headed: !["0","false","no"].includes((process.env.HEADED || "true").toLowerCase()),
    alipayBotPath: process.env.ALIPAY_BOT_PATH || "alipay-bot",
    logDir: path.join(local, "AI-Browser-Worker", "logs"),
  };
}
