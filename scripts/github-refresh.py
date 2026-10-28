"""Run only on a GitHub-hosted runner. No snapshots or credentials are committed."""
from history import history
from datetime import datetime
from zoneinfo import ZoneInfo
import os,json,urllib.request,urllib.parse,tempfile,sys,importlib.util,re,time
from pathlib import Path
SITE='https://aaltair.prime-badge-2215.chatgpt.site'
def request(url,payload=None,token=None):
 headers={'Accept':'application/json'}
 if url.startswith(SITE+'/'):
  headers['X-Aaltair-Runner-Key']=token
  headers['OAI-Sites-Authorization']='Bearer '+os.environ['SITES_SERVICE_TOKEN']
 elif token:headers['Authorization']='Bearer '+token
 data=None if payload is None else json.dumps(payload).encode()
 if data is not None:headers['Content-Type']='application/json'
 # Never follow a redirect with an API or upload credential.
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 opener=urllib.request.build_opener(NoRedirect)
 with opener.open(urllib.request.Request(url,data=data,headers=headers),timeout=90) as r:return json.load(r)
def runner(payload):return request(SITE+'/api/refresh-runner',payload,os.environ['REFRESH_RUNNER_TOKEN'])
def main():
 claim=runner({'action':'claim'})
 if not claim.get('job'):
  print('No refresh due or already running.');return
 job=claim['job']
 try:
  spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('refresh-inventory.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  def api(path):return request('https://app.apiiro.com'+path,token=os.environ['APIIRO_API_TOKEN'])
  module.api=api
  with tempfile.TemporaryDirectory() as temp:
   config=Path(temp)/'config.json';config.write_text(json.dumps(claim['config']));out=Path(temp)/'dashboard.html'
   sys.argv=['refresh-inventory.py','--config',str(config),'--output',str(out)]
   module.main()
   data=json.loads(re.search(r'id="dashboard-data">(.*?)</script>',out.read_text(),re.S)[1])
   catalog=json.loads((module.ROOT/'data/application-catalog.json').read_text())
   current_catalog=module.paged('/rest-api/v1/applications')
   data['history']=history(module,claim['config'],current_catalog,datetime.now(ZoneInfo('America/Chicago')),data)
   result=runner({'action':'complete','job':job,'data':data,'catalog':catalog})
   print('Snapshot published:',result['updatedAt'],'findings:',result['findings'])
 except Exception as error:
  try:runner({'action':'complete','job':job,'error':True})
  except Exception:pass
  # Report status/type without response bodies, headers, tokens, or finding details.
  print('Refresh failed:',type(error).__name__,getattr(error,'code',''));raise SystemExit(1)
if __name__=='__main__':main()
