import {env} from 'cloudflare:workers';
import {readConfig} from './refresh-config';
const snapshotKey='altair/hosted-snapshot.json', lockKey='altair/refresh-lock.json';
export async function hostedSnapshot(){const v=await env.BUCKET!.get(snapshotKey);return v?await v.json<any>():null;}
const levels=['Critical','High','Medium','Low'];
const norm=(s:string)=>s.toLowerCase().replace(/\/$/,'').replace(/\.git$/,'');
const day=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
async function api(path:string,params:URLSearchParams){
 const settings=env as any;if(!settings.APIIRO_API_TOKEN)throw Error('Apiiro connection is not configured.');
 if(settings.APIIRO_BASE_URL!=='https://app.apiiro.com')throw Error('Unexpected Apiiro host.');
 const response=await fetch(settings.APIIRO_BASE_URL+path+'?'+params,{headers:{Authorization:'Bearer '+settings.APIIRO_API_TOKEN},redirect:'manual',signal:AbortSignal.timeout(60000)});
 if(response.status>=300&&response.status<400)throw Error('Apiiro redirected the request; refresh stopped without forwarding credentials.');
 if(!response.ok)throw Error('Apiiro returned HTTP '+response.status+'. Check token permissions and expiry.');
 return response.json() as Promise<any>;
}
async function pages(path:string,filters:Record<string,string>={}){const rows:any[]=[];for(let skip=0;skip<100000;skip+=100){const p=await api(path,new URLSearchParams({pageSize:'100',skip:String(skip),...filters}));if(!Array.isArray(p.items)||!Number.isInteger(p.paging?.totalItemCount))throw Error('Invalid Apiiro pagination.');rows.push(...p.items);if(rows.length===p.paging.totalItemCount)return rows;if(!p.items.length||rows.length>p.paging.totalItemCount)throw Error('Apiiro pagination changed; retry refresh.');}throw Error('Apiiro page limit exceeded.');}
export function buildSnapshot(config:any,catalog:any[],risks:any[],now:Date){
 const apps=config.applications.map((name:string)=>{const found=catalog.filter(a=>a.name.toLowerCase()===name.toLowerCase());if(found.length!==1)throw Error('Application missing or ambiguous: '+name);const a=found[0],selected=config.repositorySelections?.[name];let repos=a.repositories;
 if(Array.isArray(selected)){if(!selected.length||selected.some((u:string)=>!repos.some((r:any)=>r.repositoryUrl===u)))throw Error('Selected repositories changed for '+name);repos=repos.filter((r:any)=>selected.includes(r.repositoryUrl));}
 else if(!Object.hasOwn(config.repositorySelections||{},name)&&config.repositoryFilters?.[name])repos=repos.filter((r:any)=>r.repositoryUrl.split('/').pop().toLowerCase().includes(config.repositoryFilters[name].toLowerCase()));
 return {id:a.key,name:a.name,repositories:repos.map((r:any)=>({...r})).sort((a:any,b:any)=>a.repositoryUrl.localeCompare(b.repositoryUrl))};}).sort((a:any,b:any)=>a.name.localeCompare(b.name));
 const rows=[...new Map(risks.filter(r=>r.riskStatus==='Open'&&levels.includes(r.riskLevel)).map(r=>[r.id,r])).values()];
 const vuln=(r:any)=>r.findingCategory==='Vulnerability'||r.riskCategory==='Container security';
 const count=(rs:any[])=>Object.fromEntries(['risks','vulnerabilities'].map(mode=>[mode,levels.map(l=>new Set(rs.filter(r=>r.riskLevel===l&&(mode==='risks'||vuln(r))).map(r=>r.id)).size)]));
 const age=(r:any)=>{const t=Date.parse(r.discoveredOn);if(!Number.isFinite(t))return null;const days=Math.round((Date.parse(day(now))-Date.parse(day(new Date(t))))/86400000);return days<0?null:days;};
 const bucket=(n:number|null)=>n===null?4:n<=30?0:n<=60?1:n<=90?2:3;
 const matrix=(rs:any[])=>{const m:any={risks:levels.map(()=>[0,0,0,0,0]),vulnerabilities:levels.map(()=>[0,0,0,0,0])};for(const r of new Map(rs.map(r=>[r.id,r])).values()){m.risks[levels.indexOf(r.riskLevel)][bucket(age(r))]++;if(vuln(r))m.vulnerabilities[levels.indexOf(r.riskLevel)][bucket(age(r))]++;}return m;};
 const counts:any={},items=new Map<string,any>(),union=new Map<string,any>(),matrices:any[]=[];
 apps.forEach((a:any,i:number)=>{let mapped:any[]=[];a.repositories.forEach((repo:any,j:number)=>{const rs=rows.filter(r=>r.entity?.type==='Repository'&&norm(r.entity.details.url)===norm(repo.repositoryUrl)&&repo.branches.includes(r.entity.details.branchName));repo.countKey=`application-${i}-repo-${j}`;counts[repo.countKey]=count(rs);mapped.push(...rs);});
 const restricted=Array.isArray(config.repositorySelections?.[a.name])||(!Object.hasOwn(config.repositorySelections||{},a.name)&&!!config.repositoryFilters?.[a.name]);
 const rs=[...new Map((restricted?mapped:rows.filter(r=>r.applications.some((v:any)=>v.id===a.id))).map(r=>[r.id,r])).values()];counts[`application-${i}`]=count(rs);matrices.push(matrix(rs));
 for(const r of rs){union.set(r.id,r);if(!items.has(r.id)){const e=r.entity.details,n=age(r);items.set(r.id,{id:r.id,issueType:/agentic sast/i.test(r.ruleName||'')?'Agentic SAST':({'OSS':'SCA','OSS security':'SCA','SAST':'SAST','SAST findings':'SAST','Container security':'Container Security','OSS licenses':'License Compliance'} as any)[r.riskCategory]||r.riskCategory||'Unclassified',title:r.findingName||r.ruleName||'Security finding',severity:levels.indexOf(r.riskLevel),bucket:bucket(n),days:n,entity:e.name||e.url||r.entity.type,branch:e.branchName||'',url:r.apiiroRiskUrl||'',vulnerability:vuln(r),component:r.component||'',repositoryUrl:r.entity.type==='Repository'?e.url:'',apps:[]});}items.get(r.id).apps.push(i);}});
 counts.total=count([...union.values()]);const total=matrix([...union.values()]);for(const mode of ['risks','vulnerabilities'])if(total[mode].some((r:number[],i:number)=>r.reduce((a,b)=>a+b,0)!==counts.total[mode][i]))throw Error('Count reconciliation failed.');
 return {apps,counts,aging:{asOf:day(now),applications:matrices,total,items:[...items.values()]}};
}
export async function refreshHosted(){
 const bucket=env.BUCKET!;const previous=await bucket.get(lockKey);const state=previous?await previous.json<any>():null;
 if(state?.running&&Date.now()-Date.parse(state.startedAt)<15*60000)throw Error('A refresh is already running.');
 const startedAt=new Date().toISOString();const lock=await bucket.put(lockKey,JSON.stringify({running:true,startedAt}),{onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'}});if(!lock)throw Error('A refresh is already running.');
 try{
 const {config,etag}=await readConfig();const catalog=await pages('/rest-api/v1/applications');const now=new Date();const localDay=day(now);const weekday=new Date(localDay+'T12:00:00Z').getUTCDay();const monday=new Date(Date.parse(localDay+'T00:00:00Z')-((weekday+6)%7)*86400000).toISOString().slice(0,10);
 // Request a UTC range starting before Central midnight; filter by the Central calendar day below.
 const records:any[]=[];const resolved=new Map<string,any>();
 for(const name of config.applications){const found=catalog.filter(a=>a.name.toLowerCase()===name.toLowerCase());if(found.length!==1)throw Error('Application missing or ambiguous: '+name);const id=found[0].key;
 const rs=await pages('/rest-api/v1/risks',{'filters[ApplicationID]':id});if(rs.some(r=>!r.applications.some((a:any)=>a.id===id)))throw Error('Apiiro returned unrelated findings.');records.push(...rs);
 let next='',seen=new Set<string>();do{const params=new URLSearchParams({pageSize:'100','filters[ApplicationID]':id,'filters[Status]':'Closed'});params.append('filters[ResolvedOn]',monday+'T00:00:00Z');params.append('filters[ResolvedOn]',now.toISOString().replace(/\.\d{3}Z$/,'Z'));if(next)params.set('next',next);const p=await api('/rest-api/v1/risk-lifecycle',params);if(!Array.isArray(p.items))throw Error('Invalid lifecycle response.');for(const r of p.items){if(!r.applications.some((a:any)=>a.id===id))throw Error('Apiiro returned unrelated lifecycle findings.');if(r.closedReason==='Resolved'&&day(new Date(r.resolvedOn))>=monday&&Date.parse(r.resolvedOn)<=+now)resolved.set(r.id,{...r,riskStatus:'Open'});}next=p.next||'';if(next&&seen.has(next))throw Error('Repeated lifecycle page.');seen.add(next);}while(next);
 }
 const data:any=buildSnapshot(config,catalog,records,now);const closed=buildSnapshot(config,catalog,[...resolved.values()],now);data.resolved={asOf:now.toISOString(),from:monday,items:closed.aging.items.map(r=>({...r,days:null,resolvedOn:resolved.get(r.id).resolvedOn,closedReasonDetails:resolved.get(r.id).closedReasonDetails||'Resolved'}))};
 if((await readConfig()).etag!==etag)throw Error('Setup changed during refresh. Please retry.');
 const result={updatedAt:new Date().toISOString(),data,catalog:catalog.map(a=>({name:a.name,id:a.key,repositories:a.repositories}))};await bucket.put(snapshotKey,JSON.stringify(result),{httpMetadata:{contentType:'application/json'}});
 await bucket.put(lockKey,JSON.stringify({running:false,startedAt,completedAt:result.updatedAt}));return {updatedAt:result.updatedAt,applications:data.apps.length,findings:data.aging.items.length};
 }catch(e){await bucket.put(lockKey,JSON.stringify({running:false,startedAt,failedAt:new Date().toISOString()}));throw e;}
}
export async function refreshStatus(){const obj=await env.BUCKET!.get(lockKey);return obj?obj.json():{running:false};}
