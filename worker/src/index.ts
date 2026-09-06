import fs from "node:fs";
import { TOOL_NAMES, WorkerError, type WorkerTaskMessage } from "@local-browser/shared";
import { loadWorkerConfig } from "./config.js";
import { BrowserManager } from "./browser/manager.js";
import { AlipayAdapter } from "./payment/alipay.js";
import { TaobaoAdapter } from "./shopping/taobao.js";
import { RelayClient } from "./transport/client.js";

const config=loadWorkerConfig(); fs.mkdirSync(config.logDir,{recursive:true});
const browser=new BrowserManager(config.edgeProfileDir,config.headed); const payment=new AlipayAdapter(config.alipayBotPath); const shopping=new TaobaoAdapter(browser,payment);

async function run(task:WorkerTaskMessage){const a=task.args as any;switch(task.tool){
  case "browser_status":return browser.status();case "browser_open":return browser.open(a.url);case "browser_goto":return browser.goto(a.url);case "browser_read_page":return browser.read(a.max_chars);case "browser_list_controls":return browser.controls(a.limit);case "browser_click":return browser.click(a);case "browser_fill":return browser.fill(a);case "browser_press":return browser.press(a.key);case "browser_back":return browser.back();case "browser_reload":return browser.reload();case "browser_screenshot":return browser.screenshot();case "browser_list_tabs":return browser.tabs();case "browser_switch_tab":return browser.switchTab(a.tab_id);case "browser_close_tab":return browser.closeTab(a.tab_id);
  case "shopping_status":return shopping.status();case "shopping_search":return shopping.search(a.query,a.max_results);case "shopping_inspect_product":return shopping.inspect();case "shopping_select_sku":return shopping.selectSku(a.options,a.quantity);case "shopping_prepare_order":return shopping.prepare(a.confirmation_token);case "shopping_submit_order":return shopping.submit(a.confirmation_token);case "shopping_payment_status":return payment.query(a.payment_id);default:throw new WorkerError("TOOL_NOT_SUPPORTED",`Unsupported tool: ${task.tool}`);
}}
const client=new RelayClient({url:config.relayUrl,workerId:config.workerId,secret:config.sharedSecret,capabilities:["browser","shopping","payment"],run,status:async()=>{try{const b=await browser.status();const p=await payment.ready();return {browser_ready:true,payment_ready:p.payment_ready,current_url:b.current_url,tabs:b.tabs};}catch{return {browser_ready:false,payment_ready:false};}}});
console.log(`Starting Windows browser worker ${config.workerId} with ${TOOL_NAMES.length-2} remote tools`);client.start();process.on("SIGINT",()=>{client.stop();process.exit(0);});process.on("SIGTERM",()=>{client.stop();process.exit(0);});
