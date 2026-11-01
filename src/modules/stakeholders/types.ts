export type Category = 'employer' | 'consultant' | 'contractor' | 'subcontractor' | 'supplier' | 'government' | 'regulator' | 'local_authority' | 'community' | 'landowner' | 'ngo' | 'media' | 'internal' | 'other'
export type Attitude = 'champion' | 'supporter' | 'neutral' | 'critic' | 'blocker'
export type Engagement = 'unaware' | 'resistant' | 'neutral' | 'supportive' | 'leading'
export type EngagementKind = 'meeting' | 'call' | 'letter' | 'email' | 'visit' | 'workshop' | 'public_meeting' | 'other'
export type Sentiment = 'positive' | 'neutral' | 'negative'
export type ConcernCategory = 'land' | 'environment' | 'social' | 'safety' | 'schedule' | 'payment' | 'technical' | 'legal' | 'permit' | 'other'
export type ConcernPriority = 'low' | 'medium' | 'high' | 'critical'
export type ConcernStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type Quadrant = 'manage' | 'satisfy' | 'inform' | 'monitor'

export interface Stakeholder {
  id: string
  projectId: string
  code: string
  name: string
  organization: string
  roleTitle: string
  category: Category
  side: 'internal' | 'external'
  phone: string
  email: string
  power: number
  interest: number
  attitude: Attitude
  current: Engagement
  desired: Engagement
  owner: string
  ownerEmail: string
  channel: string
  frequencyDays: number | null
  expectations: string
  strategy: string
  note: string
  active: boolean
  createdAt: string
}
export interface EngagementLog {
  id: string
  stakeholderId: string
  happenedOn: string
  kind: EngagementKind
  subject: string
  summary: string
  attendees: string
  sentiment: Sentiment
  nextAction: string
  nextDue: string | null
  nextOwner: string
  nextOwnerEmail: string
  nextDone: boolean
  createdBy: string | null
}
export interface Concern {
  id: string
  stakeholderId: string
  raisedOn: string
  title: string
  description: string
  category: ConcernCategory
  priority: ConcernPriority
  status: ConcernStatus
  owner: string
  ownerEmail: string
  dueDate: string | null
  resolution: string
  resolvedOn: string | null
}

export const CATEGORY_FA: Record<Category, string> = {
  employer: 'کارفرما', consultant: 'مشاور', contractor: 'پیمانکار', subcontractor: 'پیمانکار جزء', supplier: 'تأمین‌کننده',
  government: 'نهاد دولتی', regulator: 'نهاد نظارتی و صدور مجوز', local_authority: 'مدیریت محلی (استانداری، فرمانداری، بخشداری، شهرداری)',
  community: 'جامعهٔ محلی', landowner: 'مالکان و بهره‌برداران اراضی', ngo: 'سازمان‌های مردم‌نهاد', media: 'رسانه', internal: 'داخل سازمان', other: 'سایر',
}
export const ATTITUDE_FA: Record<Attitude, string> = { champion: 'حامی فعال', supporter: 'موافق', neutral: 'بی‌طرف', critic: 'منتقد', blocker: 'مخالف جدی' }
export const ATTITUDE_COLOR: Record<Attitude, string> = { champion: '#10b981', supporter: '#22c55e', neutral: '#94a3b8', critic: '#f59e0b', blocker: '#ef4444' }
export const ENGAGEMENT_ORDER: Engagement[] = ['unaware', 'resistant', 'neutral', 'supportive', 'leading']
export const ENGAGEMENT_FA: Record<Engagement, string> = { unaware: 'بی‌اطلاع', resistant: 'مقاوم', neutral: 'بی‌طرف', supportive: 'حمایت‌گر', leading: 'پیشرو' }
export const KIND_FA: Record<EngagementKind, string> = { meeting: 'جلسه', call: 'تماس تلفنی', letter: 'نامه', email: 'ایمیل', visit: 'بازدید', workshop: 'کارگاه', public_meeting: 'جلسهٔ عمومی', other: 'سایر' }
export const SENTIMENT_FA: Record<Sentiment, string> = { positive: 'مثبت', neutral: 'خنثی', negative: 'منفی' }
export const SENTIMENT_COLOR: Record<Sentiment, string> = { positive: '#10b981', neutral: '#94a3b8', negative: '#ef4444' }
export const CONCERN_CAT_FA: Record<ConcernCategory, string> = { land: 'اراضی و تملک', environment: 'محیط زیست', social: 'اجتماعی', safety: 'ایمنی', schedule: 'زمان‌بندی', payment: 'پرداخت و مالی', technical: 'فنی', legal: 'حقوقی', permit: 'مجوزها', other: 'سایر' }
export const PRIORITY_FA: Record<ConcernPriority, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' }
export const PRIORITY_COLOR: Record<ConcernPriority, string> = { low: '#64748b', medium: '#3b82f6', high: '#f59e0b', critical: '#ef4444' }
export const CONCERN_STATUS_FA: Record<ConcernStatus, string> = { open: 'باز', in_progress: 'در حال پیگیری', resolved: 'رفع‌شده', closed: 'بسته' }
export const QUADRANT_FA: Record<Quadrant, { name: string; hint: string; color: string }> = {
  manage: { name: 'مدیریت نزدیک', hint: 'قدرت و علاقهٔ زیاد: مشارکت فعال در تصمیم‌ها و ارتباط منظم و مستقیم', color: '#ef4444' },
  satisfy: { name: 'راضی نگه‌داشتن', hint: 'قدرت زیاد و علاقهٔ کم: گزارش‌های خلاصه و مشورت در موضوعات اثرگذار بر آنان', color: '#f59e0b' },
  inform: { name: 'مطلع نگه‌داشتن', hint: 'قدرت کم و علاقهٔ زیاد: اطلاع‌رسانی منظم و شنیدن نگرانی‌ها', color: '#3b82f6' },
  monitor: { name: 'پایش', hint: 'قدرت و علاقهٔ کم: پایش دوره‌ای با کمترین هزینهٔ ارتباطی', color: '#64748b' },
}
