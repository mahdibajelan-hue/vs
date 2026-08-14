import { supabase } from './supabaseClient'

/**
 * 3D models (FBX exported from Navisworks Manage or similar) live in the private
 * 'project-models' Storage bucket, one per project at `<projectId>/model.<ext>` (upsert on
 * re-upload). Like finance-docs, the bucket is private so reads need a short-lived signed URL.
 */
const BUCKET = 'project-models'

export async function uploadProjectModel3d(projectId: string, file: File): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'fbx'
  const path = `${projectId}/model.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function getProjectModel3dSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30)
  if (error || !data) return null
  return data.signedUrl
}

export async function deleteProjectModel3d(path: string): Promise<string | null> {
  if (!path) return null
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  return error ? error.message : null
}
