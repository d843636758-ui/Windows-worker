# Windows Browser Worker + AI Shopping

A split cloud/local MCP system that lets an authorized AI use a real Microsoft Edge session on a Windows PC. The Windows worker makes an outbound WebSocket connection to a small Zeabur relay; no inbound port, browser debugging port, or desktop-control API is exposed.

## What is included

- 23 MCP status, browser, Taobao shopping, and payment tools
- persistent, visible Edge profile so the user owns login and CAPTCHA steps
- one-time confirmations for risky clicks, checkout, and order submission
- hard blocks for passwords, OTPs, card numbers, CVV, and payment-password fields
- local-only `alipay-bot` execution with a strict official-cashier URL allowlist
- Windows Scheduled Task installer, uninstaller, logs, and doctor script
- Dockerized stateless MCP relay for Zeabur

## Quick start

1. Deploy `server/Dockerfile` to Zeabur and set the server variables from `.env.example`.
2. Copy this project to the Windows PC, install Node.js 20+ and Microsoft Edge.
3. Run `npm install` and `npm run build` in PowerShell.
4. Copy `.env.example` to `.env`, set the same `WORKER_SHARED_SECRET`, and set `RELAY_URL=wss://YOUR-DOMAIN/worker`.
5. Optionally install the official payment helper: `npx -y @alipay/agent-payment@latest install-cli`.
6. Run `powershell -ExecutionPolicy Bypass -File worker/scripts/install-startup.ps1`.
7. Connect the MCP client to `https://YOUR-DOMAIN/mcp` using `MCP_AUTH_TOKEN` as its bearer token.

## Official Taobao desktop integration

The existing Windows worker can also call the official Taobao desktop CLI, so
Taobao shopping does not depend on an Edge login. Install and sign in to the
official Taobao desktop client on the same Windows machine, then restart the
worker. It discovers `%APPDATA%\\taobao\\install-location.txt` automatically.
Set `TAOBAO_NATIVE_PATH` only when the CLI is installed elsewhere.

Native tools are exposed with the `taobao_native_` prefix. Product search,
page reading, and SKU inspection are read-only. Adding to cart and sending
WangWang messages use short-lived, one-time confirmation tokens.

Read [docs/WINDOWS.md](docs/WINDOWS.md), [docs/ZEABUR.md](docs/ZEABUR.md), and [docs/SECURITY.md](docs/SECURITY.md) before real shopping.

## Commands

```powershell
npm install
npm run build
npm test
powershell -ExecutionPolicy Bypass -File worker/scripts/doctor.ps1
```

This package is ready to deploy but intentionally does not create a repository or modify a cloud service by itself.
