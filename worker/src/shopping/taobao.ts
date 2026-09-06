import { WorkerError } from "@local-browser/shared";
import type { BrowserManager } from "../browser/manager.js";
import type { AlipayAdapter } from "../payment/alipay.js";
import { Confirmations } from "../policy/safety.js";

type Snapshot = {title:string; price:string; sku:string[]; quantity:number; url:string};

export class TaobaoAdapter {
  private readonly confirmations = new Confirmations();
  private selected: Snapshot | undefined;
  constructor(private readonly browser:BrowserManager, private readonly payment:AlipayAdapter) {}

  async status() {
    const browser = await this.browser.status();
    const page = await this.browser.pageHandle();
    const taobao = /(^|\.)((taobao|tmall)\.com)$/i.test(new URL(page.url() || "about:blank").hostname);
    const loginText = taobao ? await page.locator("body").innerText().catch(()=>"") : "";
    return {browser, on_taobao:taobao, login_likely:taobao && !/亲，请登录|登录淘宝/i.test(loginText.slice(0,4000)), payment:await this.payment.ready()};
  }

  async search(query:string,maxResults:number) {
    await this.browser.goto(`https://s.taobao.com/search?q=${encodeURIComponent(query)}`);
    const page=await this.browser.pageHandle();
    await page.waitForLoadState("domcontentloaded");
    await this.assertNoHumanVerification();
    const results=await page.locator('a[href*="item.taobao.com"],a[href*="detail.tmall.com"]').evaluateAll((nodes,limit)=>{
      const seen=new Set<string>(); const out:any[]=[];
      for(const node of nodes as HTMLAnchorElement[]){const href=node.href; if(!href||seen.has(href))continue; const text=(node.innerText||node.getAttribute("title")||"").trim(); if(!text)continue; seen.add(href); out.push({title:text.slice(0,300),url:href}); if(out.length>=limit)break;}
      return out;
    },maxResults);
    return {query,count:results.length,results,url:page.url()};
  }

  async inspect() {
    const page=await this.browser.pageHandle();
    await this.assertNoHumanVerification();
    this.assertProduct(page.url());
    const data=await page.evaluate(()=>{
      const text=(document.body.innerText||"").replace(/\s+/g," ");
      const price=text.match(/(?:¥|￥)\s*([0-9]+(?:\.[0-9]{1,2})?)/)?.[1]||"unknown";
      const buttons=[...document.querySelectorAll('button,[role="button"],li')].map((e:any)=>(e.innerText||"").trim()).filter(x=>x&&x.length<80);
      return {title:document.title,price,sku:[...new Set(buttons)].slice(0,80)};
    });
    return {...data,url:page.url()};
  }

  async selectSku(options:string[],quantity:number) {
    const page=await this.browser.pageHandle(); this.assertProduct(page.url());
    for(const option of options){const loc=page.getByText(option,{exact:true}).filter({visible:true}); if(await loc.count()!==1)throw new WorkerError("SKU_NOT_UNIQUE",`Cannot uniquely select SKU: ${option}`); await loc.click();}
    const qty=page.locator('input[type="number"],input[aria-label*="数量"],input[title*="数量"]').first();
    if(await qty.count())await qty.fill(String(quantity));
    const item=await this.inspect(); this.selected={title:item.title,price:item.price,sku:options,quantity,url:item.url};
    return {ok:true,selection:this.selected};
  }

  async prepare(token?:string) {
    if(!this.selected)throw new WorkerError("SELECTION_REQUIRED","Inspect and select the product SKU first");
    const action=`prepare:${JSON.stringify(this.selected)}`;
    if(!this.confirmations.consume(token,action))return {ok:false,confirmation_required:true,level:1,summary:this.selected,confirmation_token:this.confirmations.issue(action),expires_in_seconds:120};
    const page=await this.browser.pageHandle();
    const buy=page.getByText(/立即购买|马上抢|Buy now/i).filter({visible:true}).first();
    if(!await buy.count())throw new WorkerError("BUY_CONTROL_NOT_FOUND","Could not find the buy-now control");
    await buy.click(); await page.waitForLoadState("domcontentloaded").catch(()=>{});
    const summary=await this.checkoutSummary(); const submitAction=`submit:${JSON.stringify(summary)}`;
    return {ok:true,prepared:true,summary,confirmation_required:true,level:2,confirmation_token:this.confirmations.issue(submitAction),expires_in_seconds:120};
  }

  async submit(token:string) {
    const page=await this.browser.pageHandle(); const summary=await this.checkoutSummary(); const action=`submit:${JSON.stringify(summary)}`;
    if(!this.confirmations.consume(token,action))throw new WorkerError("CONFIRMATION_REQUIRED","A fresh explicit confirmation is required before submitting this order");
    const button=page.getByText(/提交订单|确认订单|Place order/i).filter({visible:true}).first();
    if(!await button.count())throw new WorkerError("SUBMIT_CONTROL_NOT_FOUND","Could not find the submit-order control");
    await button.click();
    await page.waitForURL(/alipay\.com/i,{timeout:45_000}).catch(()=>{});
    const cashierUrl=page.url();
    const payment=await this.payment.submit(cashierUrl);
    return {ok:true,order_submitted:true,payment,final_confirmation:"Open Alipay on your phone and confirm the payment yourself."};
  }

  private async checkoutSummary(){const page=await this.browser.pageHandle();const text=(await page.locator("body").innerText()).replace(/\s+/g," ");const total=text.match(/(?:实付款|合计|Total)[^¥￥0-9]{0,20}[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1]||this.selected?.price||"unknown";return {...this.selected,total,checkout_url:page.url()};}
  private async assertNoHumanVerification(){const page=await this.browser.pageHandle();const text=(await page.locator("body").innerText({timeout:5000}).catch(()=>"")).slice(0,5000);if(/拖动下方滑块|完成验证|验证失败|error:aE0VF6/i.test(text)||/sec\.taobao\.com/i.test(page.url()))throw new WorkerError("HUMAN_VERIFICATION_REQUIRED","Taobao requires manual verification. Automation has paused; run worker/scripts/start-human-verification.ps1, finish verification yourself, close that Edge window, then run resume-after-verification.ps1.");}
  private assertProduct(raw:string){const host=new URL(raw).hostname;if(!/(^|\.)((taobao|tmall)\.com)$/i.test(host))throw new WorkerError("NOT_PRODUCT_PAGE","Open an official Taobao or Tmall product page first");}
}
