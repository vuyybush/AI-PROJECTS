"use client";
import {useEffect, useRef, useState, type FormEvent} from "react";
import {CANVASES, MAX_PROMPT_LENGTH, STYLE_SUFFIXES, type Canvas, type Engine, type GenerationStyle} from "../../config/generation";
import "./creative-studio.css";
import {useAccount} from "./AccountProvider";
import HumanCheck,{type HumanCheckHandle} from "./HumanCheck";
import FireballGuide,{type GuideRequest,type GuideOutcome} from "./FireballGuide";

type Settings = {style: GenerationStyle; engine: Engine; canvas: Canvas; styleNotes: string};
type Saved = Settings & {id: string; name: string};
type Result = {id: string; url: string; prompt: string; settings: Settings; batchId: string; saved: boolean; filename: string};
const KEY = "dreamforge-presets-v1";
const initial: Settings = {style:"Cinematic",engine:"schnell",canvas:"square",styleNotes:""};
function validPreset(x: unknown): x is Saved {
  if (!x || typeof x !== "object") return false;
  const p = x as Saved;
  return typeof p.id === "string" && p.id.length < 100 && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 40 && Object.hasOwn(STYLE_SUFFIXES,p.style) && ["schnell","phoenix"].includes(p.engine) && Object.hasOwn(CANVASES,p.canvas) && (p.engine !== "schnell" || p.canvas === "square") && typeof p.styleNotes === "string" && p.styleNotes.length <= 160;
}
export default function CreativeStudio({idea}: {idea: {prompt:string;style:GenerationStyle; key:number}|null}) {
  const {user,loading:accountLoading,refresh:refreshAccount}=useAccount();
  const humanCheck=useRef<HumanCheckHandle>(null);
  const [remaining,setRemaining]=useState<number|null>(null);
  const [prompt,setPrompt]=useState(""); const [settings,setSettings]=useState<Settings>(initial);
  const [count,setCount]=useState(1); const [busy,setBusy]=useState(false); const [progress,setProgress]=useState(0);
  const [activeBatch,setActiveBatch]=useState("");
  const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const [results,setResults]=useState<Result[]>([]); const [selected,setSelected]=useState("");
  const [draft,setDraft]=useState<string|null>(null); const [before,setBefore]=useState<string|null>(null);
  const [saved,setSaved]=useState<Saved[]>([]); const [name,setName]=useState("");
  const controller=useRef<AbortController|null>(null); const owned=useRef<Result[]>([]); const promptRef=useRef<HTMLTextAreaElement>(null);
  const result=results.find(x=>x.id===selected) ?? results[0];
  const changed=!!result && (result.prompt!==prompt.trim() || (Object.keys(initial) as (keyof Settings)[]).some(key=>result.settings[key]!==settings[key]));
  const previousBatch=!!result && busy && result.batchId!==activeBatch;
  useEffect(()=>{try{const raw=JSON.parse(localStorage.getItem(KEY)??"[]");if(Array.isArray(raw))setSaved(raw.filter(validPreset).slice(0,12));}catch{setNotice("Saved presets could not be loaded. You can still generate images.");}},[]);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;owned.current.forEach(x=>URL.revokeObjectURL(x.url));},[]);
  useEffect(()=>{if(idea){setPrompt(idea.prompt);setSettings(s=>({...s,style:idea.style}));setDraft(null);setError("");promptRef.current?.focus({preventScroll:true});}},[idea]);
  useEffect(()=>{
    controller.current?.abort();controller.current=null;setBusy(false);
    owned.current.forEach(x=>URL.revokeObjectURL(x.url));owned.current=[];
    setResults([]);setSelected("");setNotice("");setError("");setPrompt("");setDraft(null);setBefore(null);setRemaining(null);
  },[user?.id]);
  function store(next:Saved[]) {
    try{localStorage.setItem(KEY,JSON.stringify(next));setSaved(next);setNotice("Presets saved in this browser.");}
    catch{setNotice("Browser storage is unavailable or full. This preset could not be saved.");}
  }
  function savePreset(){if(!name.trim()){setNotice("Give the preset a name first.");return;}if(saved.length>=12){setNotice("You can save 12 presets. Delete one to make room.");return;}store([...saved,{...settings,id:crypto.randomUUID(),name:name.trim().slice(0,40)}]);setName("");}
  function enhance(){
    if(prompt.trim().length<3){setError("Write an idea first.");return;}
    const addition="Clear focal subject, intentional composition, balanced lighting, detailed textures, cohesive colors.";
    const candidate=prompt.trim()+"\n\n"+addition;
    if(candidate.length>MAX_PROMPT_LENGTH){setError("Shorten your prompt to leave space for enhancement.");return;}
    setDraft(candidate);setError("");
  }
  function stop(){controller.current?.abort();controller.current=null;setBusy(false);setNotice("Stopped waiting. Completed images are kept; an in-flight request may still use quota.");}
  async function generate(event:FormEvent){event.preventDefault();await runGeneration();}
  async function runGeneration(guide?:GuideRequest):Promise<GuideOutcome>{
    if(controller.current)return {completed:0,error:"The studio is already generating."};
    const snapshotSettings:Settings=guide?{style:guide.style,engine:"schnell",canvas:"square",styleNotes:""}:{...settings};
    const submittedPrompt=(guide?.prompt??prompt).trim();const total=guide?.count??count;
    if(!user){setError("Sign in before generating.");return {completed:0,error:"Sign in before generating."};}
    if(submittedPrompt.length<3||submittedPrompt.length>MAX_PROMPT_LENGTH||![1,2,4].includes(total)){setError("Check your prompt and image count.");return {completed:0,error:"Check your prompt and image count."};}
    if(guide){setPrompt(submittedPrompt);setSettings(snapshotSettings);setCount(total);setDraft(null);}
    const control=new AbortController();controller.current=control;setBusy(true);setProgress(0);setError("");setNotice("");
    const batchId=crypto.randomUUID();setActiveBatch(batchId);
    const snapshot={prompt:submittedPrompt,...snapshotSettings};let completed=0;let fallbackUsed=false;
    try{
      for(let index=0;index<total;index++){
        setProgress(index+1);
        if(index>0){setNotice("Waiting 31 seconds before the next variation to respect the studio limit.");await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error("Cancelled."));};const timer=setTimeout(()=>{control.signal.removeEventListener("abort",abort);resolve();},31000);if(control.signal.aborted)abort();else control.signal.addEventListener("abort",abort,{once:true});});}
        const turnstileToken=await humanCheck.current?.verify(control.signal);
        if(!turnstileToken)throw new Error("Human verification is unavailable.");
        if(control.signal.aborted||controller.current!==control)return {completed,cancelled:true};
        const timeout=setTimeout(()=>control.abort(),65000);
        try{
          const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...snapshot,turnstileToken}),signal:control.signal});
          if(!response.ok){if(response.status===401)void refreshAccount();const body=await response.json().catch(()=>null);throw new Error(body?.error?.message??"Generation failed. Try again later.");}
          const mime=response.headers.get("content-type")?.split(";")[0];
          if(mime!=="image/jpeg"&&mime!=="image/png")throw new Error("The server did not return an image.");
          const blob=await response.blob();if(!blob.size||blob.size>3*1024*1024)throw new Error("The image is empty or too large.");
          if(controller.current!==control||control.signal.aborted)return {completed,cancelled:true};
          const usedFallback=response.headers.get("X-Generation-Fallback")==="true";
          const allowance=response.headers.get("X-User-Remaining");if(allowance!==null)setRemaining(Number(allowance));
          const item={id:crypto.randomUUID(),url:URL.createObjectURL(blob),prompt:snapshot.prompt,settings:{...snapshotSettings},batchId,saved:response.headers.get("X-History-Saved")==="true",filename:`dreamforge-${Date.now()}-${index+1}.${mime==="image/png"?"png":"jpg"}`};
          if(index===0){owned.current.forEach(x=>URL.revokeObjectURL(x.url));owned.current=[];}
          owned.current=[...owned.current,item];setResults(owned.current);setSelected(item.id);completed++;if(usedFallback)fallbackUsed=true;if(item.saved)window.dispatchEvent(new Event("dreamforge-history"));
        }finally{clearTimeout(timeout);}
      }
      setNotice(`${completed} image${completed===1?"":"s"} ready. Download your favorites before leaving.${fallbackUsed?" The selected model was full, so Cloudflare's backup generated the result.":""}`);
      return {completed};
    }catch(failure){
      if(controller.current!==control)return {completed,cancelled:true};
      const message=`${control.signal.aborted?"Generation timed out.":failure instanceof Error?failure.message:"Connection failed."}${completed?` ${completed} completed image(s) kept.`:""}`;setError(message);return {completed,error:message};
    }finally{if(controller.current===control){controller.current=null;setBusy(false);}}
  }
  return <section id="studio" className="df-studio df-section df-creative" aria-labelledby="studio-title">
    <div className="df-section-top"><p className="df-eyebrow">01 / THE STUDIO</p><span className="df-demo-badge">TEXT → IMAGE</span></div>
    <div className="df-section-heading"><h2 id="studio-title">Your next frame.</h2><p>Describe. Refine. Make it yours.</p></div>
    <div className="df-workspace"><form onSubmit={generate} className="df-form" noValidate>
      <div className="df-label-line"><label htmlFor="prompt">Your imagination, in words</label><span>{prompt.length} / {MAX_PROMPT_LENGTH}</span></div>
      <textarea id="prompt" ref={promptRef} maxLength={MAX_PROMPT_LENGTH} value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)} placeholder="A quiet observatory above a sea of clouds…" />
      <div className="df-helper-actions"><button type="button" disabled={busy} onClick={enhance}>Enhance prompt</button>{before!==null&&<button type="button" disabled={busy} onClick={()=>{setPrompt(before);setBefore(null);}}>Undo enhancement</button>}</div>
      {draft!==null&&<div className="df-enhancement"><label htmlFor="enhanced">Edit the suggestion before applying</label><textarea id="enhanced" value={draft} maxLength={MAX_PROMPT_LENGTH} disabled={busy} onChange={e=>setDraft(e.target.value)}/><p>Local prompt helper · no API usage</p><div className="df-helper-actions"><button type="button" disabled={busy} onClick={()=>{setBefore(prompt);setPrompt(draft);setDraft(null);}}>Apply suggestion</button><button type="button" disabled={busy} onClick={()=>setDraft(null)}>Discard</button></div></div>}
      <fieldset disabled={busy}><legend>Visual direction</legend><div className="df-styles">{Object.keys(STYLE_SUFFIXES).map(style=><button key={style} type="button" aria-pressed={settings.style===style} onClick={()=>setSettings({...settings,style:style as GenerationStyle})}>{style}</button>)}</div></fieldset>
      <label className="df-control-label" htmlFor="style-notes">Your style notes <span>optional</span></label><input id="style-notes" maxLength={160} value={settings.styleNotes} disabled={busy} onChange={e=>setSettings({...settings,styleNotes:e.target.value})} placeholder="Muted earth tones, soft grain…"/>
      <div className="df-control-grid"><label>Model<select aria-label="Model" disabled={busy} value={settings.engine} onChange={e=>setSettings({...settings,engine:e.target.value as Engine,canvas:"square"})}><option value="schnell">Schnell · lower usage</option><option value="phoenix">Phoenix · flexible canvas</option></select></label><label>Canvas<select aria-label="Canvas" disabled={busy||settings.engine==="schnell"} value={settings.canvas} onChange={e=>setSettings({...settings,canvas:e.target.value as Canvas})}><option value="square">{settings.engine==="schnell"?"Model default":"Square · 1:1"}</option>{settings.engine==="phoenix"&&<><option value="landscape">Landscape · 4:3</option><option value="portrait">Portrait · 3:4</option></>}</select></label></div>
      <p className="df-note">{settings.engine==="phoenix"?"Phoenix uses substantially more quota per image. Canvas sizes are generated natively; access depends on your Cloudflare account.":"Schnell uses its default canvas. Choose Phoenix for other ratios."}</p>
      <div className="df-control-grid"><label>Variations<select aria-label="Variations" disabled={busy} value={count} onChange={e=>setCount(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n} image{n>1?"s":""}</option>)}</select></label><p className="df-note">{count} separate generation request{count>1?"s":""}. Variations are fresh interpretations of the same prompt, not edits of an image.</p></div>
      {!user&&<p className="df-auth-required">{accountLoading?"Checking your account…":<><a href="#account">Sign in or create an account</a> to generate and save images.</>}</p>}
      <p className="df-note">{remaining===null?"Daily allowances apply. Failed or cancelled attempts may count.":`${remaining} attempts left when last checked. Daily reset: 5:30 AM IST.`} {count>1&&"Variations wait 31 seconds between requests."}</p>
      <HumanCheck ref={humanCheck} action="generate"/>
      <button type="submit" className="df-generate" disabled={busy||!user}>{busy?`Generating ${progress} of ${count}…`:`Generate ${count===1?"image":`${count} variations`}`}</button>
      {busy&&<button type="button" className="df-text-button" onClick={stop}>Stop remaining variations</button>}
      {error&&<p className="df-error" role="alert">{error}</p>}<p className="df-note" role="status">{notice}</p>
      <details className="df-saved"><summary>My reusable presets ({saved.length}/12)</summary><p className="df-note">Save style, model and canvas on this browser. Images and prompts are not saved here.</p><div className="df-save-row"><input aria-label="Preset name" placeholder="Preset name" maxLength={40} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/><button type="button" disabled={busy} onClick={savePreset}>Save preset</button></div>{saved.map(item=><div className="df-saved-row" key={item.id}><button type="button" disabled={busy} onClick={()=>{setSettings({style:item.style,engine:item.engine,canvas:item.canvas,styleNotes:item.styleNotes});setNotice(`Applied ${item.name}.`);}}>{item.name}</button><button type="button" disabled={busy} aria-label={`Delete preset ${item.name}`} onClick={()=>store(saved.filter(p=>p.id!==item.id))}>Delete</button></div>)}</details>
    </form><div className="df-preview"><div className="df-preview-bar"><span>YOUR CANVAS</span><span>{busy?`${progress} / ${count}`:`${results.length} IMAGE${results.length===1?"":"S"}`}</span></div>
      {result&&(changed||previousBatch)&&<p className="df-result-warning" role="status">{previousBatch?"Generating new images. The image below is from an earlier batch.":busy?"The form changed. This image belongs to the submitted prompt shown below.":"Prompt or settings changed. This is an earlier result — press Generate to update."}</p>}
      {result&&<div className="df-result-source"><span>Generated from</span><p>{result.prompt}</p><small>{result.settings.engine==="schnell"?"Schnell":"Phoenix"} · {result.settings.style} · {result.settings.engine==="schnell"?"Default canvas":result.settings.canvas}</small>{result.settings.styleNotes&&<small>Style notes: {result.settings.styleNotes}</small>}</div>}
      <div className="df-preview-stage">{result?<img key={result.id} src={result.url} alt={result.prompt}/>:<div className="df-empty"><span className={busy?"df-orbit":"df-canvas-symbol"} aria-hidden="true">✳</span><h3>{busy?"An idea taking shape.":"The canvas is yours."}</h3><p>{busy?"Your image will appear here.":"Write a prompt, choose a direction, and create your first image."}</p></div>}</div>
      <div className="df-preview-footer" role="status">{busy?`Generating ${progress} of ${count}…`:result?"Choose your favorite. Make it yours.":"Your next idea belongs here."}</div>
      {results.length>0&&<div className="df-variation-grid" aria-label="Generated variations">{results.map((item,index)=><button type="button" key={item.id} aria-label={`View variation ${index+1}`} aria-pressed={result?.id===item.id} onClick={()=>setSelected(item.id)}><img src={item.url} alt=""/><span>{index+1}</span></button>)}</div>}
      {result&&<p className="df-save-status" data-saved={result.saved}>{result.saved?"Saved to your private gallery.":"Not saved to history. Download this image now to keep it."}</p>}
      {result&&<a className="df-download" href={result.url} download={result.filename}>Download selected image ↓</a>}
      <p className="df-note df-preview-note">This preview clears on refresh or sign-out. Successfully saved images remain in your private gallery.</p>
    </div></div>
    <FireballGuide key={user?.id??"signed-out"} signedIn={!!user} busy={busy} progress={progress} currentPrompt={prompt} onStop={stop} onGenerate={runGeneration} onApply={(text,options)=>{if(controller.current)return;setPrompt(text);setDraft(null);setError("");if(options){setSettings({style:options.style,engine:"schnell",canvas:"square",styleNotes:""});setCount(options.count);}}}/>
  </section>;
}
