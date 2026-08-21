import type { Equipment3D, Joint, Spool } from '../types'

export const SPOOL_COMPLETE_COLOR = '#2ecc71'
export const EQUIPMENT_COMPLETE_COLOR = '#3498db'
export const SELECTED_MESH_COLOR = '#22d3ee'
export const DIM_COLOR = '#4b5563'
export const DIM_OPACITY = 0.22

/**
 * Which color (if any) each linked 3D mesh object should show — driven entirely by the
 * joint-centric model, never by name matching: a spool's meshes light up only once BOTH its
 * bounding joints are completed (spec: "فقط موقعی امکان پذیره که سرجوش قبل و بعد هم معرفی شده
 * باشند"), and equipment's meshes light up once both its install milestones are set.
 */
export function buildMeshColorMap(spools: Spool[], equipment3d: Equipment3D[], joints: Joint[]): Map<string, string> {
  const jointById = new Map(joints.map((j) => [j.id, j]))
  const map = new Map<string, string>()
  for (const spool of spools) {
    const start = spool.startJointId ? jointById.get(spool.startJointId) : null
    const end = spool.endJointId ? jointById.get(spool.endJointId) : null
    const complete = !!start && !!end && start.status === 'completed' && end.status === 'completed'
    if (!complete) continue
    for (const name of spool.meshObjectNames) map.set(name, SPOOL_COMPLETE_COLOR)
  }
  for (const eq of equipment3d) {
    const complete = !!eq.foundationReadyDate && !!eq.erectedDate
    if (!complete) continue
    for (const name of eq.meshObjectNames) map.set(name, EQUIPMENT_COMPLETE_COLOR)
  }
  return map
}
