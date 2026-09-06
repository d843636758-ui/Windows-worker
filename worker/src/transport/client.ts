import WebSocket from "ws";
import { WorkerError, WorkerTask, type WorkerTaskMessage } from "@local-browser/shared";

export class RelayClient {
  private socket?:WebSocket; private stopped=false; private backoff=1000; private heartbeat?:NodeJS.Timeout; private queue=Promise.resolve();
  constructor(private readonly options:{url:string;workerId:string;secret:string;capabilities:string[];status:()=>Promise<any>;run:(task:WorkerTaskMessage)=>Promise<unknown>}){}
  start(){this.connect();}
  stop(){this.stopped=true;clearInterval(this.heartbeat);this.socket?.close();}
  private connect(){if(this.stopped)return;const ws=new WebSocket(this.options.url);this.socket=ws;
    ws.on("open",()=>{this.backoff=1000;ws.send(JSON.stringify({type:"hello",worker_id:this.options.workerId,secret:this.options.secret,version:"0.1.0",capabilities:this.options.capabilities}));});
    ws.on("message",raw=>{let value:unknown;try{value=JSON.parse(raw.toString());}catch{return;}if((value as any)?.type==="hello_ack"){clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>void this.sendHeartbeat(),20_000);void this.sendHeartbeat();return;}const parsed=WorkerTask.safeParse(value);if(parsed.success)this.queue=this.queue.then(()=>this.handle(parsed.data)).catch(()=>{});});
    ws.on("error",()=>{});ws.on("close",()=>{clearInterval(this.heartbeat);if(!this.stopped){const wait=this.backoff;this.backoff=Math.min(this.backoff*2,30_000);setTimeout(()=>this.connect(),wait);}});
  }
  private async sendHeartbeat(){if(this.socket?.readyState!==WebSocket.OPEN)return;try{this.socket.send(JSON.stringify({type:"heartbeat",worker_id:this.options.workerId,...await this.options.status()}));}catch{}}
  private async handle(task:WorkerTaskMessage){try{const data=await this.options.run(task);this.send({type:"result",request_id:task.request_id,ok:true,data});}catch(error){const e=error instanceof WorkerError?error:new WorkerError("WORKER_ERROR",error instanceof Error?error.message:"Unknown worker error");this.send({type:"result",request_id:task.request_id,ok:false,error:{code:e.code,message:e.message}});}}
  private send(value:unknown){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(value));}
}
