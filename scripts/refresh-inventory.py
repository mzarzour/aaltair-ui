"""Refresh Altair from its saved application scope; never publish on retrieval failure."""
import argparse,json,re,subprocess,urllib.request,urllib.parse,shutil
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
CONFIG_URL='https://aaltair.markzarzour.chatgpt.site/api/refresh-config'
LEVELS=['Critical','High','Medium','Low']
def live_config():
 return json.loads(subprocess.run(['curl','--fail','--silent','--show-error','--max-time','30',CONFIG_URL],capture_output=True,text=True,check=True).stdout)
def api(path):
 cli=shutil.which('apiiro') or str(Path.home()/'.local/bin/apiiro')
 r=subprocess.run([cli,'api',path],capture_output=True,text=True,check=True)
 return json.loads(r.stdout)
def paged(path,filters=None):
 def page(skip):return api(path+'?'+urllib.parse.urlencode({'pageSize':10,'skip':skip,**(filters or {})}))
 first=page(0);total=first['paging']['totalItemCount']
 with ThreadPoolExecutor(max_workers=4) as pool:pages=[first]+list(pool.map(page,range(10,total,10)))
 rows=[r for p in pages for r in p['items']]
 if len(rows)!=total:raise ValueError('Incomplete Apiiro response')
 return rows
def norm(url):return url.rstrip('/').removesuffix('.git').lower()
def issue_type(r):
 if 'agentic sast' in r.get('ruleName','').lower():return 'Agentic SAST'
 return {'OSS':'SCA','SAST':'SAST','OSS security':'SCA','SAST findings':'SAST','Container security':'Container Security','Secrets':'Secrets','OSS licenses':'License Compliance'}.get(r.get('riskCategory'),r.get('riskCategory') or 'Unclassified')
