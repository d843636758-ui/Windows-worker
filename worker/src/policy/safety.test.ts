import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertOfficialAlipayCashier, assertSafeField, Confirmations } from "./safety.js";
describe("safety policy",()=>{
  it("blocks passwords",()=>assert.throws(()=>assertSafeField({type:"password"})));
  it("accepts official cashier URLs",()=>assert.match(assertOfficialAlipayCashier("https://cashier.alipay.com/cashiermain.htm?orderId=abc"),/orderId=abc/));
  it("rejects lookalike payment hosts",()=>assert.throws(()=>assertOfficialAlipayCashier("https://cashier.alipay.com.evil.test/cashiermain.htm?orderId=abc")));
  it("uses confirmation tokens once",()=>{const c=new Confirmations();const t=c.issue("buy");assert.equal(c.consume(t,"buy"),true);assert.equal(c.consume(t,"buy"),false);});
});
