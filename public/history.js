(()=>{
const data=JSON.parse(document.getElementById('dashboard-data').textContent),history=data.history,ms=86400000;
const aliases={BranchProtection:'Branch protection',EntryPoints:'Entry point changes',Infrastructure:'Infrastructure changes',License:'License Compliance',PipelineMisconfigurations:'Pipeline misconfigurations',SensitiveData:'Sensitive data',ContainerSecurity:'Container Security'};if(history)history.items=history.items.map(r=>({...r,issueType:aliases[r.issueType]||r.issueType}));
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const svgNode=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const dateText=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(history?.asOf||Date.now()));
const end=Date.parse(dateText+'T00:00:00Z');
function startDate(months){const d=new Date(end),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return +d;}
function trackPoints(chart, plot, tooltip, points, series, x, y) {
  let active = -1;
  tooltip.hidden = true;
  chart.removeAttribute('aria-describedby');
  chart.onpointermove = chart.onpointerdown = chart.onfocus = chart.onkeydown = null;
  chart.onpointerleave = chart.onpointercancel = chart.onblur = null;
  chart.removeAttribute('tabindex');
  if (!points.length || !series.length) return;

  const guide = svgNode('g', {'aria-hidden':'true', 'pointer-events':'none', visibility:'hidden'});
  guide.append(svgNode('line', {x1:0, x2:0, y1:30, y2:y(0), class:'history-guide'}));
  const markers = series.map(s => svgNode('circle', {cx:0, r:5, fill:s.color, class:'history-marker'}));
  guide.append(...markers);
  chart.append(guide);
  chart.setAttribute('tabindex', '0');

  function hide() {
    active = -1;
    tooltip.hidden = true;
    guide.setAttribute('visibility', 'hidden');
    chart.removeAttribute('aria-describedby');
  }

  function show(index, anchorY) {
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    if (index !== active) {
      active = index;
      guide.setAttribute('transform', 'translate(' + x(index) + ' 0)');
      guide.setAttribute('visibility', 'visible');
      const date = new Date(points[index].to).toLocaleDateString('en-US', {timeZone:'UTC', month:'short', day:'numeric', year:'numeric'});
      const rows = node('div');
      rows.className = 'history-tooltip-rows';
      for (const [j, s] of series.entries()) {
        const value = s.values[index];
        markers[j].setAttribute('cy', y(value));
        const row = node('div');
        row.className = 'history-tooltip-row';
        row.style.setProperty('--series-color', s.color);
        row.append(node('span', s.name), node('strong', value.toLocaleString()));
        rows.append(row);
      }
      tooltip.replaceChildren(node('strong', date), rows);
      tooltip.hidden = false;
      chart.setAttribute('aria-describedby', tooltip.id);
    }
    const anchor = new DOMPoint(x(index), anchorY).matrixTransform(matrix);
    const bounds = plot.getBoundingClientRect();
    const px = anchor.x - bounds.left, py = anchor.y - bounds.top;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const left = px + 12 + width <= bounds.width ? px + 12 : px - 12 - width;
    tooltip.style.left = Math.max(0, Math.min(left, bounds.width - width)) + 'px';
    tooltip.style.top = Math.max(0, Math.min(py - 16, bounds.height - height)) + 'px';
  }

  function track(event) {
    const matrix = chart.getScreenCTM();
    if (!matrix) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (local.x < 54 || local.x > 936 || local.y < 29 || local.y > y(0) + 1) return hide();
    const index = Math.round((local.x - x(0)) / (x(1) - x(0)));
    show(Math.max(0, Math.min(points.length - 1, index)), local.y);
  }

  chart.onpointerdown = chart.onpointermove = track;
  chart.onpointerleave = event => { if (event.pointerType !== 'touch') hide(); };
  chart.onpointercancel = chart.onblur = hide;
  chart.onfocus = () => { if (active < 0 && chart.matches(':focus-visible')) show(0, y(series[0].values[0])); };
  chart.onkeydown = event => {
    if (event.key === 'Escape') return hide();
    const targets = {ArrowLeft:active - 1, ArrowRight:active + 1, Home:0, End:points.length - 1};
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    const index = Math.max(0, Math.min(points.length - 1, targets[event.key]));
    show(index, y(series[0].values[index]));
  };
}
for(const id of ['home-history','full-history']){
const root=document.getElementById(id);if(!root)continue;let months=1;const selected=new Set(['All']);let fixed=true;const severities=new Set([0,1]),severityNames=['Critical','High','Medium','Low'];
const top=node('div');top.className='history-top';const title=node('div');title.append(node('h2','Open & fixed issues'));const subtitle=node('div','Reconstructed open backlog · current saved scope');subtitle.className='small';title.append(subtitle);top.append(title);const ranges=node('div');ranges.className='history-ranges';const rangeOptions=[36,12,6,3,1];const rangeButtons=rangeOptions.map(n=>{const b=node('button',n>=12?n/12+' year'+(n===12?'':'s'):n+' month'+(n>1?'s':''));b.type='button';b.onclick=()=>{months=n;draw();};ranges.append(b);return b;});top.append(ranges);if(id==='home-history'){const link=node('a','View history ↗');link.href='#history';link.className='small';top.append(link);}root.append(top);
if(!history || history.version!==2){const empty=node('div','Historical data is being collected. The chart will appear after a successful refresh.');empty.className='history-empty';root.append(empty);continue;}
const types=[...new Set(history.items.map(r=>r.issueType||'Unclassified'))].sort();const preferred=['SCA','SAST','Agentic SAST'];types.sort((a,b)=>{const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b);});
const palette=['#62c7d3','#8e9cff','#f0ad78','#cc8de8','#e5c970','#75bdd7','#dc92a8','#72bf9f'];const seriesPalette=palette.map((fallback,index)=>
  `var(--chart-series-${index+1}, ${fallback})`
);
const fixedColor='var(--chart-fixed, #43bd8f)';
const colors=Object.fromEntries(['All',...types].map((t,i)=>[t,seriesPalette[i%seriesPalette.length]]));
const legend=node('div');legend.className='history-legend';const legendButtons=[];for(const type of ['All',...types,'Fixed']){const b=node('button');b.type='button';b.style.setProperty('--series-color',type==='Fixed'?fixedColor:colors[type]);b.append(node('i'),node('span',type));b.onclick=()=>{if(type==='Fixed')fixed=!fixed;else if(selected.has(type))selected.delete(type);else selected.add(type);draw();};legend.append(b);legendButtons.push([type,b]);}root.append(legend);
const severityRow=node('div');severityRow.className='history-legend history-severity';severityRow.setAttribute('role','group');severityRow.setAttribute('aria-label','Severity filters');severityRow.append(node('strong','Severity'));const severityButtons=[];for(const [i,label] of ['All severities',...severityNames].entries()){const b=node('button',label);b.type='button';b.style.setProperty('--series-color',i===0?'var(--brand)':['var(--chart-critical, #ed93ac)','var(--chart-high, #efac7c)','var(--chart-medium, #d5c66f)','var(--chart-low, #77c1dc)'][i-1]);b.onclick=()=>{if(i===0){severities.clear();[0,1,2,3].forEach(n=>severities.add(n));}else if(severities.has(i-1))severities.delete(i-1);else severities.add(i-1);draw();};severityRow.append(b);severityButtons.push(b);}root.append(severityRow);
const summary=node('p');summary.className='history-summary';root.append(summary);const chart=svgNode('svg',{viewBox:'0 0 960 250',role:'img','aria-label':'Historical open and fixed issues'});chart.classList.add('history-chart');const plot=node('div');plot.className='history-plot';
const tooltip=node('div');tooltip.className='history-tooltip';tooltip.hidden=true;
tooltip.id=id+'-tooltip';tooltip.setAttribute('role','tooltip');
chart.setAttribute('aria-label','Historical open and fixed issues. Use left and right arrow keys to explore dates.');
plot.append(chart,tooltip);root.append(plot);
const details=node('details');details.append(node('summary','View chart data'));const tableWrap=node('div');tableWrap.className='history-table';details.append(tableWrap);root.append(details);const note=node('p');note.className='history-note';root.append(note);
function draw(){severityButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0?severities.size===4:severities.has(i-1))));rangeButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(months===rangeOptions[i])));legendButtons.forEach(([t,b])=>b.setAttribute('aria-pressed',String(t==='Fixed'?fixed:selected.has(t))));
const start=Math.max(startDate(months),Date.parse(history.from+'T00:00:00Z')),step=months===1?ms:7*ms,points=[];for(let t=start;t<=end;){const d=new Date(t);const next=months>=12?Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1):t+step;points.push({t,to:Math.min(end,next-ms)});t=next;}
const chosen=[...selected],series=chosen.map(t=>({name:t,color:colors[t],values:points.map(()=>0)}));if(fixed)series.push({name:'Fixed',color:fixedColor,values:points.map(()=>0)});
const add=(s,date)=>{const t=Date.parse(date+'T00:00:00Z');if(Number.isFinite(t)&&t>=start&&t<=end){const i=points.findIndex(p=>t>=p.t&&t<=p.to);if(i>=0)s.values[i]++;}};
for(const r of history.items){if(!severities.has(r.severity))continue;for(const s of series){if(s.name==='Fixed'){if(selected.has('All')||selected.has(r.issueType)||selected.size===0)add(s,r.fixedDate);}else if(s.name==='All'||s.name===r.issueType){const discovered=Date.parse(r.discoveredDate+'T00:00:00Z'),closed=Date.parse(r.closedDate+'T00:00:00Z');points.forEach((p,i)=>{if(p.to===end?r.currentOpen:Number.isFinite(discovered)&&discovered<=p.to&&(!Number.isFinite(closed)||closed>p.to))s.values[i]++;});}}}
summary.textContent=(months>=12?'Monthly':months===1?'Daily':'Weekly')+' period-end open counts · '+new Date(start).toISOString().slice(0,10)+' – '+dateText+(fixed?' · '+(series.find(s=>s.name==='Fixed')?.values.reduce((a,b)=>a+b,0)||0).toLocaleString()+' fixed':'')+' · '+(severities.size===4?'All severities':severities.size?[...severities].sort().map(i=>severityNames[i]).join(' + '):'No severities selected');
chart.replaceChildren();const max=Math.max(1,...series.flatMap(s=>s.values)),ceiling=Math.ceil(max/5)*5;const x=i=>55+i*880/Math.max(1,points.length-1),y=v=>210-v/ceiling*180;
// Shade one open series so overlapping filters never imply a stacked total.
if (points.length > 1) {
  const open = series.find(s => s.name === 'All') || (selected.size === 1 ? series[0] : null);
  if (open) {
    const defs = svgNode('defs');
    const gradientId = id + '-backlog-gradient';
    const gradient = svgNode('linearGradient', {id:gradientId, x1:'0%', y1:'0%', x2:'0%', y2:'100%'});
    for (const [offset, opacity] of [['0%', .26], ['100%', 0]]) {
      gradient.append(svgNode('stop', {offset, 'stop-color':open.color, 'stop-opacity':opacity}));
    }
    defs.append(gradient);
    const line = open.values.map((v, i) => x(i) + ',' + y(v)).join(' ');
    chart.append(defs, svgNode('polygon', {
      class:'open-backlog-fill', points:x(0)+','+y(0)+' '+line+' '+x(points.length-1)+','+y(0),
      fill:'url(#'+gradientId+')', 'pointer-events':'none', 'aria-hidden':'true'
    }));
  }
}
for(let i=0;i<=4;i++){const v=ceiling*i/4,yy=y(v);chart.append(svgNode('line',{x1:55,x2:935,y1:yy,y2:yy,class:'grid'}));const t=svgNode('text',{x:45,y:yy+4,'text-anchor':'end'});t.textContent=Math.round(v).toLocaleString();chart.append(t);}
for(let i=0;i<points.length;i++){if(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0){const t=svgNode('text',{x:x(i),y:238,'text-anchor':i===0?'start':i===points.length-1?'end':'middle'});t.textContent=new Date(points[i].to).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});chart.append(t);}}
for(const s of series){chart.append(svgNode('polyline',{points:s.values.map((v,i)=>x(i)+','+y(v)).join(' '),fill:'none',stroke:s.color,'stroke-width':s.name==='Fixed'?3:2,'stroke-dasharray':s.name==='Fixed'?'6 4':'none','stroke-linejoin':'round'}));s.values.forEach((v,i)=>chart.append(svgNode('circle',{cx:x(i),cy:y(v),r:4,fill:s.color})));}
trackPoints(chart, plot, tooltip, points, series, x, y);
const table=node('table'),head=node('tr');head.append(node('th','Period ending'),...series.map(s=>node('th',s.name)));table.append(head);points.forEach((p,i)=>{const tr=node('tr');tr.append(node('th',new Date(p.to).toISOString().slice(0,10)),...series.map(s=>node('td',s.values[i].toLocaleString())));table.append(tr);});tableWrap.replaceChildren(table);
note.textContent='Severity filters apply to both open and fixed counts, using the severity in the latest retained record. All includes every issue type; type lines are subsets and should not be added to All. Fixed counts explicit Resolved closures for the selected types (all types when All is selected). Accepted and ignored issues are excluded. Open lines reconstruct the backlog at each period end; the latest point uses the current open inventory. Fixed shows resolutions during each day/week/month, not a cumulative total. Findings with unknown discovery dates are included only in the latest open total. Dates use America/Chicago. Latest period is partial. Based on Apiiro’s retained records and today’s scope; deleted records, severity changes and reopening cycles may be incomplete. Historical totals are estimates, not recorded daily snapshots. Updated '+new Date(history.asOf).toLocaleString('en-US',{timeZone:'America/Chicago'})+' Central.'+(start>startDate(months)?' Available retrieved history starts '+history.from+'; earlier dates are not shown.':'');
}draw();}
})();
