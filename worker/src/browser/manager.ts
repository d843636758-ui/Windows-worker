import { chromium, type BrowserContext, type Page } from "playwright-core";
import { WorkerError } from "@local-browser/shared";
import { assertAllowedKey, assertSafeField, Confirmations, isHighRiskAction } from "../policy/safety.js";

export class BrowserManager {
  private context?: BrowserContext;
  private page?: Page;
  private readonly confirmations = new Confirmations();
  constructor(private readonly profileDir: string, private readonly headed: boolean) {}

  async ensure() {
    if (this.context) return;
    const context = await chromium.launchPersistentContext(this.profileDir, {
      channel: "msedge",
      headless: !this.headed,
      viewport: null,
      // Playwright disables Chromium's sandbox by default. Windows supports the
      // sandbox, so retain it for the dedicated shopping profile.
      ignoreDefaultArgs: ["--no-sandbox"],
    });
    this.context = context;
    context.on("close", () => { if (this.context === context) { this.context = undefined; this.page = undefined; } });
    context.on("page", page => { this.page = page; });
    this.page = context.pages()[0] || await context.newPage();
  }
  private async reset() { const context=this.context; this.context=undefined; this.page=undefined; await context?.close().catch(()=>{}); }
  private async current() {
    await this.ensure();
    try {
      if (!this.page || this.page.isClosed()) this.page=this.context!.pages().at(-1) || await this.context!.newPage();
      return this.page;
    } catch (error) {
      if (!/closed|Target page, context or browser/i.test(error instanceof Error ? error.message : String(error))) throw error;
      await this.reset(); await this.ensure();
      return this.page!;
    }
  }
  async status() { await this.ensure(); const pages=this.context!.pages(); return {browser_ready:true,browser_name:"Microsoft Edge",profile:"ai-worker",current_url:(await this.current()).url(),tabs:pages.length}; }
  async open(url: string) { await this.ensure(); const page=await this.context!.newPage(); this.page=page; await page.goto(url,{waitUntil:"domcontentloaded",timeout:45_000}); return {ok:true,title:await page.title(),url:page.url()}; }
  async goto(url: string) { const page=await this.current(); await page.goto(url,{waitUntil:"domcontentloaded",timeout:45_000}); return {ok:true,title:await page.title(),url:page.url()}; }
  async read(maxChars=12000) { const page=await this.current(); const text=(await page.locator("body").innerText({timeout:10_000})).slice(0,maxChars); return {title:await page.title(),url:page.url(),text,controls:await this.controls(60)}; }
  async controls(limit=100) { const page=await this.current(); return page.locator("a,button,input,textarea,select,[role=button],[role=link]").evaluateAll((els,n) => els.filter((e:any)=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=="hidden"}).slice(0,n).map((e:any)=>({text:(e.innerText||e.value||"").trim().slice(0,200),role:e.getAttribute("role")||e.tagName.toLowerCase(),type:e.getAttribute("type")||undefined,href:e.href||undefined,placeholder:e.getAttribute("placeholder")||undefined,aria_label:e.getAttribute("aria-label")||undefined})),limit); }
  async click(args:{text:string;role?:string;confirmation_token?:string}) {
    const action=`click:${args.role||""}:${args.text}`;
    if (isHighRiskAction(args.text) && !this.confirmations.consume(args.confirmation_token,action)) return {ok:false,confirmation_required:true,level:1,action,args:{text:args.text,role:args.role},confirmation_token:this.confirmations.issue(action),expires_in_seconds:120};
    const page=await this.current(); const locator=args.role ? page.getByRole(args.role as any,{name:args.text,exact:true}) : page.getByText(args.text,{exact:true});
    if (await locator.count() !== 1) throw new WorkerError("CONTROL_NOT_UNIQUE", `Expected one visible control named '${args.text}'`);
    await locator.click(); return {ok:true,title:await page.title(),url:page.url()};
  }
  async fill(args:{label?:string;placeholder?:string;value:string}) { const page=await this.current(); const locator=args.label?page.getByLabel(args.label,{exact:true}):args.placeholder?page.getByPlaceholder(args.placeholder,{exact:true}):undefined; if(!locator)throw new WorkerError("FIELD_REQUIRED","Provide label or placeholder"); if(await locator.count()!==1)throw new WorkerError("CONTROL_NOT_UNIQUE","Expected one matching field"); const meta=await locator.evaluate((e:any)=>({type:e.type,label:e.getAttribute("aria-label"),placeholder:e.placeholder,name:e.name})); assertSafeField(meta); await locator.fill(args.value); return {ok:true}; }
  async press(key:string){assertAllowedKey(key);await (await this.current()).keyboard.press(key);return {ok:true};}
  async back(){const p=await this.current();await p.goBack({waitUntil:"domcontentloaded"});return {ok:true,url:p.url()};}
  async reload(){const p=await this.current();await p.reload({waitUntil:"domcontentloaded"});return {ok:true,url:p.url()};}
  async screenshot(){
    for(let attempt=0;attempt<2;attempt++){
      const p=await this.current();
      try{const data=await p.screenshot({type:"jpeg",quality:75,fullPage:false});return {mime_type:"image/jpeg",base64:data.toString("base64"),title:await p.title(),url:p.url()};}
      catch(error){if(attempt || !/closed|Target page, context or browser/i.test(error instanceof Error?error.message:String(error)))throw error;await this.reset();}
    }
    throw new WorkerError("SCREENSHOT_FAILED","Could not recover an active browser page");
  }
  async tabs(){await this.ensure();return Promise.all(this.context!.pages().map(async(p,i)=>({tab_id:String(i),title:await p.title(),url:p.url(),active:p===this.page})));}
  async switchTab(id:string){await this.ensure();const p=this.context!.pages()[Number(id)];if(!p)throw new WorkerError("TAB_NOT_FOUND","Tab does not exist");this.page=p;await p.bringToFront();return {ok:true,title:await p.title(),url:p.url()};}
  async closeTab(id:string){await this.ensure();const p=this.context!.pages()[Number(id)];if(!p)throw new WorkerError("TAB_NOT_FOUND","Tab does not exist");await p.close();this.page=this.context!.pages().at(-1);return {ok:true};}
  async pageHandle(){return this.current();}
}
