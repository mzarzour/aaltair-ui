import json,re
from pathlib import Path
from datetime import datetime,date
from zoneinfo import ZoneInfo
import sys
p=Path(__file__).resolve().parents[1]/'data/dashboard.html';s=p.read_text();m=re.search(r'<script type="application/json" id="dashboard-data">(.*?)</script>',s,re.S);d=json.loads(m[1]);rs=json.load(open(sys.argv[1]));levels=['Critical','High','Medium','Low'];asof=date.fromisoformat(d['aging']['asOf']);items={}
for i,a in enumerate(d['apps']):
 allowed={(r['repositoryUrl'].lower(),b) for r in a['repositories'] for b in r['branches']}
 for r in rs:
  if r['riskStatus']!='Open' or r['riskLevel'] not in levels:continue
  if a['name']=='RES Data Backbone':match=r['entity']['type']=='Repository' and (r['entity']['details'].get('url','').lower(),r['entity']['details'].get('branchName')) in allowed
  else:match=a['id'] in {v['id'] for v in r['applications']}
  if not match:continue
  if r['id'] not in items:
   try:
    days=(asof-datetime.fromisoformat(r['discoveredOn'].replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago')).date()).days
    if days<0:days=None
   except (ValueError,TypeError,KeyError):days=None
   bucket=4 if days is None else 0 if days<=30 else 1 if days<=60 else 2 if days<=90 else 3
   e=r['entity']['details'];items[r['id']]={'id':r['id'],'title':r.get('findingName') or r.get('ruleName') or 'Security finding','severity':levels.index(r['riskLevel']),'bucket':bucket,'days':days,'entity':e.get('name') or e.get('url') or r['entity']['type'],'branch':e.get('branchName') or '', 'url':r.get('apiiroRiskUrl',''),'vulnerability':r['findingCategory']=='Vulnerability' or r['riskCategory']=='Container security','component':r.get('component') or '', 'apps':[]}
  items[r['id']]['apps'].append(i)
d['aging']['items']=list(items.values())
for mode in ['risks','vulnerabilities']:
 for idx,mat in [(None,d['aging']['total'][mode])]+[(i,a[mode]) for i,a in enumerate(d['aging']['applications'])]:
  for sev in range(4):
   for bucket in range(5):
    n=sum(x['severity']==sev and x['bucket']==bucket and (idx is None or idx in x['apps']) and (mode=='risks' or x['vulnerability']) for x in items.values())
    assert n==mat[sev][bucket],(mode,idx,sev,bucket,n)
s=s[:m.start(1)]+json.dumps(d).replace('<','\\u003c')+s[m.end(1):]
p.write_text(s)
print('Finding details reconciled with every aging cell')
