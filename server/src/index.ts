import { createServer } from "node:http";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { WorkerError } from "@local-browser/shared";
import { loadConfig } from "./config.js";
import { WorkerRelay } from "./relay.js";
import { definitions, runTool } from "./tools.js";
import {mountOAuth, oauthAuthorized} from "./oauth.js";

const config = loadConfig();
const app = express();
app.use(express.json({limit: "6mb"}));
const httpServer = createServer(app);
const relay = new WorkerRelay(config);

function bearer(req: express.Request) { return req.headers.authorization?.replace(/^Bearer\s+/i, "") || ""; }
function authorized(req: express.Request) { const token = bearer(req); return token === config.mcpToken || oauthAuthorized(token); }

mountOAuth(app, config.mcpToken);

app.get("/", (_req, res) => res.json({ok:true, service:"windows-browser-worker", version:"0.1.0", mcp:"/mcp", worker:relay.status()}));
app.get("/healthz", (_req, res) => res.json({ok:true}));

app.post("/mcp", async (req, res) => {
  if (!authorized(req)) {
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0]!.trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host).split(",")[0]!.trim();
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource/mcp"`);
    return res.status(401).json({error:"unauthorized"});
  }
  if (!isInitializeRequest(req.body) && !req.body?.method) return res.status(400).json({error:"invalid_mcp_request"});
  const mcp = new McpServer({name:"windows-browser-worker",version:"0.1.0"});
  for (const def of definitions) {
    mcp.registerTool(def.name, {description:def.description,inputSchema:def.schema}, async (args: Record<string, unknown>) => {
      try {
        const result = await runTool(relay, def.name, args);
        if (def.name === "browser_screenshot" && typeof (result as any)?.base64 === "string" && Buffer.byteLength((result as any).base64, "base64") > config.maxScreenshotBytes) throw new WorkerError("SCREENSHOT_TOO_LARGE", "Screenshot exceeded server limit");
        return {content:[{type:"text" as const,text:JSON.stringify(result)}]};
      } catch (error) {
        const e = error instanceof WorkerError ? error : new WorkerError("INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error");
        return {isError:true,content:[{type:"text" as const,text:JSON.stringify({ok:false,error:{code:e.code,message:e.message}})}]};
      }
    });
  }
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  res.on("close", () => { void transport.close(); void mcp.close(); });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.all("/mcp", (req, res) => {
  if (!authorized(req)) return res.status(401).json({error:"unauthorized"});
  return res.status(405).json({error:"Use POST for stateless MCP"});
});

httpServer.on("upgrade", (request, socket, head) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/worker") { socket.destroy(); return; }
  relay.upgrade(request, socket, head);
});

httpServer.listen(config.port, "0.0.0.0", () => console.log(`windows-browser-worker listening on :${config.port}`));
