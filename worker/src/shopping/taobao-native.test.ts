import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaobaoInvocation, TaobaoNativeAdapter } from "./taobao-native.js";

describe("TaobaoNativeAdapter",()=>{
  it("passes Windows cmd paths through PowerShell without cmd.exe quote nesting",()=>{
    const command="C:\\Users\\Ding Name\\AppData\\Local\\Programs\\taobao\\bin\\taobao-native.cmd";
    const request="C:\\Temp Folder\\request.json";
    const output="C:\\Temp Folder\\result.json";
    const invocation=buildTaobaoInvocation(command,request,output,"win32");
    assert.match(invocation.executable,/powershell\.exe$/i);
    assert.deepEqual(invocation.args.slice(-6),["-Executable",command,"-RequestPath",request,"-OutputPath",output]);
    assert.equal(invocation.args.includes("/c"),false);
  });
  it("allows reads without confirmation",async()=>{
    const calls:any[]=[]; const adapter=new TaobaoNativeAdapter(undefined,async(tool,args)=>{calls.push({tool,args});return {success:true};});
    await adapter.search("苹果冰茶","all");
    assert.deepEqual(calls,[{tool:"search_products",args:{keyword:"苹果冰茶",type:"all"}}]);
  });
  it("requires a one-time confirmation before cart mutation",async()=>{
    let calls=0; const adapter=new TaobaoNativeAdapter(undefined,async()=>{calls++;return {success:true};});
    const preview:any=await adapter.addToCart("123",["红色","M"]);
    assert.equal(preview.confirmation_required,true); assert.equal(calls,0);
    const result:any=await adapter.addToCart("123",["红色","M"],preview.confirmation_token);
    assert.equal(result.ok,true); assert.equal(calls,1);
    const replay:any=await adapter.addToCart("123",["红色","M"],preview.confirmation_token);
    assert.equal(replay.confirmation_required,true); assert.equal(calls,1);
  });
  it("rejects non-Taobao product URLs",()=>{
    const adapter=new TaobaoNativeAdapter(undefined,async()=>({}));
    assert.throws(()=>adapter.openProduct("https://example.com/item"),/official HTTPS Taobao/);
  });
  it("selects SKU by exact index and waits before reading price",async()=>{
    const calls:any[]=[]; const adapter=new TaobaoNativeAdapter(undefined,async(tool,args)=>{
      calls.push({tool,args});
      if(tool==="scan_page_elements" && !(args as any).filter)return {elements:[{index:7,text:"年卡"}]};
      return {success:true};
    });
    const result:any=await adapter.getSkuPrice(["年卡"]);
    assert.deepEqual(calls.map(call=>call.tool),["scan_page_elements","click_element","scan_page_elements"]);
    assert.deepEqual(calls[1].args,{index:7}); assert.equal(result.waited_ms,3000);
  });
});
