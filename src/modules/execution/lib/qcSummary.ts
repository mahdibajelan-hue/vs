/** Read-only quality summary for the management report, with an explicit data-status label. Never feeds progress / quantity numbers. */
export interface QcSumReport { id: string; formKey: string; reportDate: string; status: string }
export interface QcSumFinding { status: 'open' | 'closed'; createdAt: string; severity: 'low' | 'medium' | 'high' }
export interface QcSumNcr { status: string; createdAt: string; closedAt: string | null }
export type DataStatus = 'none' | 'draft_included' | 'approved_only'
export interface QcSummary {
  dataStatus: DataStatus; forms: number; approvedForms: number
  findingsInPeriod: number; openFindings: number; highOpen: number
  ncrOpened: number; ncrClosed: number; ncrOpen: number
  welds: number
}
const isApproved = (s: string) => s === 'approved' || s === 'partially_approved'
export function qcSummary(reports: QcSumReport[], findings: QcSumFinding[], ncrs: QcSumNcr[], weldCount: number, from: string, to: string): QcSummary {
  const forms = reports.filter((r) => r.formKey !== 'work' && r.reportDate >= from && r.reportDate <= to && r.status !== 'draft')
  const approvedForms = forms.filter((r) => isApproved(r.status)).length
  const inP = (iso: string) => iso.slice(0, 10) >= from && iso.slice(0, 10) <= to
  const dataStatus: DataStatus = forms.length === 0 ? 'none' : approvedForms === forms.length ? 'approved_only' : 'draft_included'
  return {
    dataStatus, forms: forms.length, approvedForms,
    findingsInPeriod: findings.filter((f) => inP(f.createdAt)).length,
    openFindings: findings.filter((f) => f.status === 'open').length,
    highOpen: findings.filter((f) => f.status === 'open' && f.severity === 'high').length,
    ncrOpened: ncrs.filter((n) => inP(n.createdAt)).length,
    ncrClosed: ncrs.filter((n) => n.closedAt && inP(n.closedAt)).length,
    ncrOpen: ncrs.filter((n) => !n.closedAt).length,
    welds: weldCount,
  }
}
export const DATA_STATUS_FA: Record<DataStatus, string> = { none: 'دادهٔ فنی در این دوره نیست', draft_included: 'شامل فرم‌های در انتظار تأیید نظارت — قطعی نیست', approved_only: 'فقط فرم‌های تأییدشدهٔ نظارت' }
