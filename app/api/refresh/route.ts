import {isOwner,json} from '../../../lib/refresh-config';
import {requestRefresh,queueStatus} from '../../../lib/refresh-queue';
export const dynamic='force-dynamic';
export async function GET(request:Request){if(!isOwner(request))return json({error:'Owner sign-in required.'},403);return json(await queueStatus());}
export async function POST(request:Request){if(!isOwner(request)||request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Owner sign-in and same-origin request required.'},403);try{return json(await requestRefresh());}catch(e){return json({error:e instanceof Error?e.message:'Refresh failed; previous data retained.'},503);}}
