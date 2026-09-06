import { z } from "zod";
import type { WorkerRelay } from "./relay.js";

type Def = {name: string; description: string; schema: Record<string, z.ZodTypeAny>};

export const definitions: Def[] = [
  {name:"worker_status",description:"Check whether the Windows worker is online and ready.",schema:{worker_id:z.string().optional()}},
  {name:"worker_capabilities",description:"List the connected worker capabilities.",schema:{worker_id:z.string().optional()}},
  {name:"browser_status",description:"Get local Edge status, current URL, and tab count.",schema:{}},
  {name:"browser_open",description:"Open a URL in a new local Edge tab.",schema:{url:z.string().url()}},
  {name:"browser_goto",description:"Navigate the current local Edge tab.",schema:{url:z.string().url()}},
  {name:"browser_read_page",description:"Read visible page text and a compact controls summary.",schema:{max_chars:z.number().int().min(500).max(30000).default(12000)}},
  {name:"browser_list_controls",description:"List visible buttons, links, and input controls.",schema:{limit:z.number().int().min(1).max(300).default(100)}},
  {name:"browser_click",description:"Click one visible control by exact text and optional role. Risky actions return confirmation_required first.",schema:{text:z.string().min(1),role:z.string().optional(),confirmation_token:z.string().optional()}},
  {name:"browser_fill",description:"Fill a non-sensitive field. Password, OTP, payment, and card fields are always blocked.",schema:{label:z.string().optional(),placeholder:z.string().optional(),value:z.string().max(5000)}},
  {name:"browser_press",description:"Send an allowed keyboard key to the current page.",schema:{key:z.string()}},
  {name:"browser_back",description:"Navigate the current tab back.",schema:{}},
  {name:"browser_reload",description:"Reload the current tab.",schema:{}},
  {name:"browser_screenshot",description:"Capture the current viewport. The server does not persist it.",schema:{}},
  {name:"browser_list_tabs",description:"List local Edge tabs.",schema:{}},
  {name:"browser_switch_tab",description:"Switch to a tab by worker tab id.",schema:{tab_id:z.string()}},
  {name:"browser_close_tab",description:"Close a tab by worker tab id.",schema:{tab_id:z.string()}},
  {name:"shopping_status",description:"Check Taobao login and local payment readiness.",schema:{}},
  {name:"shopping_search",description:"Search Taobao in the local Edge profile.",schema:{query:z.string().min(1).max(200),max_results:z.number().int().min(1).max(20).default(10)}},
  {name:"shopping_inspect_product",description:"Read product, store, SKU, quantity, and price from the current product page.",schema:{}},
  {name:"shopping_select_sku",description:"Select visible SKU options and quantity without submitting an order.",schema:{options:z.array(z.string()).max(10),quantity:z.number().int().min(1).max(99).default(1)}},
  {name:"shopping_prepare_order",description:"Preview checkout. First call returns a confirmation token; repeat with that token to open checkout. Does not submit the order.",schema:{confirmation_token:z.string().optional()}},
  {name:"shopping_submit_order",description:"After explicit user confirmation, submit the prepared order and send the official Alipay cashier URL to the local payment tool. Final payment still requires the user in Alipay.",schema:{confirmation_token:z.string().min(1)}},
  {name:"shopping_payment_status",description:"Query a previously submitted Alipay AI Pay request.",schema:{payment_id:z.string().min(1)}},
];

export async function runTool(relay: WorkerRelay, name: string, args: Record<string, unknown>) {
  if (name === "worker_status") return relay.status(String(args.worker_id || "windows-main"));
  if (name === "worker_capabilities") {
    const status = relay.status(String(args.worker_id || "windows-main"));
    return {worker_id: status.worker_id, online: status.online, capabilities: "capabilities" in status ? status.capabilities : []};
  }
  return relay.dispatch(name, args);
}
