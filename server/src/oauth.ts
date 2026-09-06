import {createHash, randomBytes} from "node:crypto";
import express from "express";

type Client = {redirectUris:string[]};
type Code = {clientId:string;redirectUri:string;challenge:string;expires:number};

const clients = new Map<string, Client>();
const codes = new Map<string, Code>();
const tokens = new Map<string, number>();

function id(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
function esc(value:string) { return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
function origin(req:express.Request) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0]!.trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host).split(",")[0]!.trim();
  return `${proto}://${host}`;
}
function verifierMatches(verifier:string, challenge:string) {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export function oauthAuthorized(token:string) {
  const expiry = tokens.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) { tokens.delete(token); return false; }
  return true;
}

export function mountOAuth(app:express.Express, connectionSecret:string) {
  app.get("/.well-known/oauth-protected-resource/mcp", (req,res) => {
    const base = origin(req);
    res.json({resource:`${base}/mcp`,authorization_servers:[base],bearer_methods_supported:["header"]});
  });
  app.get("/.well-known/oauth-authorization-server", (req,res) => {
    const base = origin(req);
    res.json({issuer:base,authorization_endpoint:`${base}/oauth/authorize`,token_endpoint:`${base}/oauth/token`,registration_endpoint:`${base}/oauth/register`,response_types_supported:["code"],grant_types_supported:["authorization_code"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"]});
  });
  app.post("/oauth/register", (req,res) => {
    const redirects = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.filter((v:unknown):v is string => typeof v === "string" && /^https:\/\//.test(v)) : [];
    if (!redirects.length) return res.status(400).json({error:"invalid_redirect_uri"});
    const clientId = id(18);
    clients.set(clientId,{redirectUris:redirects});
    res.status(201).json({client_id:clientId,redirect_uris:redirects,token_endpoint_auth_method:"none",grant_types:["authorization_code"],response_types:["code"]});
  });
  app.get("/oauth/authorize", (req,res) => {
    const q = req.query as Record<string,string>;
    const client = clients.get(q.client_id);
    if (!client || !client.redirectUris.includes(q.redirect_uri) || q.response_type !== "code" || q.code_challenge_method !== "S256" || !q.code_challenge) return res.status(400).send("Invalid OAuth request");
    const hidden = ["client_id","redirect_uri","state","code_challenge"].map(k=>`<input type="hidden" name="${k}" value="${esc(q[k] || "")}">`).join("");
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width"><title>连接 Windows Browser</title><style>body{font-family:system-ui;background:#f7f4ef;margin:0;padding:32px;color:#2b211d}.card{max-width:460px;margin:10vh auto;background:white;padding:28px;border-radius:22px;box-shadow:0 12px 40px #0001}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:12px;border-radius:12px;border:1px solid #d8ccc5;font-size:16px}button{background:#2b211d;color:white;font-weight:700}</style><main class="card"><h1>连接 Windows Browser</h1><p>输入 Worker 的 MCP 连接密钥以授权 ChatGPT。密钥只提交到你自己的服务。</p><form method="post" action="/oauth/authorize">${hidden}<input type="password" name="secret" autocomplete="current-password" placeholder="MCP 连接密钥" required><button type="submit">授权连接</button></form></main>`);
  });
  app.post("/oauth/authorize", express.urlencoded({extended:false}), (req,res) => {
    const {client_id,redirect_uri,state,code_challenge,secret} = req.body as Record<string,string>;
    const client = clients.get(client_id);
    if (!client || !client.redirectUris.includes(redirect_uri) || secret !== connectionSecret) return res.status(403).type("html").send("连接密钥不正确，请返回后重试。");
    const code = id(24);
    codes.set(code,{clientId:client_id,redirectUri:redirect_uri,challenge:code_challenge,expires:Date.now()+5*60_000});
    const target = new URL(redirect_uri); target.searchParams.set("code",code); if (state) target.searchParams.set("state",state);
    res.redirect(303,target.toString());
  });
  app.post("/oauth/token", express.urlencoded({extended:false}), (req,res) => {
    const {grant_type,code,client_id,redirect_uri,code_verifier} = req.body as Record<string,string>;
    const record = codes.get(code);
    if (grant_type !== "authorization_code" || !record || record.expires < Date.now() || record.clientId !== client_id || record.redirectUri !== redirect_uri || !verifierMatches(code_verifier || "",record.challenge)) return res.status(400).json({error:"invalid_grant"});
    codes.delete(code);
    const accessToken = id(32); const expiresIn = 30*24*60*60;
    tokens.set(accessToken,Date.now()+expiresIn*1000);
    res.json({access_token:accessToken,token_type:"Bearer",expires_in:expiresIn});
  });
}
