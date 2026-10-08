/**
 * Bilingual «English (فارسی)» labels for the behavioral fingerprint — Big Five traits and the
 * professional behavioral dimensions. The English half comes from the DB (label_en, schema.sql
 * Section 57, admin-editable); this key-based map is the fallback for rows created before that
 * column existed or left blank, so a label is never Persian-only.
 */

export const TRAIT_LABEL_EN: Record<string, string> = {
  conscientiousness: 'Conscientiousness',
  emotional_stability: 'Emotional Stability',
  agreeableness: 'Agreeableness',
  extraversion: 'Extraversion',
  openness: 'Openness to Experience',
}

export const DIMENSION_LABEL_EN: Record<string, string> = {
  ACCOUNTABILITY: 'Accountability',
  ADAPTABILITY: 'Adaptability',
  ANALYTICAL_THINKING: 'Analytical Thinking',
  COMMERCIAL_AWARENESS: 'Commercial Awareness',
  COMMUNICATION: 'Communication',
  CONFLICT_MANAGEMENT: 'Conflict Management',
  DECISION_CONFIDENCE: 'Decision Confidence',
  DECISION_QUALITY: 'Decision Quality',
  DETAIL_ORIENTATION: 'Detail Orientation',
  DISCIPLINE: 'Work Discipline',
  DOCUMENTATION_DISCIPLINE: 'Documentation Discipline',
  ESCALATION_JUDGMENT: 'Escalation Judgment',
  INITIATIVE: 'Initiative',
  INTEGRITY_ORIENTATION: 'Integrity Orientation',
  LEADERSHIP: 'Leadership',
  LEARNING_AGILITY: 'Learning Agility',
  OWNERSHIP: 'Ownership',
  PERSISTENCE: 'Persistence',
  PROBLEM_OWNERSHIP: 'Problem Ownership',
  RISK_AWARENESS: 'Risk Awareness',
  RULE_ORIENTATION: 'Rule Orientation',
  SAFETY_ORIENTATION: 'Safety Orientation',
  STAKEHOLDER_ORIENTATION: 'Stakeholder Orientation',
  TEAMWORK: 'Teamwork',
}

/** Title-cases a SNAKE_CASE / snake_case key — last resort for a key in neither map. */
function humanizeKey(key: string): string {
  return key
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

export interface BilingualLabel {
  en: string
  fa: string
  /** «English (فارسی)» — the single-string form used in tables, tooltips and the PDF. */
  full: string
}

export function bilingual(kind: 'trait' | 'dimension', item: { key?: string | null; labelFa?: string | null; labelEn?: string | null } | undefined): BilingualLabel {
  const key = item?.key ?? ''
  const fa = item?.labelFa?.trim() || '—'
  const map = kind === 'trait' ? TRAIT_LABEL_EN : DIMENSION_LABEL_EN
  const en = item?.labelEn?.trim() || map[key] || (key ? humanizeKey(key) : '')
  return { en, fa, full: en ? `${en} (${fa})` : fa }
}

/** One accent hue per Big Five trait (distinct, colorblind-separable set; text uses .fx-tone-text
 * so it stays readable in both themes, and the score is always printed beside it). */
export const TRAIT_TONE: Record<string, string> = {
  conscientiousness: '#8b5cf6',
  emotional_stability: '#06b6d4',
  agreeableness: '#10b981',
  extraversion: '#f59e0b',
  openness: '#ec4899',
}

/** Behavioral dimensions grouped into families, each with its own hue. */
export const DIMENSION_FAMILY: Record<string, { key: string; labelFa: string; labelEn: string; tone: string }> = {
  safety: { key: 'safety', labelFa: 'ایمنی و انطباق', labelEn: 'Safety & Compliance', tone: '#f97316' },
  execution: { key: 'execution', labelFa: 'نظم و اجرا', labelEn: 'Discipline & Execution', tone: '#8b5cf6' },
  thinking: { key: 'thinking', labelFa: 'تفکر و تصمیم', labelEn: 'Thinking & Decisions', tone: '#0ea5e9' },
  people: { key: 'people', labelFa: 'تعامل و رهبری', labelEn: 'People & Leadership', tone: '#10b981' },
  growth: { key: 'growth', labelFa: 'رشد و انطباق', labelEn: 'Growth & Adaptability', tone: '#ec4899' },
}

const DIMENSION_FAMILY_OF: Record<string, keyof typeof DIMENSION_FAMILY> = {
  SAFETY_ORIENTATION: 'safety',
  RISK_AWARENESS: 'safety',
  RULE_ORIENTATION: 'safety',
  INTEGRITY_ORIENTATION: 'safety',
  ESCALATION_JUDGMENT: 'safety',
  DISCIPLINE: 'execution',
  DOCUMENTATION_DISCIPLINE: 'execution',
  DETAIL_ORIENTATION: 'execution',
  ACCOUNTABILITY: 'execution',
  OWNERSHIP: 'execution',
  PERSISTENCE: 'execution',
  PROBLEM_OWNERSHIP: 'execution',
  ANALYTICAL_THINKING: 'thinking',
  DECISION_QUALITY: 'thinking',
  DECISION_CONFIDENCE: 'thinking',
  COMMERCIAL_AWARENESS: 'thinking',
  COMMUNICATION: 'people',
  TEAMWORK: 'people',
  LEADERSHIP: 'people',
  CONFLICT_MANAGEMENT: 'people',
  STAKEHOLDER_ORIENTATION: 'people',
  ADAPTABILITY: 'growth',
  LEARNING_AGILITY: 'growth',
  INITIATIVE: 'growth',
}

export function dimensionFamily(key: string | null | undefined) {
  return DIMENSION_FAMILY[DIMENSION_FAMILY_OF[key ?? ''] ?? 'thinking']
}

export function traitTone(key: string | null | undefined): string {
  return TRAIT_TONE[key ?? ''] ?? '#a855f7'
}
