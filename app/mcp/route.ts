import {isOwner,json} from '../../lib/refresh-config';
import {requestRefresh,queueStatus} from '../../lib/refresh-queue';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const body=await request.json() as any;const result=(value:any)=>json({jsonrpc:'2.0',id:body.id,result:value});
 if(body.method==='server/discover')return result({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(body.method==='tools/list')return result({tools:[{name:'refresh_apiiro',description:'Owner-only: queue a GitHub-hosted Apiiro refresh using saved scope.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'refresh_status',description:'Owner-only: read last hosted refresh status.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
 if(!isOwner(request))return json({error:'Only the dashboard owner may refresh.'},403);
 try{if(body.method!=='tools/call')throw Error('Unsupported method');const name=body.params?.name;if(!['refresh_apiiro','refresh_status'].includes(name))throw Error('Unknown tool');const value=name==='refresh_apiiro'?await requestRefresh():await queueStatus();return result({content:[{type:'text',text:JSON.stringify(value)}]});}catch(e){return result({isError:true,content:[{type:'text',text:e instanceof Error?e.message:'Refresh failed'}]});}
}
