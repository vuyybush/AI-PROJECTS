import "server-only";
import { createClient } from "@supabase/supabase-js";
import { GenerationError } from "./http";

function quotaClient() {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new GenerationError(503,"QUOTA_UNAVAILABLE","Generation limits are not configured yet.");
  // This privileged client is ONLY used for these two narrowly scoped RPCs.
  // Image/history operations continue to use the signed-in user's RLS client.
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:AbortSignal.timeout(5000)})}});
}
export async function reserveGeneration(userId:string,engine:string) {
  const client=quotaClient();
  const {data,error}=await client.rpc("reserve_generation",{p_user:userId,p_engine:engine});
  if(error||!data||typeof data.allowed!=="boolean") throw new GenerationError(503,"QUOTA_UNAVAILABLE","Cannot check the generation allowance. Please try later.");
  if(!data.allowed) {
    const messages:Record<string,string>={PAUSED:"Generation is temporarily paused by the studio owner.",IN_FLIGHT:"An image is already generating for your account. Wait for it to finish.",USER_RATE:"You can start two images per minute. Please wait before trying again.",USER_DAILY:"Your daily generation allowance is used up. It resets at 5:30 AM IST (00:00 UTC).",SHARED_DAILY:"The studio's shared daily allowance is used up. It resets at 5:30 AM IST (00:00 UTC)."};
    throw new GenerationError(429,String(data.code),messages[data.code]??"Generation is temporarily limited.",Math.max(1,Number(data.retryAfter)||60));
  }
  if(typeof data.lease!=="string") throw new GenerationError(503,"QUOTA_UNAVAILABLE","Could not reserve generation capacity.");
  return {remaining:Number(data.remaining),release:async()=>{
    // Do not refund: an interrupted/failed upstream request may still be billed.
    // A crashed invocation's lease expires automatically after 70 seconds.
    try{const {error}=await client.rpc("release_generation",{p_user:userId,p_lease:data.lease});if(error)console.warn("[DreamForge] Quota lease will expire automatically.");}catch{console.warn("[DreamForge] Quota lease will expire automatically.");}
  }};
}
