"""Older lifecycle records may omit the optional findingCategory field."""
import importlib.util
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('inventory',root/'scripts/refresh-inventory.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
config={'applications':['Example']}
catalog=[{'key':'app','name':'Example','repositories':[]}]
base={'riskStatus':'Open','riskLevel':'High','applications':[{'id':'app'}],'entity':{'type':'Application','details':{'name':'Example'}},'discoveredOn':'2024-01-01T00:00:00Z'}
rows=[dict(base,id='missing',riskCategory='General'),dict(base,id='null',findingCategory=None,riskCategory='General'),dict(base,id='vuln',findingCategory='Vulnerability',riskCategory='OSS'),dict(base,id='container',riskCategory='ContainerSecurity')]
data=m.build(config,catalog,rows,datetime(2026,10,28,tzinfo=ZoneInfo('America/Chicago')))
assert data['counts']['total']['risks']==[0,4,0,0]
assert data['counts']['total']['vulnerabilities']==[0,2,0,0]
assert len(data['aging']['items'])==4
print('Optional lifecycle categories: missing/null retained; vulnerability and container counts preserved.')
