import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { GenerationError, readLimited } from "./http";
export const PRIVATE_HEADERS = {"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"};
export function checkOrigin(request:Request) {
  if (request.headers.get("origin")!==appOrigin() || request.headers.get("sec-fetch-site")==="cross-site") throw new GenerationError(403,"INVALID_ORIGIN","Please use the account controls on this site.");
}
export async function jsonBody(request:Request) {
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json") throw new GenerationError(415,"INVALID_CONTENT_TYPE","Send JSON.");
  try {const value=JSON.parse(await readLimited(request.body,8192)); if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
  catch(error){if(error instanceof GenerationError)throw error;throw new GenerationError(400,"INVALID_JSON","Invalid request.");}
}
export function accountError(error:unknown) {
  const safe=error instanceof GenerationError?error:new GenerationError(503,"ACCOUNT_UNAVAILABLE","Account or storage service unavailable. Please try again later.");
  return Response.json({error:{code:safe.code,message:safe.message}},{status:safe.status,headers:PRIVATE_HEADERS});
}
export async function accountClient() {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new GenerationError(503,"ACCOUNT_NOT_CONFIGURED","Accounts are not available yet. Please try again later.");
  const jar=await cookies();
  // All callers are route handlers, which can persist refreshed cookies.
  // There is no browser Supabase client or authenticated Server Component.
  return createServerClient(url,key,{
    cookieOptions:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production" && process.env.APP_URL?.startsWith("https://")===true,path:"/"},
    cookies:{getAll:()=>jar.getAll(),setAll:values=>{for(const {name,value,options} of values)jar.set(name,value,options);}},
    global:{fetch:async(input,init)=>fetch(input,{...init,cache:"no-store",signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)})},
  });
}
export async function requireAccount() {
  const client=await accountClient();
  const {data,error}=await client.auth.getUser();
  if(error && error.status && error.status>=500)throw new GenerationError(503,"ACCOUNT_UNAVAILABLE","Cannot verify your session right now. Please retry.");
  if(error||!data.user)throw new GenerationError(401,"SIGN_IN_REQUIRED","Sign in to generate images and view your private history.");
  return {client,user:data.user};
}
export function appOrigin(){
  const value=process.env.APP_URL;if(!value)throw new GenerationError(503,"ACCOUNT_NOT_CONFIGURED","Account setup is incomplete.");
  const url=new URL(value);if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))throw new GenerationError(503,"ACCOUNT_NOT_CONFIGURED","Account setup is incomplete.");
  return url.origin;
}
