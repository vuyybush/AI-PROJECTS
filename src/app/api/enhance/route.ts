import {checkOrigin,jsonBody,PRIVATE_HEADERS,requireAccount} from '../../../lib/server/accounts';
import {reserveEnhancement,enhanceCloudflare} from '../../../lib/server/enhancement';
import {verifyHuman} from '../../../lib/server/turnstile';
import {GenerationError} from '../../../lib/server/http';
import {parseEnhancementInput,ENHANCEMENT_MODEL} from '../../../lib/validators/enhancement';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 let reservation:Awaited<ReturnType<typeof reserveEnhancement>>|undefined;
 const controller=new AbortController();const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();const deadline=setTimeout(abort,40000);
 try{
  checkOrigin(request);
  const body=await jsonBody(request);let input;try{input=parseEnhancementInput(body);}catch(e){throw new GenerationError(400,'INVALID_IDEA',e instanceof Error?e.message:'Invalid idea.');}
  const {user}=await requireAccount();if(!user.email_confirmed_at)throw new GenerationError(403,'CONFIRM_EMAIL','Confirm your email before enhancing a prompt.');
  await verifyHuman(input.turnstileToken,'enhance');controller.signal.throwIfAborted();
  reservation=await reserveEnhancement(user.id);controller.signal.throwIfAborted();
  const prompt=await enhanceCloudflare(input.idea,AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]));
  return Response.json({prompt,model:ENHANCEMENT_MODEL,remaining:reservation.remaining},{headers:PRIVATE_HEADERS});
 }catch(error){const safe=error instanceof GenerationError?error:new GenerationError(503,'ENHANCE_UNAVAILABLE','Prompt enhancement was interrupted or unavailable. Retry later or use your original idea.');return Response.json({error:{code:safe.code,message:safe.message}},{status:safe.status,headers:{...PRIVATE_HEADERS,...(safe.retryAfter?{'Retry-After':String(safe.retryAfter)}:{})}});
 }finally{clearTimeout(deadline);request.signal.removeEventListener('abort',abort);await reservation?.release();}
}
