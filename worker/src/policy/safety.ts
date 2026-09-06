import { randomUUID } from "node:crypto";
import { WorkerError } from "@local-browser/shared";

const sensitive = /(pass(word)?|密码|验证码|校验码|otp|2fa|cvv|cvc|银行卡|card.?number|支付密码|security.?code)/i;
const highRisk = /(购买|立即购买|结算|提交订单|确认订单|支付|付款|删除|注销|发布|提交评论|加入购物车|add to cart|buy now|checkout|place order|pay|delete|post|publish)/i;
const allowedKeys = new Set(["Enter","Escape","Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown","Home","End","Backspace","Delete","Space"]);

export function assertSafeField(meta: {type?: string; label?: string; placeholder?: string; name?: string}) {
  const description = Object.values(meta).join(" ");
  if (meta.type === "password" || sensitive.test(description)) throw new WorkerError("SENSITIVE_INPUT", "Password, OTP, payment, and card fields must be completed by the user.");
}

export function isHighRiskAction(text: string) { return highRisk.test(text); }
export function assertAllowedKey(key: string) {
  if (!allowedKeys.has(key) && !/^[a-z0-9]$/i.test(key)) throw new WorkerError("KEY_BLOCKED", "That key is not allowed");
}

export class Confirmations {
  private pending = new Map<string, {action: string; expires: number}>();
  issue(action: string) { const token=randomUUID(); this.pending.set(token,{action,expires:Date.now()+120_000}); return token; }
  consume(token: string | undefined, action: string) {
    const item = token ? this.pending.get(token) : undefined;
    if (!item || item.action !== action || item.expires < Date.now()) return false;
    this.pending.delete(token!); return true;
  }
}

export function assertOfficialAlipayCashier(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new WorkerError("INVALID_PAYMENT_URL", "Invalid payment URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "cashier.alipay.com" || /^cashier[a-z0-9-]*\.alipay\.com$/.test(host))) throw new WorkerError("INVALID_PAYMENT_URL", "Only an official HTTPS Alipay cashier URL is allowed");
  if (!/cashiermain\.htm/i.test(url.pathname) || !url.searchParams.get("orderId")) throw new WorkerError("INVALID_PAYMENT_URL", "Wait for cashiermain.htm with an orderId before submitting payment");
  return url.toString();
}
