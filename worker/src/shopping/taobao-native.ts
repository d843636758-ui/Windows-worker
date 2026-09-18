import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { WorkerError } from "@local-browser/shared";
import { Confirmations } from "../policy/safety.js";

const execFileAsync = promisify(execFile);
const SOURCE_APP = "ChatGPT Windows Worker";
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const sleep = (milliseconds:number) => new Promise(resolve=>setTimeout(resolve,milliseconds));

async function waitForResultFile(resultPath:string,timeoutMs=30_000) {
  const deadline=Date.now()+timeoutMs;
  while (Date.now()<deadline) {
    try { return await fs.stat(resultPath); }
    catch (error) {
      const code=(error as NodeJS.ErrnoException)?.code;
      if (code!=="ENOENT") throw error;
      await sleep(250);
    }
  }
  throw new WorkerError(
    "TAOBAO_NATIVE_NO_RESULT",
    `Taobao Native CLI launched but did not create its result file within ${Math.round(timeoutMs/1000)} seconds.`
  );
}

export function buildTaobaoInvocation(command:string,requestPath:string,outputPath:string,platform=process.platform) {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const executable = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : "powershell.exe";
    const wrapper = fileURLToPath(new URL("../../scripts/invoke-taobao.ps1",import.meta.url));
    return {
      executable,
      args:["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",wrapper,"-Executable",command,"-RequestPath",requestPath,"-OutputPath",outputPath]
    };
  }
  return {executable:command,args:["--request",requestPath,"-o",outputPath]};
}

export type NativeInvoke = (tool:string, args:Record<string,unknown>)=>Promise<unknown>;

function cleanInstallLocation(raw:string) {
  return raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

export function buildWindowsInstallCandidates(rawLocation:string|undefined,env:NodeJS.ProcessEnv=process.env) {
  const candidates:string[]=[];
  const addRoot=(raw?:string)=>{
    if (!raw) return;
    const location=cleanInstallLocation(raw);
    if (!location) return;
    if (/taobao-native\.(cmd|bat|exe)$/i.test(location)) candidates.push(location);
    else {
      candidates.push(path.win32.join(location,"bin","taobao-native.cmd"));
      candidates.push(path.win32.join(location,"resources","app","bin","taobao-native.cmd"));
      candidates.push(path.win32.join(location,"resources","bin","taobao-native.cmd"));
    }
  };
  addRoot(rawLocation);
  if (env.LOCALAPPDATA) {
    addRoot(path.win32.join(env.LOCALAPPDATA,"Programs","taobao"));
    addRoot(path.win32.join(env.LOCALAPPDATA,"taobao"));
  }
  if (env.APPDATA) addRoot(path.win32.join(env.APPDATA,"taobao"));
  return [...new Set(candidates.map(candidate=>path.win32.normalize(candidate)))];
}

function assertOfficialProductUrl(raw:string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(
    host === "taobao.com" || host.endsWith(".taobao.com") ||
    host === "tmall.com" || host.endsWith(".tmall.com")
  )) throw new WorkerError("UNSAFE_TAOBAO_URL","Only official HTTPS Taobao or Tmall URLs are allowed");
  return url.toString();
}

function indexedText(value:unknown, found:Array<{index:number;text:string}>=[]) {
  if (Array.isArray(value)) { for (const item of value) indexedText(item,found); return found; }
  if (!value || typeof value !== "object") return found;
  const row = value as Record<string,unknown>;
  if (typeof row.index === "number") {
    const text = [row.text,row.name,row.content,row.label].find(item=>typeof item === "string");
    if (typeof text === "string") found.push({index:row.index,text:text.replace(/\s+/g," ").trim()});
  }
  for (const item of Object.values(row)) indexedText(item,found);
  return found;
}

async function installedCommand(explicit?:string) {
  if (explicit) return explicit;
  if (process.platform === "win32") {
    let recordedLocation:string|undefined;
    for (const base of [process.env.APPDATA,process.env.LOCALAPPDATA]) {
      if (!base) continue;
      try {
        recordedLocation = await fs.readFile(path.join(base,"taobao","install-location.txt"),"utf8");
        if (cleanInstallLocation(recordedLocation)) break;
      } catch {}
    }
    const candidates=buildWindowsInstallCandidates(recordedLocation);
    if (process.env.TAOBAO_NATIVE_PATH) candidates.unshift(cleanInstallLocation(process.env.TAOBAO_NATIVE_PATH));
    for (const candidate of candidates) {
      try { await fs.access(candidate); return candidate; } catch {}
    }
    throw new WorkerError("TAOBAO_NATIVE_NOT_INSTALLED",`taobao-native was not found. Checked: ${candidates.join("; ") || "no installation locations"}`);
  }
  if (process.platform === "darwin") return path.join(os.homedir(),"Library","Application Support","taobao","cli","taobao-runner");
  return "taobao-native";
}

export class TaobaoNativeClient {
  constructor(private readonly explicitPath?:string) {}

