import type { OrgType, PartyRole, ProjectLifecycleStatus } from '../types'

/** Formal but lively: deep, slightly muted tones that read on both the dark and the light theme. */
export const PALETTE = { blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', teal: '#14b8a6', emerald: '#10b981', amber: '#f59e0b', orange: '#f97316', rose: '#f43f5e', sky: '#0ea5e9', slate: '#64748b' } as const

export const ORG_COLOR: Record<OrgType, string> = { employer: PALETTE.blue, consultant: PALETTE.violet, contractor: PALETTE.amber, partner: PALETTE.rose, internal: PALETTE.emerald, other: PALETTE.slate }
export const PARTY_COLOR: Record<PartyRole, string> = { employer: PALETTE.blue, contractor: PALETTE.amber, design_consultant: PALETTE.violet, supervision_consultant: PALETTE.teal, partner: PALETTE.rose, other: PALETTE.slate }
export const STATUS_COLOR: Record<ProjectLifecycleStatus, string> = { idea: PALETTE.slate, proposed: PALETTE.sky, approved: PALETTE.indigo, planning: PALETTE.violet, executing: PALETTE.emerald, on_hold: PALETTE.amber, completed: PALETTE.teal, closed: PALETTE.slate, archived: PALETTE.slate, cancelled: PALETTE.rose }
export const LEVEL_COLOR = { portfolio: PALETTE.indigo, program: PALETTE.sky, project: PALETTE.emerald }

const MANAGERS = new Set(['site_manager', 'engineering_manager', 'planning_manager', 'procurement_manager', 'contracts_manager', 'finance_manager', 'hse_manager', 'qc_manager', 'deputy_pm'])
export const positionColor = (key: string): string => (key === 'executive' ? PALETTE.indigo : key === 'project_manager' ? PALETTE.blue : MANAGERS.has(key) ? PALETTE.teal : key === 'legal_officer' || key === 'land_officer' ? PALETTE.orange : key.endsWith('_rep') ? PALETTE.amber : PALETTE.slate)

export const NAV_COLOR: Record<string, string> = { overview: PALETTE.teal, organizations: PALETTE.blue, portfolios: PALETTE.indigo, programs: PALETTE.sky, projects: PALETTE.emerald, parties: PALETTE.amber, mapping: PALETTE.violet, integrity: PALETTE.rose, demo: PALETTE.slate }
export const STEP_COLORS = [PALETTE.blue, PALETTE.indigo, PALETTE.sky, PALETTE.emerald, PALETTE.amber, PALETTE.violet]
