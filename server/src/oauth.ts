import {createHash, createHmac, randomBytes, timingSafeEqual} from "node:crypto";
import {mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import express from "express";

type Client = {redirectUris:string[];expires:number};
type Code = {clientId:string;redirectUri:string;challenge:string;expires:number};

const codes = new Map<string, Code>();

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

function validRedirect(value:string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "chatgpt.com" || host.endsWith(".chatgpt.com") ||
      host === "openai.com" || host.endsWith(".openai.com")
    );
  } catch { return false; }
}

function loadClients(path:string):Map<string, Client> {
  try {
    const rows = JSON.parse(readFileSync(path,"utf8")) as Record<string, Client>;
    const now = Date.now();
    return new Map(Object.entries(rows).filter(([,client]) =>
      Array.isArray(client?.redirectUris) && client.expires > now
    ));
  } catch { return new Map(); }
}

function persistClients(path:string, clients:Map<string, Client>) {
  const slash = path.lastIndexOf("/");
  if (slash > 0) mkdirSync(path.slice(0,slash),{recursive:true});
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary,JSON.stringify(Object.fromEntries(clients)),{mode:0o600});
  renameSync(temporary,path);
}

function signToken(connectionSecret:string, expires:number) {
  const body = Buffer.from(JSON.stringify({aud:"windows-browser-worker",exp:expires})).toString("base64url");
  const signature = createHmac("sha256",connectionSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function oauthAuthorized(token:string, connectionSecret:string) {
  try {
    const [body,signature] = token.split(".");
    if (!body || !signature) return false;
    const expected = createHmac("sha256",connectionSecret).update(body).digest();
    const actual = Buffer.from(signature,"base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return false;
    const payload = JSON.parse(Buffer.from(body,"base64url").toString()) as {aud?:string;exp?:number};
    return payload.aud === "windows-browser-worker" && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch { return false; }
}

export function mountOAuth(app:express.Express, connectionSecret:string, dataDir="/data") {
  const clientStorePath = `${dataDir.replace(/\/$/,"")}/mcp-oauth-clients.json`;
  const clients = loadClients(clientStorePath);
  const saveClients = () => persistClients(clientStorePath,clients);
  const recoverClient = (clientId:string, redirectUri:string) => {
    let client = clients.get(clientId);
    if (client?.expires && client.expires > Date.now()) return client;
    // ChatGPT keeps its dynamically registered client_id across service restarts.
    // Recovery is limited to official HTTPS callbacks; the owner secret is still
    // required before an authorization code can be issued.
    if (!clientId || !validRedirect(redirectUri)) return undefined;
    client = {redirectUris:[redirectUri],expires:Date.now()+30*24*60*60_000};
    clients.set(clientId,client);
    try { saveClients(); } catch (error) { console.error("Unable to persist recovered OAuth client",error); }
    return client;
  };
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (req,res) => {
    const base = origin(req);
    res.json({resource:`${base}/mcp`,authorization_servers:[base],bearer_methods_supported:["header"]});
  });
  app.get(["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp", "/.well-known/openid-configuration"], (req,res) => {
    const base = origin(req);
    res.json({issuer:base,authorization_endpoint:`${base}/oauth/authorize`,token_endpoint:`${base}/oauth/token`,registration_endpoint:`${base}/oauth/register`,response_types_supported:["code"],grant_types_supported:["authorization_code"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"]});
  });
  app.post("/oauth/register", (req,res) => {
    const redirects = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.filter((v:unknown):v is string => typeof v === "string" && validRedirect(v)) : [];
    if (!redirects.length) return res.status(400).json({error:"invalid_redirect_uri"});
    const clientId = id(18);
    clients.set(clientId,{redirectUris:redirects,expires:Date.now()+30*24*60*60_000});
    try { saveClients(); } catch (error) { console.error("Unable to persist OAuth client registration",error); }
    res.status(201).json({client_id:clientId,redirect_uris:redirects,token_endpoint_auth_method:"none",grant_types:["authorization_code"],response_types:["code"]});
  });
  app.get("/oauth/authorize", (req,res) => {
    const q = req.query as Record<string,string>;
    const client = recoverClient(q.client_id,q.redirect_uri);
    if (!client || !client.redirectUris.includes(q.redirect_uri) || q.response_type !== "code" || q.code_challenge_method !== "S256" || !q.code_challenge) return res.status(400).send("Invalid OAuth request");
    const hidden = ["client_id","redirect_uri","state","code_challenge"].map(k=>`<input type="hidden" name="${k}" value="${esc(q[k] || "")}">`).join("");
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width"><title>连接 Windows Browser</title><style>body{font-family:system-ui;background:#f7f4ef;margin:0;padding:32px;color:#2b211d}.card{max-width:460px;margin:10vh auto;background:white;padding:28px;border-radius:22px;box-shadow:0 12px 40px #0001}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:12px;border-radius:12px;border:1px solid #d8ccc5;font-size:16px}button{background:#2b211d;color:white;font-weight:700}</style><main class="card"><h1>连接 Windows Browser</h1><p>输入 Worker 的 MCP 连接密钥以授权 ChatGPT。密钥只提交到你自己的服务。</p><form method="post" action="/oauth/authorize">${hidden}<input type="password" name="secret" autocomplete="current-password" placeholder="MCP 连接密钥" required><button type="submit">授权连接</button></form></main>`);
  });
  app.post("/oauth/authorize", express.urlencoded({extended:false}), (req,res) => {
    const {client_id,redirect_uri,state,code_challenge,secret} = req.body as Record<string,string>;
    const client = clients.get(client_id);
    if (!client || client.expires < Date.now() || !client.redirectUris.includes(redirect_uri) || secret !== connectionSecret) return res.status(403).type("html").send("连接密钥不正确或授权请求已过期，请返回后重试。");
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
    const expiresIn = 30*24*60*60;
    const accessToken = signToken(connectionSecret,Date.now()+expiresIn*1000);
    res.json({access_token:accessToken,token_type:"Bearer",expires_in:expiresIn});
  });
}
