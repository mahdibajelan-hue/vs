import welding from './templates/welding.grid.json'
import bend from './templates/bend.grid.json'
import fitup from './templates/fit_up.grid.json'
import repair from './templates/repair.grid.json'
import connection from './templates/connection.grid.json'
import rtFull from './templates/rt_req_full.grid.json'
import rtRepair from './templates/rt_req_repair.grid.json'
import rtReport from './templates/rt_report.grid.json'
import pqr from './templates/pqr.grid.json'
import wqt from './templates/wqt.grid.json'
import cardWelder from './templates/welder_card.grid.json'
import { WELDING_BINDINGS } from './weldingBindings'
import { GRID_SPECS } from './gridSpecs'
import type { CellBinding, GridTemplate } from './gridTypes'

/** Templates shipped with the app, ready to be registered in the library as a draft; they become usable for printing once an authorised user approves a version. */
export interface BundledTemplate { formKey: string; title: string; layout: GridTemplate; bindings: CellBinding[]; renderer: 'welding' | 'spec' | 'static' }
const spec = (formKey: string, title: string, layout: unknown): BundledTemplate => ({
  formKey, title, layout: layout as GridTemplate, renderer: 'spec',
  bindings: GRID_SPECS[formKey].headers.map((h) => ({ cell: h.cell, source: h.key, mode: h.mode ?? 'replace' })),
})
const stat = (formKey: string, title: string, layout: unknown): BundledTemplate => ({ formKey, title, layout: layout as GridTemplate, bindings: [], renderer: 'static' })
export const BUNDLED_TEMPLATES: BundledTemplate[] = [
  { formKey: 'welding', title: 'گزارش روزانه جوشکاری — DAILY WELDING REPORT', layout: welding as unknown as GridTemplate, bindings: WELDING_BINDINGS, renderer: 'welding' },
  spec('fitup', 'گزارش روزانه فیت‌آپ — DAILY FIT UP REPORT', fitup),
  spec('bend', 'گزارش روزانه خمکاری', bend),
  spec('weld_repair', 'گزارش روزانه عملیات تعمیرات جوش', repair),
  spec('tie_in', 'گزارش روزانه عملیات TIE-IN & CONNECTION', connection),
  spec('rt_request', 'درخواست رادیوگرافی (کامل)', rtFull),
  spec('rt_request_rp', 'درخواست رادیوگرافی RP / RS / RT', rtRepair),
  spec('rt_report', 'گزارش رادیوگرافی', rtReport),
  stat('pqr', 'PQR — گزارش تأیید روش جوشکاری', pqr),
  stat('wqt', 'WQT — آزمون صلاحیت جوشکار', wqt),
  stat('welder_card', 'کارت جوشکار — CARD WELDER', cardWelder),
]
