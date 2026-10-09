import assert from 'node:assert/strict'
import * as ai from './riskAi.ts'
import * as st from './riskState.ts'
import * as imp from './riskImport.ts'
import { DEFAULT_POLICY as P } from './riskPolicy.ts'

let n = 0
const risk = (o = {}) => ({ id: 'r' + ++n, projectId: 'P1', code: 'R-00' + n, title: 'تأخیر تأمین لوله', description: '', category: 'procurement', riskType: 'threat', ownerId: 'u1', identifiedDate: '2026-03-01', status: 'open', responseStrategy: 'mitigate', strategyDetails: {}, projectPhase: null, timeToImpactDays: null, initialProbability: 4, initialImpact: 4, initialScore: 16, escalationStatus: 'none', cause: '', riskEvent: '', consequence: '', reviewIntervalDays: null, nextReviewDate: null, reviewRequestedAt: null, closedAt: null, subcategory: null, ...o })
const TODAY = '2026-05-01'

// ---- extraction from minutes / visit text
const text = 'در بازدید مشخص شد که ممکن است تحویل لولهٔ ۵۶ اینچ به دلیل ظرفیت کارخانه ۴۵ روز تأخیر داشته باشد.\nحضار: آقای الف و ب.\nمعارض در کیلومتر ۱۲ مانع شروع جوشکاری شده و احتمال توقف جبهه کاری وجود دارد.\nجلسه ساعت ۱۰ پایان یافت'
const c = ai.extractRiskCandidates(text)
assert.equal(c.length, 2, 'attendance and closing lines are not risks')
assert.ok(c.every((x) => x.reasons.length && x.confidence > 0 && x.confidence <= 0.85 && x.probability >= 1 && x.impact >= 1))
assert.equal(c.find((x) => x.riskEvent.includes('لوله')).category, 'procurement')
assert.ok(c.find((x) => x.riskEvent.includes('معارض')).impact >= 4, 'توقف → higher impact')
assert.ok(c[0].reasons.join(' ').includes('حدسی'))
assert.equal(ai.extractRiskCandidates('جلسه برگزار شد و همه حاضر بودند').length, 0)
assert.equal(ai.extractRiskCandidates(text, ['other']).every((x) => x.category === 'other'), true, 'unknown categories fall back to other')

// ---- question answering
const a = risk({ title: 'تأخیر تأمین لوله', ownerId: null }), b = risk({ title: 'نشت گاز', category: 'hse' }), cr = risk({ title: 'معارض مسیر', category: 'land', initialScore: 6, initialProbability: 2, initialImpact: 3 })
const risks = [a, b, cr]
const states = st.computeStates(risks, [], [], [], [], () => P, TODAY)
const ctx = { risks, states, categories: [{ key: 'hse', labelFa: 'HSE و محیط زیست' }, { key: 'land', labelFa: 'تملک، معارضین و آزادسازی مسیر' }], projects: [{ id: 'P1', name: 'احداث خط لوله ۵۶ اینچ' }], userIdByName: () => null }
let r = ai.answerRiskQuestion('ریسک‌های بحرانی بدون مالک', ctx)
assert.deepEqual(r.ids, [a.id]); assert.ok(r.understood); assert.ok(r.explanation.includes('سطح بحرانی') && r.explanation.includes('بدون مالک'))
r = ai.answerRiskQuestion('ریسک‌های بحرانی', ctx); assert.equal(r.ids.length, 2)
r = ai.answerRiskQuestion('ریسک‌های HSE', ctx); assert.deepEqual(r.ids, [b.id])
r = ai.answerRiskQuestion('نشت', ctx); assert.deepEqual(r.ids, [b.id]); assert.equal(r.understood, false)
r = ai.answerRiskQuestion('بازنگری معوق', ctx); assert.ok(r.ids.length >= 1)

// ---- summary: facts only + limitations
const s = ai.summarizeStatus(risks, states, [], 'پروژهٔ نمونه')
assert.ok(s.lines[0].includes('3 ریسک فعال') || s.lines[0].includes('۳') || s.lines[0].includes('3')); assert.equal(s.confidence, 'low')
assert.ok(s.limitations.some((x) => x.includes('کم است')))

