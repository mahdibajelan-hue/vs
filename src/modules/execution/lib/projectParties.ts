/** The three parties of a project, read from the base data (project record + organizations) — the single source for report headers, letterheads and the default contractor of a report. */
export interface PartyOrg { id: string; name: string }
export interface ProjectParties { employer: PartyOrg | null; consultant: PartyOrg | null; contractor: PartyOrg | null }
interface P { employerOrgId: string | null; consultantOrgId: string | null; contractorOrgId: string | null; partnerOrgId?: string | null }
export function projectParties(project: P | undefined | null, orgs: { id: string; name: string }[]): ProjectParties {
  const pick = (id: string | null | undefined): PartyOrg | null => { const o = id ? orgs.find((x) => x.id === id) : undefined; return o ? { id: o.id, name: o.name } : null }
  return { employer: pick(project?.employerOrgId), consultant: pick(project?.consultantOrgId), contractor: pick(project?.contractorOrgId) ?? pick(project?.partnerOrgId) }
}
