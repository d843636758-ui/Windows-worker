# Zeabur deployment

Create a service from this source and select `server/Dockerfile`. Expose HTTP on the platform-provided `PORT` and attach an HTTPS domain.

Set:

- `MCP_AUTH_TOKEN`: random secret of at least 24 characters
- `WORKER_SHARED_SECRET`: a different random secret of at least 24 characters
- `ALLOW_WORKERS=windows-main`
- `REQUEST_TIMEOUT_MS=120000`
- `MAX_SCREENSHOT_BYTES=4000000`
- `DATA_DIR=/data`

Attach a persistent volume at `/data`. OAuth registrations are stored there so
ChatGPT connections survive restarts and redeployments. Existing ChatGPT client
IDs can also be recovered safely after a restart.

Health check: `/healthz`. MCP URL: `/mcp`. Worker WebSocket: `/worker` (use `wss://` on Windows). Do not publish either secret in source control or screenshots. Only one live connection per worker ID is accepted; a new valid connection replaces the old one.
