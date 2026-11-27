(()=>{
const d=JSON.parse(document.getElementById('dashboard-data').textContent),$=id=>document.getElementById(id),names=['Critical','High','Medium','Low'];
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n};
const day=86400000,snapshot=Date.parse(d.aging.asOf+'T00:00:00Z');
const todayText=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const today=Date.parse(todayText+'T00:00:00Z'),monday=today-((new Date(today).getUTCDay()+6)%7)*day;
const centralDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const resolved=(d.resolved?.items||[]).map(r=>({...r,discovery:Date.parse(centralDate(r.resolvedOn)+'T00:00:00Z')}));
const rows=d.aging.items.map(r=>({...r,discovery:Number.isFinite(r.days)?snapshot-r.days*day:null}));
const within=(r,start)=>r.discovery!==null&&r.discovery>=start&&r.discovery<=today;
const monthStart=Date.parse(todayText.slice(0,7)+'-01T00:00:00Z');
const fresh=rows.filter(r=>within(r,today)),weekly=rows.filter(r=>within(r,monday)),monthly=rows.filter(r=>within(r,monthStart));
$('brief-snapshot-dates').textContent='Open snapshot · '+d.aging.asOf+' · Resolutions checked '+(d.resolved?centralDate(d.resolved.asOf):'not yet')+' · Central time';
d.apps.forEach((a,i)=>{const o=el('option','',a.name);o.value=i;$('brief-app').append(o)});
function open(items,label,button){window.dispatchEvent(new CustomEvent('issue-type-findings',{detail:{rows:items,label,opener:button,scopeLabel:label.startsWith('Resolved')?'Resolved findings':undefined}}))}
names.forEach((label, severity) => {
  const items = rows.filter(row => row.severity === severity);
  const card = el('button', 'metric ' + label.toLowerCase());
  card.type = 'button';
  const heading = el('span', 'metric-head');
  heading.append(el('span', 'dot'), el('span', '', label));
  card.append(heading, el('span', 'metric-value', items.length.toLocaleString()), el('span', 'metric-bottom', 'Open security risks'));
  card.onclick = () => open(items, label + ' open security risks', card);
  $('brief-open-risks').append(card);
});
function metricCard(label){const card=el('article','metric');card.dataset.tone=label.startsWith('Critical')?'critical':label.startsWith('High')?'high':label.startsWith('Resolved')?'resolved':label==='New today'?'today':'week';return card;}
for(const [label,items,description] of [['New today',fresh,'Discovered '+todayText],['New this week',weekly,'Monday through today'],['Critical this week',weekly.filter(r=>r.severity===0),'New critical findings this week'],['High this week',weekly.filter(r=>r.severity===1),'New high findings this week']]){const card=metricCard(label);card.append(el('div','metric-head',label));const b=el('button','metric-value',items.length);b.onclick=()=>open(items,label,b);card.append(b,el('div','metric-bottom',description));$('brief-cards').append(card)}
for(const [label,items] of [['Resolved yesterday',resolved.filter(r=>within(r,today))],['Resolved this week',resolved.filter(r=>within(r,monday))]]){const card=metricCard(label);card.append(el('div','metric-head',label));const b=el('button','metric-value',items.length);b.onclick=()=>open(items,label,b);card.append(b,el('div','metric-bottom','Confirmed by Apiiro lifecycle'));$('brief-cards').append(card)}
for(const [label,severity] of [['Critical this month',0],['High this month',1]]){const items=monthly.filter(r=>r.severity===severity),card=metricCard(label);card.append(el('div','metric-head',label));const b=el('button','metric-value',items.length);b.type='button';b.onclick=()=>open(items,label,b);card.append(b,el('div','metric-bottom','Discovered this month · Central time'));$('brief-cards').append(card)}
let page=0;
function render(){const start=$('brief-period').value==='today'?today:monday,q=$('brief-search').value.trim().toLowerCase();const isResolved=$('brief-status').value==='resolved';$('brief-date-heading').textContent=isResolved?'Resolved':'Discovered';const filtered=(isResolved?resolved:rows).filter(r=>within(r,start)&&($('brief-app').value==='all'||r.apps.includes(Number($('brief-app').value)))&&($('brief-severity').value==='all'||r.severity===Number($('brief-severity').value))&&[r.title,r.component,r.entity,r.branch,r.issueType,...r.apps.map(i=>d.apps[i].name)].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.discovery-a.discovery||a.severity-b.severity||a.title.localeCompare(b.title));
$('brief-window').textContent=new Date(start).toISOString().slice(0,10)+' – '+todayText+' · America/Chicago';
for(const [id,groups] of [['brief-types',[...new Set(filtered.map(r=>r.issueType||'Unclassified'))].map(name=>({name,items:filtered.filter(r=>(r.issueType||'Unclassified')===name)}))],['brief-apps',d.apps.map((a,i)=>({name:a.name,items:filtered.filter(r=>r.apps.includes(i))})).filter(g=>g.items.length)]]){$(id).replaceChildren();groups.sort((a,b)=>b.items.length-a.items.length);for(const g of groups){const b=el('button');b.append(el('span','',g.name),el('strong','',g.items.length));b.onclick=()=>open(g.items,g.name+(isResolved?' · Resolved findings':' · New findings'),b);$(id).append(b)}if(!groups.length)$(id).append(el('p','small','No matching findings in this selection.'))}
const pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(page,pages-1);$('brief-items').replaceChildren();for(const r of filtered.slice(page*25,page*25+25)){const tr=el('tr'),detail=el('td');const a=el('a','finding-link',r.title);try{const u=new URL(r.url);if(u.protocol==='https:'&&u.hostname==='app.apiiro.com'){a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'}}catch{}detail.append(a,el('div','finding-description','Component: '+(r.component||'Not provided')));if(isResolved)detail.append(el('div','finding-description','Resolution reason: '+r.closedReasonDetails));const repo=el('td');repo.append(el('div','',r.entity),el('div','finding-description','Branch: '+(r.branch||'Not applicable')));tr.append(detail,el('td','',r.apps.map(i=>d.apps[i].name).join(', ')),repo,el('td','',r.issueType||'Unclassified'),el('td','finding-level '+names[r.severity].toLowerCase(),names[r.severity]),el('td','',new Date(r.discovery).toISOString().slice(0,10)));$('brief-items').append(tr)}if(!filtered.length){const td=el('td','brief-empty','No '+(isResolved?'resolved':'newly discovered open')+' findings match this period and filters.');td.colSpan=6;const tr=el('tr');tr.append(td);$('brief-items').append(tr)}$('brief-results').textContent=filtered.length.toLocaleString()+' matching findings · newest first';$('brief-page').textContent='Page '+(page+1)+' of '+pages;$('brief-prev').disabled=page===0;$('brief-next').disabled=page>=pages-1;
}
for(const id of ['brief-status','brief-period','brief-app','brief-severity','brief-search'])$(id).addEventListener(id==='brief-search'?'input':'change',()=>{page=0;render()});$('brief-prev').onclick=()=>{page--;render()};$('brief-next').onclick=()=>{page++;render()};render();
})();
