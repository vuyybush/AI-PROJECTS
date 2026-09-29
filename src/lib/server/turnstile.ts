import "server-only";
import { appOrigin } from "./accounts";
import { GenerationError } from "./http";

export async function verifyHuman(token:unknown,action:"generate"|"account"|"enhance") {
  const secret=process.env.TURNSTILE_SECRET_KEY;
  const hostname=new URL(appOrigin()).hostname;
  if(!secret) throw new GenerationError(503,"VERIFICATION_UNAVAILABLE","Human verification is not configured yet.");
  if(typeof token!=="string"||!token||token.length>2048) throw new GenerationError(400,"VERIFICATION_REQUIRED","Complete the human verification and try again.");
  let result;
  try{
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret,response:token}),signal:AbortSignal.timeout(8000),cache:"no-store",redirect:"error"});
    if(!response.ok)throw Error();
    result=await response.json();
  }catch{throw new GenerationError(503,"VERIFICATION_UNAVAILABLE","Human verification is unavailable. Please try again.");}
  if(result.success!==true||result.hostname!==hostname||result.action!==action) throw new GenerationError(403,"VERIFICATION_FAILED","Verification expired or failed. Please try again.");
}
