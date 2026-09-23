import { accountError, PRIVATE_HEADERS, requireAccount } from "../../../lib/server/accounts";
import { GenerationError } from "../../../lib/server/http";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
  const {client,user}=await requireAccount();const raw=new URL(request.url).searchParams.get("page")??"0";
  if(!/^\d{1,5}$/.test(raw))throw new GenerationError(400,"INVALID_PAGE","Invalid history page.");const page=Number(raw);
  const {data,error}=await client.from("generations").select("id,prompt,style,engine,canvas,style_notes,created_at,mime_type").eq("user_id",user.id).order("created_at",{ascending:false}).order("id",{ascending:false}).range(page*12,page*12+12);
  if(error)throw error;return Response.json({items:data.slice(0,12),hasMore:data.length>12},{headers:PRIVATE_HEADERS});
}catch(error){return accountError(error);}}
