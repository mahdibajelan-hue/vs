import assert from 'node:assert/strict'
import * as c from './cpm.ts'
import * as s from './strategy.ts'
import * as t from './planTree.ts'

// CPM: FS chain
let r = c.runCpm([{id:'a',duration:10},{id:'b',duration:5}], [{from:'a',to:'b',type:'FS',lag:0}])
assert.equal(r.finish, 15); assert.equal(r.tasks.get('b').es, 10); assert.ok(r.tasks.get('a').critical)
// SS+lag
r = c.runCpm([{id:'a',duration:10},{id:'b',duration:5}], [{from:'a',to:'b',type:'SS',lag:3}])
assert.equal(r.tasks.get('b').es, 3); assert.equal(r.finish, 10); assert.equal(r.tasks.get('b').float, 2)
// FF: b finishes 2 after a finishes -> es = 10+2-5 = 7
r = c.runCpm([{id:'a',duration:10},{id:'b',duration:5}], [{from:'a',to:'b',type:'FF',lag:2}])
assert.equal(r.tasks.get('b').es, 7)
// SF: b finish >= a start + 4 -> es = max(0, 0+4-5) = 0
r = c.runCpm([{id:'a',duration:10},{id:'b',duration:5}], [{from:'a',to:'b',type:'SF',lag:4}])
assert.equal(r.tasks.get('b').es, 0)
// lead (negative lag) FS
r = c.runCpm([{id:'a',duration:10},{id:'b',duration:5}], [{from:'a',to:'b',type:'FS',lag:-4}])
assert.equal(r.tasks.get('b').es, 6)
// cycle
r = c.runCpm([{id:'a',duration:1},{id:'b',duration:1}], [{from:'a',to:'b',type:'FS',lag:0},{from:'b',to:'a',type:'FS',lag:0}])
assert.ok(r.cycle)
// float on parallel branch
r = c.runCpm([{id:'a',duration:10},{id:'b',duration:3},{id:'c',duration:5}], [{from:'a',to:'c',type:'FS',lag:0},{from:'b',to:'c',type:'FS',lag:0}])
assert.equal(r.tasks.get('b').float, 7); assert.ok(!r.tasks.get('b').critical)

// strategies: durations preserved, overlap shortens total
const total = s.STANDARD_DAYS.reduce((a,b)=>a+b,0)
assert.equal(total, 1380)
const seq = s.computeMasterSchedule('sequential','2026-01-01')
assert.equal(seq.totalDays, 1380)
for (const k of ['overlapping','fast_track','emergency']) {
  const m = s.computeMasterSchedule(k,'2026-01-01')
  assert.ok(m.ok); m.gates.forEach((g,i)=>assert.equal(g.days, s.STANDARD_DAYS[i]))
}
const ov = s.computeMasterSchedule('overlapping','2026-01-01')
assert.ok(ov.totalDays < seq.totalDays)
assert.equal(ov.gates[4].es, ov.gates[3].es + 90)
const ft = s.computeMasterSchedule('fast_track','2026-01-01'), em = s.computeMasterSchedule('emergency','2026-01-01')
assert.ok(em.totalDays <= ft.totalDays && ft.totalDays <= ov.totalDays, `${em.totalDays} ${ft.totalDays} ${ov.totalDays}`)
assert.equal(seq.gates[0].start, '2026-01-01')
// governance + versions
assert.ok(s.canTransition('draft','proposed')); assert.ok(!s.canTransition('draft','approved'))
assert.ok(s.canTransition('in_execution','revised')); assert.ok(!s.canTransition('completed','draft'))
assert.equal(s.nextVersionLabel([],'minor'),'V1.0'); assert.equal(s.nextVersionLabel(['V1.0'],'minor'),'V1.1')
assert.equal(s.nextVersionLabel(['V1.0','V1.1'],'major'),'V2.0')

// plan tree
const N = (id,p,w,m,st,fi)=>({id,parentId:p,name:id,weight:w,manualPct:m,start:st,finish:fi})
let nodes = [N('root',null,100,0,'2026-01-01','2026-04-01'), N('a','root',60,100,'2026-01-01','2026-02-01'), N('b','root',40,50,'2026-02-01','2026-03-15')]
const p = t.rollupProgress(nodes)
assert.equal(p.get('root'), 80); assert.equal(p.get('b'), 50)
assert.equal(t.validateWeights(nodes).length, 0)
assert.equal(t.validateWeights([N('x',null,50,0),N('y',null,40,0)]).length, 1)
const fit = t.autoFitWeights([N('x',null,50,0),N('y',null,40,0),N('z',null,10,0)])
assert.equal(fit.reduce((a,n)=>a+n.weight,0), 100)
assert.equal(t.autoFitWeights([N('x',null,0,0),N('y',null,0,0),N('z',null,0,0)]).reduce((a,n)=>a+n.weight,0), 100)
// coverage + autofit
assert.ok(t.coverageIssues(nodes).some(i=>i.gap==='after'))
const fitted = t.autoFitDates(nodes,'root')
assert.equal(fitted.find(n=>n.id==='a').start,'2026-01-01'); assert.equal(fitted.find(n=>n.id==='b').finish,'2026-04-01')
assert.equal(t.coverageIssues(fitted).length, 0)
// baseline immutable
const bl = t.makeBaseline('b1','V1','2026-01-01',nodes)
assert.throws(()=>{ 'use strict'; bl.rows[0].finish='x' })
assert.equal(t.baselineVariance([{...nodes[2], finish:'2026-03-25'}], bl).get('b'), 10)
// template round trip
const tpl = t.toTemplate(nodes); let n=0; const ids=new Map()
const inst = t.fromRow ?? null
const made = t.fromTemplate(tpl,'2027-05-01',k=>{ if(!ids.has(k)) ids.set(k,'n'+(++n)); return ids.get(k)})
assert.equal(made.find(x=>x.name==='a').start,'2027-05-01'); assert.equal(made.find(x=>x.name==='root').parentId,null)
assert.equal(made.find(x=>x.name==='a').parentId, ids.get('root'))
// dependency violations
assert.equal(t.dependencyViolations(nodes,[{from:'a',to:'b',type:'FS',lag:0}]).length,0)
assert.equal(t.dependencyViolations(nodes,[{from:'a',to:'b',type:'FS',lag:10}])[0].shortBy,10)
console.log('plan ok')
