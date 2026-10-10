import { LocalAssetStorage } from "@aiwa/assets/storage";
import { hasPlatformPermission } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { getRequestSession } from "@/lib/request-auth";
export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const template=await db.generationTemplate.findUnique({where:{slug},select:{coverObjectKey:true,status:true}});
 if(!template?.coverObjectKey)return new Response(null,{status:404});
 if(template.status!=="PUBLISHED"){
  const session=await getRequestSession(request.headers);
  if(!session||!hasPlatformPermission(session.user.platformRole,"templates:read"))return new Response(null,{status:404});
 }
 try{
  const file=await new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT).read(template.coverObjectKey);
  return new Response(new Uint8Array(file),{headers:{"Content-Type":"image/webp","Content-Length":String(file.length),"X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=300","Content-Security-Policy":"default-src 'none'; sandbox"}});
 }catch{return new Response(null,{status:404});}
}
