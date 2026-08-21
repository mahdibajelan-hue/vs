import type { RmResponseStrategy } from '../types'

export interface StrategyFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
}

/**
 * Context-specific fields per Response Strategy (spec #6) — after picking a strategy, the form
 * shows exactly this field set instead of a single free-text box. Values are stored as a flat
 * key/value bag on RmRisk.strategyDetails rather than dozens of nullable DB columns, since only
 * one strategy's fields are ever populated for a given risk at a time.
 */
export const STRATEGY_FIELDS: Record<RmResponseStrategy, StrategyFieldDef[]> = {
  avoid: [
    { key: 'avoidanceAction', label: 'اقدام اجتناب — چه اقدامی این تهدید را حذف می‌کند؟', type: 'textarea' },
    { key: 'avoidanceReason', label: 'دلیل ترجیح اجتناب', type: 'textarea' },
    { key: 'approvedBy', label: 'تاییدکننده تصمیم اجتناب', type: 'text' },
    { key: 'residualResult', label: 'ریسک باقیمانده پس از اجتناب', type: 'textarea' },
  ],
  transfer: [
    {
      key: 'transferredTo',
      label: 'منتقل‌شده به',
      type: 'select',
      options: [
        { value: 'contractor', label: 'پیمانکار' },
        { value: 'supplier', label: 'تامین‌کننده' },
        { value: 'insurance', label: 'شرکت بیمه' },
        { value: 'partner', label: 'شریک' },
        { value: 'third_party', label: 'شخص ثالث' },
      ],
    },
    { key: 'contractRef', label: 'مرجع قراردادی (اختیاری)', type: 'text' },
    { key: 'insuranceRef', label: 'مرجع بیمه‌نامه (اختیاری)', type: 'text' },
    { key: 'transferredImpact', label: 'سهم منتقل‌شده از پیامد — انتقال به‌معنای حذف ریسک نیست', type: 'text' },
  ],
  accept: [
    {
      key: 'acceptanceType',
      label: 'نوع پذیرش',
      type: 'select',
      options: [
        { value: 'passive', label: 'پذیرش منفعل' },
        { value: 'active', label: 'پذیرش فعال' },
      ],
    },
    { key: 'contingencyPlan', label: 'برنامه اقتضایی — در صورت وقوع چه کاری انجام می‌شود؟', type: 'textarea' },
    { key: 'contingencyOwner', label: 'مسئول اجرای برنامه اقتضایی', type: 'text' },
  ],
  mitigate: [
    { key: 'mitigationActions', label: 'اقدامات کاهش — چه اقداماتی احتمال یا شدت را کاهش می‌دهد؟', type: 'textarea' },
    { key: 'expectedReduction', label: 'کاهش مورد انتظار در مواجهه ریسک', type: 'text' },
    { key: 'targetResidualScore', label: 'امتیاز هدف باقیمانده پس از کاهش', type: 'text' },
  ],
  escalate: [
    { key: 'escalationReason', label: 'دلیل ارجاع به مقام بالاتر', type: 'textarea' },
    {
      key: 'escalationLevel',
      label: 'سطح ارجاع',
      type: 'select',
      options: [
        { value: 'project_manager', label: 'مدیر پروژه' },
        { value: 'management', label: 'مدیریت / کمیته راهبری' },
      ],
    },
    { key: 'escalatedTo', label: 'ارجاع به (فرد/جایگاه مشخص)', type: 'text' },
    { key: 'escalationDate', label: 'تاریخ ارجاع', type: 'date' },
    { key: 'requiredDecision', label: 'تصمیم یا پشتیبانی موردنیاز', type: 'textarea' },
  ],
  exploit: [
    { key: 'exploitationAction', label: 'اقدام بهره‌برداری — چه اقدامی وقوع فرصت را تضمین می‌کند؟', type: 'textarea' },
    { key: 'opportunityOwner', label: 'مالک فرصت', type: 'text' },
    { key: 'expectedBenefit', label: 'منفعت مورد انتظار', type: 'text' },
    { key: 'targetBenefit', label: 'منفعت هدف', type: 'text' },
    { key: 'approvedBy', label: 'تاییدکننده', type: 'text' },
  ],
  enhance: [
    { key: 'enhancementAction', label: 'اقدام تقویت — چه اقدامی احتمال/پیامد مثبت را افزایش می‌دهد؟', type: 'textarea' },
    { key: 'expectedProbabilityIncrease', label: 'افزایش احتمال مورد انتظار', type: 'text' },
    { key: 'expectedImpactIncrease', label: 'افزایش پیامد مثبت مورد انتظار', type: 'text' },
    { key: 'targetOpportunityScore', label: 'امتیاز هدف فرصت', type: 'text' },
  ],
  share: [
    { key: 'sharedWith', label: 'مشارکت با', type: 'text' },
    { key: 'partnershipRef', label: 'مرجع قرارداد/مشارکت (اختیاری)', type: 'text' },
    { key: 'benefitAllocation', label: 'تخصیص منفعت', type: 'textarea' },
    { key: 'responsibility', label: 'شرح مسئولیت هر طرف', type: 'textarea' },
  ],
}
