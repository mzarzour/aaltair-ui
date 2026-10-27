import { env } from 'cloudflare:workers';
import { isOwner, readConfig, key, json } from '../../../lib/refresh-config';
import catalog from '../../../data/application-catalog.json';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 if(!isOwner(request))return json({error:'Sign in with the dashboard owner account to edit Setup.'},request.headers.get('oai-authenticated-user-id')?403:401);
 try {return json({...await readConfig(),catalog});}catch{return json({error:'Settings are unavailable. Please try again.'},503);}
}
export async function POST(request:Request) {
 if(!isOwner(request))return json({error:'Only the dashboard owner may change refresh settings.'},403);
 if(request.headers.get('origin')!==new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request origin or format.'},403);
 if(Number(request.headers.get('content-length'))>200000)return json({error:'Request too large.'},413);
 try {
 const raw=await request.text();if(raw.length>200000)return json({error:'Request too large.'},413);
 const input=JSON.parse(raw);
 if(!Array.isArray(input.applications)||input.applications.length<1||input.applications.length>100||input.applications.some((v:unknown)=>typeof v!=='string'||v.trim().length<1||v.length>200))return json({error:'Enter between 1 and 100 application names (up to 200 characters each).'},400);
 const names=[...new Set(input.applications.map((v:string)=>v.trim()))] as string[];
 if(new Set(names.map(v=>v.toLowerCase())).size!==names.length)return json({error:'Remove duplicate application names.'},400);
 const current=await readConfig();if(input.etag!==current.etag)return json({error:'Settings changed elsewhere. Reload Setup before saving.'},409);
 if(!input.repositorySelections || typeof input.repositorySelections!=='object' || Array.isArray(input.repositorySelections))return json({error:'Repository selections are required. Reload Setup.'},400);
 const selections:Record<string,string[]|null>=Object.create(null);
 for(const name of names){
  if(!Object.hasOwn(input.repositorySelections,name))return json({error:'Missing repository selection for '+name},400);
  const value=input.repositorySelections[name];
  if(value===null){selections[name]=null;continue;}
  if(!Array.isArray(value)||value.length<1||value.length>2000||value.some((v:unknown)=>typeof v!=='string'))return json({error:'Select at least one repository or deselect '+name},400);
  const app=catalog.find(a=>a.name===name);const allowed=new Set(app?.repositories.map(r=>r.repositoryUrl)||[]);
  if(!app||value.some((url:string)=>!allowed.has(url)))return json({error:'Repository list changed for '+name+'. Reload Setup before saving.'},400);
  selections[name]=[...new Set(value)] as string[];
 }
 const config={applications:names,repositorySelections:selections,updatedAt:new Date().toISOString(),repositoryFilters:{}};
 const saved=await env.BUCKET!.put(key,JSON.stringify(config),{httpMetadata:{contentType:'application/json'},onlyIf:current.etag?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}});
 if(!saved)return json({error:'Settings changed elsewhere. Reload Setup before saving.'},409);
 return json({config,etag:saved.etag});
 }catch{return json({error:'Unable to save settings. No refresh was started.'},400);}
}
