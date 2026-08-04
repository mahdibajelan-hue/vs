import type { Project } from '../types'

export function exportProjectJson(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name || 'project'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const REQUIRED_KEYS: (keyof Project)[] = ['id', 'name', 'lines', 'logs', 'schedules']

export function parseProjectJson(text: string): Project | null {
  try {
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object') return null
    for (const key of REQUIRED_KEYS) {
      if (!(key in data)) return null
    }
    return data as Project
  } catch {
    return null
  }
}
