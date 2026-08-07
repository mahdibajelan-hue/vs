#!/usr/bin/env node
// Exports every project this backup account can see (via normal RLS) into a single
// timestamped JSON snapshot under backups/. Run in CI on a schedule; see
// .github/workflows/backup-data.yml.
import { createClient } from '@supabase/supabase-js'
import { writeFile, mkdir } from 'node:fs/promises'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.BACKUP_USER_EMAIL
const password = process.env.BACKUP_USER_PASSWORD

for (const [name, value] of Object.entries({
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anonKey,
  BACKUP_USER_EMAIL: email,
  BACKUP_USER_PASSWORD: password,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
}

const supabase = createClient(url, anonKey)

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) {
    console.error('Sign-in failed:', authError.message)
    process.exit(1)
  }

  const { data: projects, error: projectsError } = await supabase.from('projects').select('*')
  if (projectsError) {
    console.error('Failed to fetch projects:', projectsError.message)
    process.exit(1)
  }

  const snapshot = { exportedAt: new Date().toISOString(), projects: [] }

  for (const project of projects ?? []) {
    const [{ data: lines, error: linesError }, { data: logs, error: logsError }, { data: members, error: membersError }] =
      await Promise.all([
        supabase.from('lines').select('*').eq('project_id', project.id),
        supabase.from('daily_logs').select('*').eq('project_id', project.id),
        supabase.from('project_members').select('user_id, role').eq('project_id', project.id),
      ])
    if (linesError || logsError || membersError) {
      console.error(
        `Failed to fetch children for project ${project.id}:`,
        linesError?.message ?? logsError?.message ?? membersError?.message,
      )
      process.exit(1)
    }
    snapshot.projects.push({ ...project, lines, daily_logs: logs, project_members: members })
  }

  await mkdir('backups', { recursive: true })
  const stamp = snapshot.exportedAt.replace(/[:.]/g, '-')
  const outPath = `backups/backup-${stamp}.json`
  await writeFile(outPath, JSON.stringify(snapshot, null, 2), 'utf8')
  console.log(`Wrote ${outPath} — ${snapshot.projects.length} project(s).`)
}

main()