// ---- mitigation proposals come only from effective actions of similar risks
{
  const tgt = risk({ title: 'تأخیر تأمین لوله ۵۶ اینچ از کارخانه' })
  const old = risk({ title: 'تأخیر تأمین لوله ۵۶ اینچ از کارخانه داخلی', status: 'closed', closedAt: '2026-03-01T00:00:00Z' })
  const unrelated = risk({ title: 'نشت گاز در ایستگاه' })
  const done = { id: 'x1', riskId: old.id, description: 'بازرسی و ممیزی هفتگی کارخانه', status: 'completed', effectStatus: 'effective', completedAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', ownerId: null, dueDate: null }
  const noEffect = { ...done, id: 'x2', riskId: unrelated.id, description: 'اقدام بی‌ربط', effectStatus: 'ineffective' }
  const p = ai.proposeMitigations(tgt, [tgt, old, unrelated], [], [done, noEffect])
  assert.equal(p.items.length, 1); assert.equal(p.items[0].fromRiskCode, old.code); assert.ok(p.items[0].evidence.includes('تأییدشده')); assert.ok(p.basis.includes('مشابه'))
  assert.equal(ai.proposeMitigations(tgt, [tgt, unrelated], [], [noEffect]).items.length, 0)
}

// ---- realization signal is transparent and low-confidence on thin history
{
  const rk = risk({ timeToImpactDays: 10 })
  const sta = st.computeRiskState(rk, [], [], [], [], P, TODAY)
  const sig = ai.realizationSignal(rk, sta, 1, 0)
  assert.equal(sig.level, 'high'); assert.ok(sig.factors.length >= 3); assert.equal(sig.confidence, 'low'); assert.ok(sig.note.includes('نشانهٔ هشدار'))
  assert.equal(ai.realizationSignal(risk({ initialScore: 4, initialProbability: 2, initialImpact: 2 }), st.computeRiskState(risk({ initialScore: 4 }), [], [], [], [], P, TODAY), 0, 0).level, 'low')
}

// ---- CSV import validates every row
{
  const cats = [{ key: 'procurement', labelFa: 'تأمین کالا و تجهیزات' }, { key: 'hse', labelFa: 'HSE و محیط زیست' }]
  const csv = 'عنوان,دسته,احتمال,اثر,مالک (ایمیل),از کیلومتر,تا کیلومتر\n"تأخیر لوله, ۵۶ اینچ",تأمین کالا و تجهیزات,۴,4,a@x.ir,10,20\nکم,hse,3,3,,,\nنشت گاز در ایستگاه,نامعلوم,3,3,,,\nنشت گاز در ایستگاه,hse,9,3,,,\nنشت گاز در ایستگاه,hse,3,3,ghost@x.ir,,\nنشت گاز در ایستگاه,hse,3,3,,30,10\n'
  const res = imp.parseRiskImport(csv, { categories: cats, emailToUser: (e) => (e === 'a@x.ir' ? 'u9' : null), today: TODAY })
  assert.equal(res.drafts.length, 1); assert.equal(res.drafts[0].draft.ownerId, 'u9'); assert.equal(res.drafts[0].draft.title, 'تأخیر لوله, ۵۶ اینچ'); assert.equal(res.drafts[0].draft.probability, 4); assert.equal(res.drafts[0].draft.kmFrom, 10)
  assert.equal(res.errors.length, 5); assert.ok(res.errors.some((e) => e.message.includes('دستهٔ «نامعلوم»'))); assert.ok(res.errors.some((e) => e.message.includes('احتمال'))); assert.ok(res.errors.some((e) => e.message.includes('ghost@x.ir'))); assert.ok(res.errors.some((e) => e.message.includes('کیلومتر')))
  assert.ok(imp.parseRiskImport('عنوان,دسته\nx,y', { categories: cats, emailToUser: () => null }).errors[0].message.includes('ستون‌های الزامی'))
  assert.equal(imp.parseCsv('a;b\n1;2').length, 2)
  assert.ok(imp.toCsv([['a,b', 'c"d']]).includes('"a,b","c""d"'))
}
console.log('risk ai/import ok')
