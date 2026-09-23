import { accountError, checkOrigin, PRIVATE_HEADERS, requireAccount } from "../../../../lib/server/accounts";
import { BUCKET } from "../../../../lib/server/history";
import { GenerationError } from "../../../../lib/server/http";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
async function owned(context:Context){
  const {client,user}=await requireAccount(),{id}=await context.params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new GenerationError(404,"NOT_FOUND","Image not found.");
  const {data,error}=await client.from("generations").select("id,object_path,mime_type").eq("id",id).eq("user_id",user.id).maybeSingle();
  if(error)throw error;if(!data)throw new GenerationError(404,"NOT_FOUND","Image not found.");return{client,data};
}
export async function GET(request:Request,context:Context){try{
  const {client,data}=await owned(context);const {data:blob,error}=await client.storage.from(BUCKET).download(data.object_path);if(error||!blob)throw error??Error();
  const ext=data.mime_type==="image/png"?"png":"jpg",attachment=new URL(request.url).searchParams.get("download")==="1";
  return new Response(blob,{headers:{...PRIVATE_HEADERS,"Content-Type":data.mime_type,"Content-Disposition":`${attachment?"attachment":"inline"}; filename="dreamforge-${data.id}.${ext}"`}});
}catch(error){return accountError(error);}}
export async function DELETE(request:Request,context:Context){try{
  checkOrigin(request);const {client,data}=await owned(context);
  const {error:storageError}=await client.storage.from(BUCKET).remove([data.object_path]);if(storageError)throw storageError;
  const {error}=await client.from("generations").delete().eq("id",data.id);if(error)throw error;
  return Response.json({ok:true},{headers:PRIVATE_HEADERS});
}catch(error){return accountError(error);}}
