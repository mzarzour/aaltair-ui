"""Six calendar months of discovery and confirmed resolution activity, in current scope."""
from datetime import datetime,timezone
from calendar import monthrange
from zoneinfo import ZoneInfo
from urllib.parse import urlencode

def history(module,config,catalog,now):
 month_index=now.year*12+now.month-1-6
 year,month=divmod(month_index,12);month+=1
 start=now.replace(year=year,month=month,day=min(now.day,monthrange(year,month)[1]),hour=0,minute=0,second=0,microsecond=0)
 records={}
 for name in config['applications']:
  app=next(a for a in catalog if a['name'].casefold()==name.casefold())
  for field in ['DiscoveredOn','ResolvedOn']:
   params=[('pageSize',100),('filters[ApplicationID]',app['key']),(f'filters[{field}]',start.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')),(f'filters[{field}]',now.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))]
   token=None;seen=set()
   while True:
    response=module.api('/rest-api/v1/risk-lifecycle?'+urlencode(params+([('next',token)] if token else [])))
    if not isinstance(response.get('items'),list):raise ValueError('Invalid history page')
    for r in response['items']:
     if app['key'] not in {a['id'] for a in r.get('applications',[])}:raise ValueError('Unrelated historical application')
     records[r['id']]={**r,'riskStatus':'Open'}
    token=response.get('next')
    if not token:break
    if token in seen:raise ValueError('Repeated history token')
    seen.add(token)
 data=module.build(config,catalog,list(records.values()),now)
 def date(value):
  try:return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago')).date().isoformat()
  except (ValueError,AttributeError):return None
 items=[]
 for item in data['aging']['items']:
  raw=records[item['id']]
  # Use only explicit Resolved closure reasons; accepted/ignored are not fixes.
  items.append({k:item[k] for k in ['id','issueType','severity','apps','repositoryUrl','branch','vulnerability']} | {'discoveredDate':date(raw.get('discoveredOn')),'fixedDate':date(raw.get('resolvedOn')) if raw.get('closedReason')=='Resolved' else None})
 return {'from':start.date().isoformat(),'asOf':now.isoformat(),'items':items,'basis':'Apiiro retained lifecycle dates, projected onto current application and repository scope. Reopening cycles and deleted records may not be recoverable.'}
