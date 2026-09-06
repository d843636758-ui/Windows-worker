import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WorkerError } from "@local-browser/shared";
import { assertOfficialAlipayCashier } from "../policy/safety.js";

export class AlipayAdapter {
  constructor(private readonly executable: string) {}
  private run(args:string[],timeout=30_000):Promise<unknown>{return new Promise((resolve,reject)=>{const windows=process.platform==="win32";const wrapper=fileURLToPath(new URL("../../scripts/invoke-alipay.ps1",import.meta.url));const command=windows?(process.env.SystemRoot?`${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`:"powershell.exe"):this.executable;const commandArgs=windows?["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",wrapper,"-Executable",this.executable,"-Command",...args]:args;const child=spawn(command,commandArgs,{shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"]});let out="",err="";const timer=setTimeout(()=>{child.kill();reject(new WorkerError("PAYMENT_TIMEOUT","Local Alipay command timed out"));},timeout);child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);child.on("error",e=>{clearTimeout(timer);reject(new WorkerError("PAYMENT_UNAVAILABLE",e.message));});child.on("close",code=>{clearTimeout(timer);if(code!==0)return reject(new WorkerError("PAYMENT_ERROR",err.trim()||`alipay-bot exited ${code}`));try{resolve(JSON.parse(out));}catch{resolve({message:out.trim()});}});});}
  async ready(){try{const result=await this.run(["check-wallet"]);return {payment_ready:true,result};}catch(error){return {payment_ready:false,error:error instanceof Error?error.message:"unavailable"};}}
  submit(url:string){return this.run(["submit-payment","--payment-link",assertOfficialAlipayCashier(url)],60_000);}
  query(paymentId:string){if(!/^[\w.-]{1,200}$/.test(paymentId))throw new WorkerError("INVALID_PAYMENT_ID","Invalid payment id");return this.run(["query-payment-status","--payment-id",paymentId]);}
}
