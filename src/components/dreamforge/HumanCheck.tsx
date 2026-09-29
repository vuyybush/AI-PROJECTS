"use client";
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from "react";

type Turnstile={render:(element:HTMLElement,options:Record<string,unknown>)=>string;reset:(id:string)=>void;execute:(id:string)=>void;remove:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
export type HumanCheckHandle={verify:(signal?:AbortSignal)=>Promise<string>};
let loader:Promise<Turnstile>|null=null;
function loadTurnstile(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!loader)loader=new Promise<Turnstile>((resolve,reject)=>{
    const script=document.createElement("script");
    const fail=()=>{clearTimeout(timer);script.remove();loader=null;reject(new Error("Could not load verification. Refresh and try again."));};
    const timer=setTimeout(fail,15000);
    script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;
    script.onload=()=>{if(!window.turnstile){fail();return;}clearTimeout(timer);resolve(window.turnstile);};script.onerror=fail;
    document.head.appendChild(script);
  });
  return loader;
}

const HumanCheck=forwardRef<HumanCheckHandle,{action:"generate"|"account"|"enhance"}>(function HumanCheck({action},ref){
  const container=useRef<HTMLDivElement>(null),widget=useRef<string|null>(null);
  const pending=useRef<{resolve:(token:string)=>void;reject:(error:Error)=>void}|null>(null);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let mounted=true;
    void loadTurnstile().then(api=>{
      if(!mounted||!container.current)return;
      const sitekey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if(!sitekey){setMessage("Human verification is not configured yet.");return;}
      const fail=(message:string)=>{setMessage(message);pending.current?.reject(new Error(message));pending.current=null;};
      widget.current=api.render(container.current,{sitekey,action,execution:"execute",appearance:"execute",size:"flexible",theme:"light",retry:"never","refresh-expired":"manual",callback:(token:string)=>{pending.current?.resolve(token);pending.current=null;setMessage("");},"error-callback":()=>fail("Verification failed. Try again."),"expired-callback":()=>fail("Verification expired. Try again."),"timeout-callback":()=>fail("Verification timed out. Try again.")});
    }).catch(error=>{if(mounted)setMessage(error.message);});
    return ()=>{mounted=false;pending.current?.reject(new Error("Verification cancelled."));pending.current=null;if(widget.current!==null)window.turnstile?.remove(widget.current);widget.current=null;};
  },[action]);
  useImperativeHandle(ref,()=>({verify:(signal)=>new Promise<string>((resolve,reject)=>{
    if(signal?.aborted){reject(new Error("Cancelled."));return;}
    if(!window.turnstile||widget.current===null){reject(new Error("Verification is still loading. Refresh if it does not appear."));return;}
    if(pending.current){reject(new Error("Verification is already running."));return;}
    setMessage("Verifying… complete the check if prompted.");
    const abort=()=>finish(new Error("Verification cancelled."));
    const timer=setTimeout(()=>finish(new Error("Verification timed out. Try again.")),45000);
    function finish(error:Error|null,token?:string){clearTimeout(timer);signal?.removeEventListener("abort",abort);pending.current=null;if(error){setMessage(error.message);reject(error);}else resolve(token!);}
    pending.current={resolve:token=>finish(null,token),reject:error=>finish(error)};
    signal?.addEventListener("abort",abort,{once:true});
    try{window.turnstile.reset(widget.current);window.turnstile.execute(widget.current);}catch{finish(new Error("Verification could not start. Refresh and try again."));}
  })}));
  return <div className="df-human-check"><div ref={container}/><p className="df-note" role="status">{message}</p></div>;
});
export default HumanCheck;
