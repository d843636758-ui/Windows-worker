import { z } from "zod";

export const WorkerHello = z.object({
  type: z.literal("hello"),
  worker_id: z.string().min(1).max(80),
  secret: z.string().min(16),
  version: z.string(),
  capabilities: z.array(z.enum(["browser", "shopping", "payment"])),
});

export const WorkerHeartbeat = z.object({
  type: z.literal("heartbeat"),
  worker_id: z.string(),
  browser_ready: z.boolean(),
  payment_ready: z.boolean(),
  current_url: z.string().optional(),
  tabs: z.number().int().nonnegative().optional(),
});

export const WorkerTask = z.object({
  type: z.literal("task"),
  request_id: z.string().uuid(),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
});

export const WorkerResult = z.object({
  type: z.literal("result"),
  request_id: z.string().uuid(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({code: z.string(), message: z.string()}).optional(),
});

export type WorkerTaskMessage = z.infer<typeof WorkerTask>;
export type WorkerResultMessage = z.infer<typeof WorkerResult>;

export const TOOL_NAMES = [
  "browser_status", "browser_open", "browser_goto", "browser_read_page",
  "browser_list_controls", "browser_click", "browser_fill", "browser_press",
  "browser_back", "browser_reload", "browser_screenshot", "browser_list_tabs",
  "browser_switch_tab", "browser_close_tab", "shopping_status",
  "shopping_search", "shopping_inspect_product", "shopping_select_sku",
  "shopping_prepare_order", "shopping_submit_order", "shopping_payment_status",
  "worker_status", "worker_capabilities",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export class WorkerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "WorkerError";
  }
}
