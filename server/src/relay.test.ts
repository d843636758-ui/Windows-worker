import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

test("requires long independent secrets", () => {
  const old = {...process.env};
  process.env.WORKER_SHARED_SECRET = "x";
  process.env.MCP_AUTH_TOKEN = "y";
  assert.throws(() => loadConfig(), /at least 24/);
  process.env = old;
});
