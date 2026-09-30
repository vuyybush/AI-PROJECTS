import { accountClient, appOrigin, PRIVATE_HEADERS } from "../../../lib/server/accounts";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  let target:string;
  try{target=appOrigin();}catch{return new Response("Account setup incomplete.",{status:503,headers:PRIVATE_HEADERS});}
  try{const code=new URL(request.url).searchParams.get("code");if(!code||code.length>2048)throw Error();const client=await accountClient();const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error;return new Response(null,{status:303,headers:{...PRIVATE_HEADERS,Location:`${target}/?account=confirmed#home`}});}
  catch{return new Response(null,{status:303,headers:{...PRIVATE_HEADERS,Location:`${target}/?account=confirmation-failed#home`}});}
}

