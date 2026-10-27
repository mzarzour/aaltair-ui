// Project the retained snapshot without destroying data needed by later reselections.
export function projectDashboard(source: any, config: any) {
 const selected = new Set(config.applications.map((n:string)=>n.toLowerCase()));
 const selections = config.repositorySelections || {};
 const norm = (url:string)=>url.replace(/\/$/,'').replace(/\.git$/,'').toLowerCase();
 const entries = source.apps.map((app:any, oldIndex:number)=>({app,oldIndex})).filter(({app}:any)=>selected.has(app.name.toLowerCase())).map(({app,oldIndex}:any)=>{
  const explicit = Object.hasOwn(selections,app.name);
  const urls = explicit ? selections[app.name] : null;
  const token = !explicit && config.repositoryFilters?.[app.name];
  const restricted = Array.isArray(urls) || !!token;
  const repositories = app.repositories.filter((r:any)=>Array.isArray(urls)?urls.includes(r.repositoryUrl):token?r.repositoryUrl.split('/').pop().toLowerCase().includes(token.toLowerCase()):true);
  return {app:{...app,repositories},oldIndex,restricted};
 });
 const items = source.aging.items.flatMap((item:any)=>{
  const apps:number[]=[];
  entries.forEach((entry:any,index:number)=>{
   if(!item.apps.includes(entry.oldIndex))return;
   if(entry.restricted && !entry.app.repositories.some((r:any)=>item.repositoryUrl && norm(r.repositoryUrl)===norm(item.repositoryUrl) && r.branches.includes(item.branch)))return;
   apps.push(index);
  });
  return apps.length?[{...item,apps}]:[];
 });
 const payload=(rows:any[])=>({risks:[0,1,2,3].map(s=>rows.filter(r=>r.severity===s).length),vulnerabilities:[0,1,2,3].map(s=>rows.filter(r=>r.severity===s&&r.vulnerability).length)});
 const counts:any={total:payload(items)};
 entries.forEach((entry:any,i:number)=>{
  counts[`application-${i}`]=payload(items.filter((r:any)=>r.apps.includes(i)));
  entry.app.repositories=entry.app.repositories.map((repo:any,j:number)=>{
   const countKey=`application-${i}-repo-${j}`;
   counts[countKey]=source.counts[repo.countKey];
   return {...repo,countKey};
  });
 });
 const resolved=source.resolved?{...source.resolved,items:projectDashboard({...source,resolved:undefined,aging:{...source.aging,items:source.resolved.items}},config).aging.items}:undefined;
 return {...source,resolved,apps:entries.map((e:any)=>e.app),counts,aging:{...source.aging,items}};
}
