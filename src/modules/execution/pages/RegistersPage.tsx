import { PipesPage } from './PipesPage'
import { WeldersPage } from './WeldersPage'

/** Identity registers of the pipeline: pipes received into the warehouse and welders with their qualifications. */
export function RegistersPage({ projectId, sub }: { projectId: string; sub: string }) { return sub === 'welders' ? <WeldersPage projectId={projectId} /> : <PipesPage projectId={projectId} /> }
