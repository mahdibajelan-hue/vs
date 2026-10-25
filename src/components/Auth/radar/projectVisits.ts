import { supabase } from '../../../lib/supabaseClient'
import { recentProjects, setRecentProjects } from './projectNav'

/** The user's project visits live in radar_project_visits so the picker order follows them to any device;
 * localStorage stays the instant (and offline) copy. A missing table or a failed call just leaves the local order. */
export async function syncRecentFromServer(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('radar_project_visits').select('project_id, opened_at').order('opened_at', { ascending: false }).limit(50)
    if (error || !data) return recentProjects()
    const server = (data as { project_id: string }[]).map((r) => r.project_id)
    const merged = [...new Set([...recentProjects().slice(0, 1), ...server, ...recentProjects()])] // the visit just made locally stays first
    setRecentProjects(merged)
    return merged
  } catch { return recentProjects() }
}

export function recordVisit(projectId: string) {
  void supabase.from('radar_project_visits').upsert({ project_id: projectId, opened_at: new Date().toISOString() }, { onConflict: 'user_id,project_id' }).then(() => undefined, () => undefined)
}
