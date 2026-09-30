import { accountClient, accountError, appOrigin, checkOrigin, jsonBody, PRIVATE_HEADERS, requireAccount } from "../../../lib/server/accounts";
import { GenerationError } from "../../../lib/server/http";
import { verifyHuman } from "../../../lib/server/turnstile";
export const dynamic="force-dynamic";
export async function GET(){try{const {user}=await requireAccount();return Response.json({user:{id:user.id,email:user.email}},{headers:PRIVATE_HEADERS});}catch(error){if(error instanceof GenerationError&&error.status===401)return Response.json({user:null},{headers:PRIVATE_HEADERS});return accountError(error);}}
export async function POST(request:Request){try{
  checkOrigin(request);const body=await jsonBody(request);const client=await accountClient();
  if(body.action==="logout") {const {error}=await client.auth.signOut({scope:"local"});if(error)throw error;return Response.json({ok:true},{headers:PRIVATE_HEADERS});}
  if(!["login","signup"].includes(String(body.action)))throw new GenerationError(400,"INVALID_ACTION","Choose sign in or create account.");
  const email=typeof body.email==="string"?body.email.trim():"",password=body.password;
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=="string"||password.length>128||password.length<(body.action==="signup"?8:1))throw new GenerationError(400,"INVALID_CREDENTIALS","Enter a valid email. New passwords must have 8–128 characters.");
  await verifyHuman(body.turnstileToken,"account");
  const response=body.action==="signup"?await client.auth.signUp({email,password,options:{emailRedirectTo:`${appOrigin()}/auth/callback`}}):await client.auth.signInWithPassword({email,password});
  if(response.error){
    if(response.error.status===429)throw new GenerationError(429,"AUTH_RATE_LIMIT","Too many attempts. Wait before trying again.");
    throw new GenerationError(400,"AUTH_FAILED",body.action==="signup"?"Account creation could not complete. Check your details or try again later.":"Could not sign in. Check your email/password and confirm your email first.");
  }
  return Response.json({ok:true,confirmationRequired:body.action==="signup"&&!response.data.session,message:body.action==="signup"&&!response.data.session?"If your address is eligible, a confirmation email will arrive. Open it in this browser, then sign in.":"Signed in."},{headers:PRIVATE_HEADERS});
}catch(error){return accountError(error);}}

