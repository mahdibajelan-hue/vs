import assert from 'node:assert/strict'
import { buildAxes, analyseProfile, familySummaries, shortLabel } from './behaviorChart.ts'

const row = (key, fa, fam, score, o = {}) => ({ id: key, key, label: { en: key, fa, full: fa }, score, familyKey: fam, familyLabelFa: 'خانواده ' + fam, familyLabelEn: fam, tone: '#fff', minThreshold: null, preferredMin: null, preferredMax: null, isCritical: false, status: 'MEETS', coverageCount: 3, confidence: 'MEDIUM', ...o })
const rows = [row('A', 'دقت به جزئیات', 'x', 90), row('B', 'گرایش ایمنی', 'x', 82), row('C', 'کار تیمی', 'y', 30, { minThreshold: 50, isCritical: true, status: 'BELOW_MIN' }), row('D', 'پشتکار', 'y', 85, { confidence: 'LOW' }), row('E', 'ابتکار عمل', 'y', null, { status: 'NO_DATA' })]
const axes = buildAxes(rows)
assert.equal(axes.length, 5); assert.equal(shortLabel('دقت به جزئیات بالا'), 'دقت به')
const fams = familySummaries(axes); assert.equal(fams.find((f) => f.familyKey === 'x').average, 86); assert.equal(fams.find((f) => f.familyKey === 'y').below, 1)
const al = { rows: [], overallAlignmentPercent: 72, criticalGapCount: 1 }
let an = analyseProfile(axes, al, { validityFactor: 0.7, hasJobProfile: true })
assert.equal(an.headline, 'پروفایل رفتاری با کمبود در الزام حیاتی'); assert.ok(an.paragraphs[0].tone === 'bad' && an.paragraphs[0].text.includes('کار تیمی'))
assert.ok(an.paragraphs.some((p) => p.text.includes('ضریب')), 'validity correction is explained'); assert.ok(!an.paragraphs.some((p) => p.text.includes('پشتکار') && p.text.startsWith('قوی‌ترین')), 'a single-item dimension is not called a strength')
an = analyseProfile(buildAxes([row('A', 'الف', 'x', 92), row('B', 'ب', 'x', 88), row('C', 'ج', 'x', 90)]), { rows: [], overallAlignmentPercent: 90, criticalGapCount: 0 }, { hasJobProfile: true })
assert.ok(an.paragraphs.some((p) => p.text.includes('غیرعادی بالاست')), 'near-perfect profiles are called out')
an = analyseProfile(axes, al, { hasJobProfile: false }); assert.ok(an.paragraphs[0].text.includes('تعریف نشده'))
assert.equal(analyseProfile([], al, { hasJobProfile: true }).paragraphs.length, 0)
console.log('behavior chart ok')