def build(config,catalog,risks,now):
 names=config.get('applications');assert isinstance(names,list) and names and all(isinstance(n,str) for n in names),'Invalid saved application scope'
 chosen=[]
 for name in names:
  matches=[a for a in catalog if a['name'].casefold()==name.casefold()]
  if len(matches)!=1:raise ValueError('Application missing or ambiguous in Apiiro: '+name)
  chosen.append(matches[0])
 assert len({a['key'] for a in chosen})==len(chosen),'Duplicate selected applications'
 apps=[]
 for a in sorted(chosen,key=lambda a:a['name'].casefold()):
  repos=a['repositories']
  selection=config.get('repositorySelections',{})
  if a['name'] in selection:
   urls=selection[a['name']]
   if urls is not None:
    assert isinstance(urls,list) and urls,'Empty repository selection for '+a['name']
    missing=set(urls)-{r['repositoryUrl'] for r in repos}
    if missing:raise ValueError('Selected repositories no longer assigned to '+a['name']+': '+', '.join(sorted(missing)))
    repos=[r for r in repos if r['repositoryUrl'] in urls]
  elif config.get('repositoryFilters',{}).get(a['name']):
   token=config['repositoryFilters'][a['name']].lower();repos=[r for r in repos if token in r['repositoryUrl'].rsplit('/',1)[-1].lower()]
  apps.append({'id':a['key'],'name':a['name'],'repositories':sorted(repos,key=lambda r:r['repositoryUrl'].lower())})
 rs=[r for r in {r['id']:r for r in risks}.values() if r['riskStatus']=='Open' and r['riskLevel'] in LEVELS]
 def vulnerability(r):return r.get('findingCategory')=='Vulnerability' or r.get('riskCategory') in ['Container security','ContainerSecurity']
 def payload(rows):
  rows=list({r['id']:r for r in rows}.values())
  return {mode:[sum(r['riskLevel']==level and (mode=='risks' or vulnerability(r)) for r in rows) for level in LEVELS] for mode in ['risks','vulnerabilities']}
 def age(r):
  try:
   n=(now.date()-datetime.fromisoformat(r['discoveredOn'].replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago')).date()).days
   return n if n>=0 else None
  except (ValueError,TypeError,KeyError):return None
 def bucket(days):return 4 if days is None else 0 if days<=30 else 1 if days<=60 else 2 if days<=90 else 3
 def matrix(rows):
  m={k:[[0]*5 for _ in LEVELS] for k in ['risks','vulnerabilities']}
  for r in {r['id']:r for r in rows}.values():
   i=LEVELS.index(r['riskLevel']);j=bucket(age(r));m['risks'][i][j]+=1
   if vulnerability(r):m['vulnerabilities'][i][j]+=1
  return m
 byrepo={}
 for r in rs:
  e=r['entity']['details']
  if r['entity']['type']=='Repository':byrepo.setdefault((norm(e['url']),e.get('branchName')),[]).append(r)
 counts={};union={};matrices=[];items={}
 for i,a in enumerate(apps):
  mapped=[]
  for j,repo in enumerate(a['repositories']):
   rows=[risk for branch in repo['branches'] for risk in byrepo.get((norm(repo['repositoryUrl']),branch),[])];mapped+=rows
   repo['countKey']=f'application-{i}-repo-{j}';counts[repo['countKey']]=payload(rows)
  restricted=(a['name'] in config.get('repositorySelections',{}) and config['repositorySelections'][a['name']] is not None) or (a['name'] not in config.get('repositorySelections',{}) and bool(config.get('repositoryFilters',{}).get(a['name'])))
  rows=mapped if restricted else [r for r in rs if a['id'] in {v['id'] for v in r['applications']}]
  counts[f'application-{i}']=payload(rows);matrices.append(matrix(rows))
  for r in {r['id']:r for r in rows}.values():
   union[r['id']]=r
   if r['id'] not in items:
    e=r['entity']['details'];days=age(r);items[r['id']]={'id':r['id'],'issueType':issue_type(r),'title':r.get('findingName') or r.get('ruleName') or 'Security finding','severity':LEVELS.index(r['riskLevel']),'bucket':bucket(days),'days':days,'entity':e.get('name') or e.get('url') or r['entity']['type'],'branch':e.get('branchName') or '', 'url':r.get('apiiroRiskUrl',''),'vulnerability':vulnerability(r),'component':r.get('component') or '', 'repositoryUrl':e.get('url','') if r['entity']['type']=='Repository' else '', 'apps':[]}
   items[r['id']]['apps'].append(i)
 counts['total']=payload(union.values());total=matrix(union.values())
 for idx,m in [(None,total)]+list(enumerate(matrices)):
  for mode in m:assert [sum(v) for v in m[mode]]==counts['total' if idx is None else f'application-{idx}'][mode]
 return {'apps':apps,'counts':counts,'aging':{'asOf':now.date().isoformat(),'applications':matrices,'total':total,'items':list(items.values())}}
def resolved_snapshot(config,catalog,now):
 start=(now-timedelta(days=now.weekday())).replace(hour=0,minute=0,second=0,microsecond=0)
 records={}
 for name in config['applications']:
  app=next(a for a in catalog if a['name'].casefold()==name.casefold())
  params=[('pageSize',10),('filters[ApplicationID]',app['key']),('filters[Status]','Closed'),('filters[ResolvedOn]',start.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ')),('filters[ResolvedOn]',now.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ'))]
  token=None;seen=set()
  while True:
   response=api('/rest-api/v1/risk-lifecycle?'+urllib.parse.urlencode(params+([('next',token)] if token else [])))
   for r in response['items']:
    if app['key'] not in {a['id'] for a in r.get('applications',[])}:raise ValueError('Lifecycle returned unrelated application')
    if r.get('closedReason')!='Resolved':continue
    resolved=datetime.fromisoformat(r['resolvedOn'].replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago'))
    if not start<=resolved<=now:raise ValueError('Lifecycle resolution date outside requested range')
    records[r['id']]={**r,'riskStatus':'Open'}
   token=response.get('next')
   if not token:break
   if token in seen:raise ValueError('Repeated lifecycle page token')
   seen.add(token)
 data=build(config,catalog,list(records.values()),now)
 for item in data['aging']['items']:
  raw=records[item['id']];item['resolvedOn']=raw['resolvedOn'];item['closedReasonDetails']=raw.get('closedReasonDetails') or 'Resolved';item['days']=None
 return {'asOf':now.isoformat(),'from':start.isoformat(),'items':data['aging']['items']}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--fixtures',type=Path);parser.add_argument('--config',type=Path);parser.add_argument('--output',type=Path,default=ROOT/'data/dashboard.html');args=parser.parse_args()
 config=json.loads(args.config.read_text()) if args.config else live_config()
 if args.fixtures:
  raw=json.loads((args.fixtures/'applications-refresh.json').read_text());catalog=raw['items'];risks=json.loads((args.fixtures/'all-risks.json').read_text())
 else:
  catalog=paged('/rest-api/v1/applications');risks=[]
  for name in config['applications']:
   matches=[a for a in catalog if a['name'].casefold()==name.casefold()]
   if len(matches)!=1:raise ValueError('Application missing or ambiguous: '+name)
   aid=matches[0]['key'];rows=paged('/rest-api/v1/risks',{'filters[ApplicationID]':aid})
   if any(aid not in {a['id'] for a in r['applications']} for r in rows):raise ValueError('Apiiro application filter returned unrelated findings')
   risks+=rows
 now=datetime.now(ZoneInfo('America/Chicago'));data=build(config,catalog,risks,now)
 if not args.fixtures:data['resolved']=resolved_snapshot(config,catalog,now)
 if not args.fixtures:
  latest=live_config()
  if latest!=config:raise ValueError('Setup changed during retrieval; retry with the new scope')
 source=(ROOT/'data/dashboard.html').read_text();m=re.search(r'(<script type="application/json" id="dashboard-data">)(.*?)(</script>)',source,re.S);assert m
 source=source[:m.start(2)]+json.dumps(data).replace('<','\\u003c')+source[m.end(2):]
 n=len(data['apps']);repos=len({r['repositoryUrl'] for a in data['apps'] for r in a['repositories']});relations=sum(len(a['repositories']) for a in data['apps'])
 source=re.sub(r'\b\d+ applications',f'{n} applications',source);source=re.sub(r'\b\d+ repositories',f'{repos} repositories',source);source=re.sub(r'\b\d+ repos\b',f'{repos} repos',source);source=re.sub(r'\b\d+ repository relationships',f'{relations} repository relationships',source)
 source=re.sub(r'Updated · [^<]*','Updated · '+now.strftime('%B %d, %Y · %I:%M %p %Z'),source,count=1);source=re.sub(r'As of [A-Za-z]+ \d+, \d{4}','As of '+now.strftime('%B %d, %Y'),source,count=1)
 source=source.replace('Operational Queues is excluded; RES Data Backbone includes only the selected ttw repositories.','Application and repository scope follows Setup. Explicit repository selections include only their monitored branches.')
 args.output.write_text(source)
 if not args.fixtures:(ROOT/'data/application-catalog.json').write_text(json.dumps([{'name':a['name'],'id':a['key'],'repositories':[{'repositoryUrl':url,'branches':sorted({b for r in a['repositories'] if r['repositoryUrl']==url for b in r['branches']})} for url in sorted({r['repositoryUrl'] for r in a['repositories']})]} for a in catalog],indent=2))
 print(json.dumps({'applications':n,'uniqueRepositories':repos,'findings':len(data['aging']['items']),'scope':config['applications']}))
if __name__=='__main__':main()
