import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { validateGeneration } from "../validators/generation";
export const BUCKET="dreamforge-private";
export async function saveGeneration(client:SupabaseClient,userId:string,input:ReturnType<typeof validateGeneration>,image:{bytes:Uint8Array;mime:string}){
  const id=crypto.randomUUID(),path=`${userId}/${id}.${image.mime==="image/png"?"png":"jpg"}`;
  const {error:uploadError}=await client.storage.from(BUCKET).upload(path,image.bytes,{contentType:image.mime,cacheControl:"0",upsert:false});
  if(uploadError)throw uploadError;
  try{
    const {error}=await client.from("generations").insert({id,user_id:userId,object_path:path,prompt:input.prompt,style:input.style,engine:input.engine,canvas:input.canvas,style_notes:input.styleNotes,mime_type:image.mime});
    if(error)throw error;return id;
  }catch(error){await client.storage.from(BUCKET).remove([path]).catch(()=>null);throw error;}
}