  async invoke(tool:string,args:Record<string,unknown>) {
    const command = await installedCommand(this.explicitPath);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(),"taobao-native-"));
    const requestPath = path.join(tempDir,"request.json");
    const outputPath = path.join(tempDir,"result.json");
    await fs.writeFile(requestPath,JSON.stringify({tool,arguments:{...args,sourceApp:SOURCE_APP}}),"utf8");
    try {
      const invocation = buildTaobaoInvocation(command,requestPath,outputPath);
      await execFileAsync(invocation.executable,invocation.args,{timeout:180_000,maxBuffer:1024*1024,windowsHide:true});
      // The Windows .cmd launcher may return before the desktop process has
      // finished writing -o. Wait briefly instead of misclassifying that race
      // as a missing installation.
      const stat = await waitForResultFile(outputPath);
      if (stat.size > MAX_RESULT_BYTES) throw new WorkerError("TAOBAO_RESULT_TOO_LARGE","Taobao desktop returned more than 8 MB");
      return JSON.parse(await fs.readFile(outputPath,"utf8"));
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      // The executable path is verified by installedCommand. Do not reinterpret
      // errors emitted by the CLI itself as an installation failure.
      if (/\bENOENT\b/i.test(message)) throw new WorkerError("TAOBAO_NATIVE_NOT_INSTALLED",`taobao-native could not be launched at ${command}: ${message}`.slice(0,1000));
      throw new WorkerError("TAOBAO_NATIVE_FAILED",message.slice(0,1000));
    } finally {
      await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
    }
  }
}

export class TaobaoNativeAdapter {
  private readonly confirmations = new Confirmations();
  private readonly invoke:NativeInvoke;
  constructor(cliPath?:string, invoke?:NativeInvoke) {
    const client = new TaobaoNativeClient(cliPath);
    this.invoke = invoke || ((tool,args)=>client.invoke(tool,args));
  }

  async status() {
    try {
      const current = await this.invoke("get_current_tab",{});
      return {installed:true,reachable:true,current};
    } catch (error) {
      if (error instanceof WorkerError) return {installed:error.code!=="TAOBAO_NATIVE_NOT_INSTALLED",reachable:false,error:{code:error.code,message:error.message}};
      throw error;
    }
  }
  search(keyword:string,type="all") { return this.invoke("search_products",{keyword,type}); }
  openProduct(url:string) { return this.invoke("navigate_to_url",{url:assertOfficialProductUrl(url)}); }
  readPage(scope?:string,maxLength=12000,offset=0) { return this.invoke("read_page_content",{...(scope?{scope}:{}),maxLength,offset}); }
  getSkus(itemId?:string) { return this.invoke("get_product_skus",{...(itemId?{itemId}: {})}); }
  async getSkuPrice(options:string[]) {
    for (const option of options) {
      const scan = await this.invoke("scan_page_elements",{});
      const wanted = option.replace(/\s+/g," ").trim();
      const matches = indexedText(scan).filter(row=>row.text===wanted);
      if (matches.length !== 1) throw new WorkerError("SKU_NOT_UNIQUE",`Expected one exact DOM match for SKU '${option}', found ${matches.length}`);
      await this.invoke("click_element",{index:matches[0]!.index});
    }
    await sleep(3000);
    const prices = await this.invoke("scan_page_elements",{filter:"￥"});
    return {selected_options:options,waited_ms:3000,price_elements:prices};
  }

  async addToCart(itemId:string|undefined,sku:string[]=[],token?:string) {
    const args = {...(itemId?{itemId}:{}),...(sku.length?{sku}: {})};
    return this.confirmThenInvoke("add_to_cart",args,token,{action:"加入购物车",item_id:itemId||"当前商品",sku});
  }
  async openChat(args:Record<string,unknown>,token?:string) {
    if ((args.source === "cart" || args.source === "order") && !args.product_name) throw new WorkerError("PRODUCT_NAME_REQUIRED","product_name is required for cart and order chat");
    if (args.source === "search" && !args.query) throw new WorkerError("QUERY_REQUIRED","query is required for search chat");
    const clean = {source:args.source,message:args.message,...(args.product_name?{productName:args.product_name}:{}),...(args.query?{query:args.query}:{})};
    return this.confirmThenInvoke("open_chat",clean,token,{action:"向淘宝商家发送消息",source:args.source,message:args.message});
  }
  async sendChat(message:string,shopName?:string,token?:string) {
    const args = {message,...(shopName?{shopName}: {})};
    return this.confirmThenInvoke("send_chat_message",args,token,{action:"发送旺旺消息",shop_name:shopName,message});
  }

  private async confirmThenInvoke(tool:string,args:Record<string,unknown>,token:string|undefined,summary:unknown) {
    const action = `taobao-native:${tool}:${JSON.stringify(args)}`;
    if (!this.confirmations.consume(token,action)) return {ok:false,confirmation_required:true,level:1,summary,confirmation_token:this.confirmations.issue(action),expires_in_seconds:120};
    return {ok:true,result:await this.invoke(tool,args)};
  }
}
