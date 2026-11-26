import {json} from '../../../lib/refresh-config';
import {runnerAuthorized,claimRefresh,finishRefresh} from '../../../lib/refresh-queue';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!runnerAuthorized(request))return json({error:'Unauthorized'},403);try{const raw=await request.text();if(raw.length>15000000)return json({error:'Snapshot too large'},413);const input=JSON.parse(raw);if(input.action==='claim')return json(await claimRefresh(input.manual === true));if(input.action==='complete')return json(await finishRefresh(input));return json({error:'Unknown action'},400);}catch(e){return json({error:e instanceof Error?e.message:'Refresh failed'},409);}}
