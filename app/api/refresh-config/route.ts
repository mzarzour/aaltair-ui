import { readConfig,json } from '../../../lib/refresh-config';
export const dynamic='force-dynamic';
export async function GET(){try{return json((await readConfig()).config)}catch{return json({error:'Refresh configuration unavailable'},503)}}
