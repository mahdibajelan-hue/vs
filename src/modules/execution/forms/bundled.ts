import welding from './templates/welding.grid.json'
import { WELDING_BINDINGS } from './weldingBindings'
import type { CellBinding, GridTemplate } from './gridTypes'

/** Templates shipped with the app, ready to be registered in the library as a draft (they become usable only after the form owner approves a version with its code and revision). */
export interface BundledTemplate { formKey: string; title: string; layout: GridTemplate; bindings: CellBinding[]; renderer: 'welding' }
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  { formKey: 'welding', title: 'گزارش روزانه جوشکاری — DAILY WELDING REPORT', layout: welding as unknown as GridTemplate, bindings: WELDING_BINDINGS, renderer: 'welding' },
]
