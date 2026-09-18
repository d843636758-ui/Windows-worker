# Windows setup

Use a normal (non-administrator) Windows account and a dedicated Edge profile. Close any Edge window using that same worker profile before starting the worker.

Create `.env` in the project root. Required values are `RELAY_URL`, `WORKER_SHARED_SECRET`, and optionally `WORKER_ID`. `EDGE_PROFILE_DIR` should point to a dedicated directory, not your everyday Edge profile.

The first browser launch is visible. Sign in to Taobao yourself and solve any CAPTCHA yourself. The worker persists the session but never receives a password or verification code through an MCP tool.

After build, run `worker/scripts/install-startup.ps1`. Logs are written under `%LOCALAPPDATA%\AI-Browser-Worker\logs`. Run `doctor.ps1` when the worker appears offline. The PC must be powered on, logged in, online, and awake for browser operations.

The same startup worker discovers the official Taobao desktop CLI automatically
from `%APPDATA%\taobao\install-location.txt`. Sign in to the official Taobao
desktop client yourself; no Taobao password, SMS code, or cookie is sent to the
relay. To update an existing installation after this feature is deployed, run
`worker/scripts/update-worker.ps1` once from PowerShell.

To remove automatic startup, run `worker/scripts/uninstall-startup.ps1`. It deliberately preserves the dedicated browser profile and logs.
