import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {projectDashboard} from '../lib/project-dashboard.ts';
const source=JSON.parse(readFileSync(new URL('../data/dashboard.html',import.meta.url),'utf8').match(/id="dashboard-data">([\s\S]*?)<\/script>/)[1]);
const config=JSON.parse(readFileSync(new URL('../data/default-config.json',import.meta.url)));
assert.deepEqual(projectDashboard(source,config).counts.total,source.counts.total);
const reduced=projectDashboard(source,{...config,applications:config.applications.filter(n=>n!=='RES Data Backbone')});
assert(!reduced.apps.some(a=>a.name==='RES Data Backbone'));
assert(reduced.aging.items.every(r=>r.apps.every(i=>reduced.apps[i])));
assert.equal(new Set(reduced.aging.items.map(r=>r.id)).size,reduced.aging.items.length);
for(const app of source.apps) for(const repo of app.repositories){
 const data=projectDashboard(source,{applications:[app.name],repositorySelections:{[app.name]:[repo.repositoryUrl]}});
 assert.deepEqual(data.counts.total,source.counts[repo.countKey]);
 assert.equal(data.apps[0].repositories.length,1);
 assert(data.aging.items.every(r=>r.apps.length===1&&r.apps[0]===0));
}
assert.deepEqual(projectDashboard(source,config).counts.total,source.counts.total);
assert.equal(projectDashboard(source,{applications:['Not fetched yet']}).aging.items.length,0);
console.log('Saved scope: baseline, app removal, every repo, shared deduplication, reselection, and missing snapshot passed.');
