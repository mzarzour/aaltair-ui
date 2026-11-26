import {env} from 'cloudflare:workers';
import {readConfig} from './refresh-config';
const key='altair/github-refresh-state.json';
async function read(){const o=await env.BUCKET!.get(key);return {state:o?await o.json<any>():{status:'idle'},etag:o?.etag};}
async function save(state:any,etag?:string){const o=await env.BUCKET!.put(key,JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});if(!o)throw Error('Refresh state changed. Please retry.');}
export async function queueStatus(){return (await read()).state;}
export async function requestRefresh(){const {state,etag}=await read();if(state.status==='queued'||state.status==='running'&&Date.now()-Date.parse(state.startedAt)<25*60000)return state;const next={...state,status:'queued',requestedAt:new Date().toISOString(),error:null};await save(next,etag);return next;}
export function runnerAuthorized(request:Request){const expected=(env as any).REFRESH_RUNNER_TOKEN;return !!expected&&request.headers.get('x-aaltair-runner-key')===expected;}
export async function claimRefresh(){
 const {state,etag}=await read();if(state.status==='running'&&Date.now()-Date.parse(state.startedAt)<25*60000)return {job:null};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));const date=`${parts.year}-${parts.month}-${parts.day}`;
 const due=Number(parts.hour)>=7&&state.completedLocalDate!==date;
 if(state.status!=='queued'&&!due)return {job:null};
 if(state.failedAt&&Date.now()-Date.parse(state.failedAt)<15*60000&&state.status!=='queued')return {job:null};
 const {config,etag:configEtag}=await readConfig();const job=crypto.randomUUID();await save({...state,status:'running',job,configEtag,startedAt:new Date().toISOString(),localDate:date,error:null},etag);return {job,config};
}
export async function finishRefresh(input:any){
 const {state,etag}=await read();if(state.status!=='running'||state.job!==input.job)throw Error('Refresh job is no longer current.');
 if(input.error){await save({...state,status:'failed',failedAt:new Date().toISOString(),error:'GitHub refresh failed. Previous snapshot retained; check the workflow run.'},etag);return {status:'failed'};}
 const {config,etag:configEtag}=await readConfig();if(configEtag!==state.configEtag)throw Error('Setup changed during retrieval. Retry refresh.');
 const data=input.data,catalog=input.catalog;
 if(!data||!Array.isArray(data.apps)||!Array.isArray(data.aging?.items)||!Array.isArray(data.resolved?.items)||!Array.isArray(catalog))throw Error('Invalid snapshot.');
 if(JSON.stringify(data.apps.map((a:any)=>a.name).sort())!==JSON.stringify([...config.applications].sort()))throw Error('Snapshot scope mismatch.');
 const ids=new Set();const counts=[0,0,0,0],vuln=[0,0,0,0];
 for(const r of data.aging.items){if(typeof r.id!=='string'||ids.has(r.id)||!Number.isInteger(r.severity)||r.severity<0||r.severity>3||!Array.isArray(r.apps)||!r.apps.length||r.apps.some((i:any)=>!Number.isInteger(i)||!data.apps[i]))throw Error('Invalid finding membership.');ids.add(r.id);counts[r.severity]++;if(r.vulnerability)vuln[r.severity]++;}
 if(JSON.stringify(counts)!==JSON.stringify(data.counts?.total?.risks)||JSON.stringify(vuln)!==JSON.stringify(data.counts?.total?.vulnerabilities))throw Error('Finding totals do not reconcile.');
 for(let i=0;i<data.apps.length;i++)for(const mode of ['risks','vulnerabilities']){const expected=[0,0,0,0];data.aging.items.filter((r:any)=>r.apps.includes(i)&&(mode==='risks'||r.vulnerability)).forEach((r:any)=>expected[r.severity]++);if(JSON.stringify(expected)!==JSON.stringify(data.counts[`application-${i}`]?.[mode]))throw Error('Application totals do not reconcile.');}
 if(data.history){if(data.history.version!==2)throw Error('Unsupported history version.');const seen=new Set();if(!Array.isArray(data.history.items)||!/^\d{4}-\d{2}-\d{2}$/.test(data.history.from))throw Error('Invalid history.');for(const r of data.history.items){if(typeof r.id!=='string'||seen.has(r.id)||!Array.isArray(r.apps)||!r.apps.length||r.apps.some((i:any)=>!Number.isInteger(i)||!data.apps[i]))throw Error('Invalid history membership.');seen.add(r.id);for(const field of ['discoveredDate','fixedDate','closedDate'])if(r[field]!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(r[field]))throw Error('Invalid history date.');}}
 const updatedAt=new Date().toISOString();await env.BUCKET!.put('altair/hosted-snapshot.json',JSON.stringify({updatedAt,data,catalog}),{httpMetadata:{contentType:'application/json'}});
 await save({...state,status:'complete',completedAt:updatedAt,completedLocalDate:state.localDate,findings:ids.size,error:null},etag);return {status:'complete',updatedAt,findings:ids.size};
}
