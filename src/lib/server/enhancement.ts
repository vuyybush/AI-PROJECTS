import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {GenerationError,readLimited} from './http';
import {ENHANCEMENT_MODEL,ENHANCEMENT_SYSTEM,parseEnhancedPrompt} from '../validators/enhancement';
export async function reserveEnhancement(userId:string){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new GenerationError(503,'ENHANCE_SETUP','Prompt enhancement is not configured yet.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(5000)})}});
 const {data,error}=await client.rpc('reserve_prompt_enhancement',{p_user:userId});
 if(error||typeof data?.allowed!=='boolean')throw new GenerationError(503,'ENHANCE_SETUP','Prompt enhancement needs its database setup. Run the Fireball migration.');
 if(!data.allowed){const messages:Record<string,string>={PAUSED:'The studio is temporarily paused.',IN_FLIGHT:'A prompt is already being enhanced. Wait for it to finish.',ENHANCE_DAILY:'Your 20 daily prompt enhancements are used. You can still enter a prompt manually.',ENHANCE_RATE:'You can enhance three prompts per minute. Please wait.',SHARED_DAILY:'The studio’s shared daily allowance is used up. It resets at 00:00 UTC (5:30 AM IST).'};throw new GenerationError(429,data.code,messages[data.code]??'Prompt enhancement is temporarily limited.',Math.max(1,Number(data.retryAfter)||60));}
 if(typeof data.lease!=='string')throw new GenerationError(503,'ENHANCE_SETUP','Could not reserve prompt capacity.');
 return {remaining:Number(data.remaining),release:async()=>{try{const {error}=await client.rpc('release_prompt_enhancement',{p_user:userId,p_lease:data.lease});if(error)console.warn('[DreamForge] Prompt lease will expire automatically.');}catch{console.warn('[DreamForge] Prompt lease will expire automatically.');}}};
}
export async function enhanceCloudflare(idea:string,signal:AbortSignal){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!/^[a-f0-9]{32}$/i.test(account)||!token)throw new GenerationError(503,'ENHANCE_SETUP','Cloudflare prompt enhancement is not configured yet.');
 const userText=JSON.stringify({visual_idea:idea});
 if(Buffer.byteLength(ENHANCEMENT_SYSTEM+userText,'utf8')>5000)throw new GenerationError(400,'IDEA_TOO_LONG','Please shorten the idea.');
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${ENHANCEMENT_MODEL}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:ENHANCEMENT_SYSTEM},{role:'user',content:userText}],max_tokens:384,temperature:0.4,stream:false}),signal,cache:'no-store',redirect:'error'});
 let body;try{body=JSON.parse(await readLimited(response.body,32768));}catch{throw new GenerationError(502,'ENHANCE_RESPONSE','The prompt service returned an invalid response.');}
 if(!response.ok||body.success===false){const codes=Array.isArray(body.errors)?body.errors.map((e:{code?:unknown})=>Number(e.code)):[];console.warn('[DreamForge] Prompt enhancement failed.',{status:response.status,codes});
 if(codes.includes(4006))throw new GenerationError(429,'PROVIDER_DAILY','Cloudflare’s daily allowance is exhausted. It resets at 00:00 UTC (5:30 AM IST).',60);
 if([401,403].includes(response.status))throw new GenerationError(503,'ENHANCE_ACCESS','Cloudflare rejected access to the prompt model. Check the server token permissions.');
 throw new GenerationError(response.status===429?429:502,'ENHANCE_UNAVAILABLE','The AI prompt service is unavailable. Retry later or use your original idea.',response.status===429?60:undefined);}
 try{return parseEnhancedPrompt(body.result?.response);}catch(e){throw new GenerationError(502,'ENHANCE_RESPONSE',e instanceof Error?e.message:'Invalid enhanced prompt.');}
}
