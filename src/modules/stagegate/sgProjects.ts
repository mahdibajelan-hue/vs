import { supabase } from '../../lib/supabaseClient'

/** A Stage-Gate project and the master project it belongs to (sg_projects.master_project_id). */
export interface SgProjectRef { name: string; masterProjectId: string | null }

/** Stage-Gate projects (without the guide project), with their master-project link. */
export async function loadSgProjects(): Promise<SgProjectRef[]> {
  const { data } = await supabase.from('sg_projects').select('name, is_guide, master_project_id').order('name')
  return ((data ?? []) as { name: string; is_guide: boolean | null; master_project_id: string | null }[])
    .filter((p) => !p.is_guide)
    .map((p) => ({ name: p.name, masterProjectId: p.master_project_id }))
}

/** Link (or unlink with null) a Stage-Gate project to a master project — one to one. */
export async function linkSgProject(name: string, masterProjectId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (masterProjectId) await supabase.from('sg_projects').update({ master_project_id: null }).eq('master_project_id', masterProjectId)
  const { error } = await supabase.from('sg_projects').update({ master_project_id: masterProjectId }).eq('name', name)
  return error ? { ok: false, error: error.message } : { ok: true }
}
