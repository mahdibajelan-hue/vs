import { buildEvidenceReport } from './evidenceReport.ts'

// shared fixture of the reporting analytics tests (not a test itself)
export const today = '2026-10-28'
export const curve = [
  { date: '2026-05-31', planned: 20, earned: 18 }, { date: '2026-06-30', planned: 30, earned: 24 }, { date: '2026-07-31', planned: 40, earned: 28 },
  { date: '2026-08-31', planned: 50, earned: 32 }, { date: '2026-09-30', planned: 60, earned: 36 }, { date: '2026-10-27', planned: 70, earned: 40 },
]
export const input = (o = {}) => ({
  today, project: 'P',
  metrics: { asOf: '2026-10-27', lifecycle: { actual: 30, planned: 42 }, evm: { bac: 1000, spi: 0.8, cpi: 0.85, eac: 1176, vac: -176 }, curve, planFinish: '2027-06-01', health: { status: 'black', drivenBy: 'زمان', blockers: ['G5: مجوز زیست‌محیطی'], dims: [] }, delays: [] },
  risks: [{ id: 'r1', title: 'تأخیر تحویل لوله', status: 'open', score: 20, level: 'critical', owner: null, identifiedDate: '2026-03-01', assessments: [{ date: '2026-08-01', score: 16 }, { date: '2026-10-01', score: 20 }] }],
  riskActions: [], issues: [], actions: [{ id: 'x1', title: 'پیگیری تأمین لوله', status: 'in_progress', priority: 'high', dueDate: '2026-11-10', owner: null, relatedRiskId: null, relatedIssueId: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' }],
  decisions: [{ id: 'd1', title: 'تأیید پیمانکار جایگزین', status: 'in_review', requiredBy: '2026-10-15', owner: 'مدیرعامل', createdAt: '2026-09-20' }],
  portfolio: null, sourceDates: [{ source: 'شاخص‌ها', date: '2026-10-27', available: true }], previous: null,
  periodDelays: { from: '2026-09-28', to: today, items: [
    { date: '2026-10-05', label: 'کمبود مصالح', hours: 60, responsibility: 'contractor', critical: true },
    { date: '2026-10-12', label: 'کمبود مصالح', hours: 30, responsibility: 'contractor', critical: false },
    { date: '2026-10-19', label: 'کمبود مصالح', hours: 20, responsibility: 'contractor', critical: false },
    { date: '2026-10-20', label: 'آب‌وهوا', hours: 10, responsibility: 'force_majeure', critical: false },
  ] },
  ...o,
})
export const facts = (id, name, o = {}, inp = {}) => {
  const i = input(inp)
  return {
    id, name, program: null, portfolio: null, location: '', projectType: 'EPC', contractType: 'Lump Sum', contractor: 'C1', contractValue: 1000, manager: 'مدیر پروژه',
    phase: { code: 'EPC', title: 'اجرا' },
    disciplines: [{ key: 'engineering', actual: 95, planned: 100, weight: 0.15 }, { key: 'procurement', actual: 40, planned: 70, weight: 0.35 }, { key: 'construction', actual: 20, planned: 35, weight: 0.5 }],
    issues: [
      { id: 'i1', title: 'تأخیر حمل لوله از بندر', status: 'open', priority: 'critical', category: 'تأمین کالا', due: '2026-10-01', createdAt: '2026-10-10', closedAt: null, owner: null },
      { id: 'i2', title: 'کسری کالای مصرفی', status: 'open', priority: 'high', category: 'تأمین کالا', due: '2026-10-20', createdAt: '2026-10-12', closedAt: null, owner: null },
      { id: 'i3', title: 'x', status: 'open', priority: 'low', category: null, due: null, createdAt: '2026-10-15', closedAt: null, owner: null },
    ],
    changes: [{ id: 'c1', number: 'CR-1', title: 'تغییر مسیر', status: 'approved', submittedAt: '2026-07-01', approvedCost: 60, proposedCost: 80, approvedDays: 30, proposedDays: 40 }],
    input: i, report: buildEvidenceReport(i), ...o,
  }
}

