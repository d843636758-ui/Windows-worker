import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { WorkerHeartbeat, WorkerHello, WorkerResult, type WorkerResultMessage, WorkerError } from "@local-browser/shared";
import type { ServerConfig } from "./config.js";

type Pending = {resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout};
type WorkerState = {socket: WebSocket; workerId: string; capabilities: string[]; connectedAt: string; lastSeen: string; browserReady: boolean; paymentReady: boolean; currentUrl?: string; tabs?: number};

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class WorkerRelay {
  private readonly wss = new WebSocketServer({noServer: true});
  private readonly workers = new Map<string, WorkerState>();
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly config: ServerConfig) {
    this.wss.on("connection", socket => this.accept(socket));
  }

  upgrade(request: IncomingMessage, socket: any, head: Buffer) {
    this.wss.handleUpgrade(request, socket, head, ws => this.wss.emit("connection", ws, request));
  }

  status(workerId = "windows-main") {
    const state = this.workers.get(workerId);
    if (!state || state.socket.readyState !== WebSocket.OPEN) return {worker_id: workerId, online: false};
    return {worker_id: workerId, online: true, browser_ready: state.browserReady, payment_ready: state.paymentReady, capabilities: state.capabilities, connected_at: state.connectedAt, last_seen: state.lastSeen, current_url: state.currentUrl, tabs: state.tabs};
  }

  async dispatch(tool: string, args: Record<string, unknown>, workerId = "windows-main") {
    const worker = this.workers.get(workerId);
    if (!worker || worker.socket.readyState !== WebSocket.OPEN) {
      throw new WorkerError("WORKER_OFFLINE", "Windows worker is offline. Turn on the PC and keep it awake.");
    }
    const requestId = randomUUID();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new WorkerError("REQUEST_TIMEOUT", `Worker did not finish ${tool} within the time limit`));
      }, this.config.requestTimeoutMs);
      this.pending.set(requestId, {resolve, reject, timer});
    });
    worker.socket.send(JSON.stringify({type: "task", request_id: requestId, tool, args}));
    return result;
  }

  private accept(socket: WebSocket) {
    let state: WorkerState | undefined;
    const helloTimer = setTimeout(() => socket.close(4401, "hello timeout"), 10_000);
    socket.on("message", raw => {
      let value: unknown;
      try { value = JSON.parse(raw.toString()); } catch { socket.close(4400, "invalid json"); return; }
      if (!state) {
        const parsed = WorkerHello.safeParse(value);
        if (!parsed.success || !this.config.allowedWorkers.has(parsed.data.worker_id) || !equalSecret(parsed.data.secret, this.config.workerSecret)) {
          socket.close(4403, "unauthorized worker"); return;
        }
        clearTimeout(helloTimer);
        const now = new Date().toISOString();
        state = {socket, workerId: parsed.data.worker_id, capabilities: parsed.data.capabilities, connectedAt: now, lastSeen: now, browserReady: false, paymentReady: false};
        const previous = this.workers.get(state.workerId);
        if (previous && previous.socket !== socket) previous.socket.close(4409, "replaced");
        this.workers.set(state.workerId, state);
        socket.send(JSON.stringify({type: "hello_ack", ok: true, heartbeat_interval_ms: 20_000}));
        return;
      }
      const heartbeat = WorkerHeartbeat.safeParse(value);
      if (heartbeat.success) {
        state.lastSeen = new Date().toISOString(); state.browserReady = heartbeat.data.browser_ready; state.paymentReady = heartbeat.data.payment_ready; state.currentUrl = heartbeat.data.current_url; state.tabs = heartbeat.data.tabs; return;
      }
      const parsed = WorkerResult.safeParse(value);
      if (!parsed.success) return;
      const waiter = this.pending.get(parsed.data.request_id);
      if (!waiter) return;
      clearTimeout(waiter.timer); this.pending.delete(parsed.data.request_id);
      if (parsed.data.ok) waiter.resolve(parsed.data.data);
      else waiter.reject(new WorkerError(parsed.data.error?.code || "WORKER_ERROR", parsed.data.error?.message || "Worker task failed"));
    });
    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (state && this.workers.get(state.workerId)?.socket === socket) this.workers.delete(state.workerId);
    });
  }
}
