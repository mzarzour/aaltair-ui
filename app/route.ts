import dashboard from '../data/dashboard.html?raw';
import catalog from '../data/application-catalog.json';
import {readConfig} from '../lib/refresh-config';
import {projectDashboard} from '../lib/project-dashboard';
export const dynamic = 'force-dynamic';
export async function GET() {
 try {
  const {config}=await readConfig();
  const pattern=/(<script type="application\/json" id="dashboard-data">)([\s\S]*?)(<\/script>)/;
  const source=JSON.parse(dashboard.match(pattern)![2]);
  const data=projectDashboard(source,config);
  const apps=data.apps.length, repos=new Set(data.apps.flatMap((a:any)=>a.repositories.map((r:any)=>r.repositoryUrl))).size;
  const relations=data.apps.reduce((n:number,a:any)=>n+a.repositories.length,0);
  let html=dashboard.replace(pattern,(_,start,end,close)=>start+JSON.stringify(data).replace(/</g,'\\u003c')+close);
  html=html.replace(/\b\d+ applications/g,`${apps} applications`).replace(/\b\d+ repositories/g,`${repos} repositories`).replace(/\b\d+ repos\b/g,`${repos} repos`).replace(/\b\d+ repository relationships/g,`${relations} repository relationships`);
  const pending=config.applications.some((name:string)=>{
   const snap=source.apps.find((a:any)=>a.name.toLowerCase()===name.toLowerCase());
   if(!snap)return true;
   const requested=config.repositorySelections?.[name];
   const urls=Array.isArray(requested)?requested:catalog.find(a=>a.name.toLowerCase()===name.toLowerCase())?.repositories.map(r=>r.repositoryUrl)||[];
   const token=!Object.hasOwn(config.repositorySelections||{},name)&&config.repositoryFilters?.[name];
   return urls.filter((url:string)=>!token||url.split('/').pop()!.toLowerCase().includes(token.toLowerCase())).some((url:string)=>!snap.repositories.some((r:any)=>r.repositoryUrl===url));
  });
  const notice=pending?'Saved selections are applied. Newly selected applications or repositories without snapshot data will appear after the next refresh.':'Home and Aging reflect your saved application and repository selections.';
  html=html.replace('<main id="home-page">',`<p class="small" role="status" style="margin:12px 24px" id="selection-status">${notice}</p><main id="home-page">`);
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 } catch {
  return new Response('Unable to load the saved application scope. Please reload shortly.',{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
