import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, BookMarked, Calculator, Check, FileStack, GitBranch, Layers, Plus, Radio, Search, Trash2, Waves, Wind, Workflow, X } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useEstimatorStore } from '../store/useEstimatorStore'
import type { EstProjectDraft } from '../types'
import { scopeLabels } from '../lib/calc'
import { BORDER, fmtEUR, fmtEURm, INK, INK_SOFT, MUTED_FG, SAFETY, SECTION_COLOR, SURFACE, SURFACE_2, toFa } from '../lib/theme'
import { AnimatedNumber, Btn, Stepper, TextField } from '../components/ui'
import { RouteSchematic } from '../components/RouteSchematic'
import { Guide } from '../components/Guide'

const EMPTY_DRAFT: EstProjectDraft = { name: '', hasOnshore: true, hasOffshore: false, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: true }

/** starting points for the scope — one click instead of five yes/no questions */
const PRESETS: { key: string; title: string; hint: string; scope: Omit<EstProjectDraft, 'name'> }[] = [
  { key: 'land', title: 'خط انتقال خشکی', hint: 'خط زمینی با مخابرات', scope: { hasOnshore: true, hasOffshore: false, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: true } },
  { key: 'boost', title: 'خط با تقویت فشار', hint: 'خط زمینی، ایستگاه تقویت و دو انشعاب', scope: { hasOnshore: true, hasOffshore: false, hasCompressorStation: true, tieInCount: 2, hasTelecomScada: true } },
  { key: 'coast', title: 'خط ساحلی–دریایی', hint: 'بخش خشکی که به دریا می‌رسد', scope: { hasOnshore: true, hasOffshore: true, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: true } },
  { key: 'subsea', title: 'خط زیردریایی', hint: 'فقط بخش دریایی', scope: { hasOnshore: false, hasOffshore: true, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: false } },
]

export function ProjectListPage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const projects = useEstimatorStore((s) => s.projects)
  const summaries = useEstimatorStore((s) => s.summaries)
  const fetchSummaries = useEstimatorStore((s) => s.fetchSummaries)
  const selectProject = useEstimatorStore((s) => s.selectProject)
  const deleteProject = useEstimatorStore((s) => s.deleteProject)
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => { void fetchSummaries() }, [fetchSummaries])

  const shown = useMemo(() => projects.filter((p) => !q.trim() || p.name.includes(q.trim())), [projects, q])
  const versions = Object.values(summaries).reduce((a, s) => a + s.versions, 0)
  const portfolio = projects.reduce((a, p) => a + (summaries[p.id]?.latestEur ?? 0), 0)
  const priced = projects.filter((p) => summaries[p.id]).length

  return (
    <div className="h-full overflow-y-auto est-font est-scroll">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6 pb-24 lg:pb-8">
        {/* hero: what the module does, as the route it estimates */}
        <section className="est-hero est-fade-in">
          <div className="est-hero-text">
            <span className="est-eyebrow"><Calculator size={13} /> برآورد پارامتریک هزینهٔ سرمایه‌ای</span>
            <h1>از مسیر خط لوله تا عدد قابل تصویب</h1>
            <p>برآورد هزینهٔ سرمایه‌ای خطوط لوله به چهار روش — پارامتریک، تاریخی، قیاسی و ترکیبی — با نرخ روز یورو، بازهٔ برآورد، جریان نقدینگی سال‌به‌سال و گزارش قابل چاپ. کتابخانهٔ پروژه‌های مرجع، هزینهٔ پروژه‌های اخیر را مبنای برآورد بعدی می‌کند.</p>
            <ol className="est-flow-steps">
              <li><b>۱</b> تعریف پروژه</li>
              <li><b>۲</b> نرخ یورو و روش</li>
              <li><b>۳</b> مشخصات فنی</li>
              <li><b>۴</b> برآورد و گزارش</li>
            </ol>
            <div className="flex flex-wrap gap-2 mt-5">
              <Btn kind="primary" onClick={() => setCreating(true)}><Plus size={15} /> تعریف پروژهٔ جدید</Btn>
              <Btn kind="ghost" onClick={onOpenLibrary}><BookMarked size={15} /> کتابخانهٔ مرجع</Btn>
            </div>
          </div>
          <div className="est-hero-art" aria-hidden>
            <RouteSchematic project={{ hasOnshore: true, hasOffshore: true, hasCompressorStation: true, tieInCount: 2, hasTelecomScada: true }} lengthKm={180} height={170} />
            <div className="est-legend">
              <Legend color={SECTION_COLOR.launcher} label="فرستنده" />
              <Legend color={SECTION_COLOR.blockValve} label="شیر بین‌راهی" />
              <Legend color={SECTION_COLOR.compressor} label="تقویت فشار" />
              <Legend color={SECTION_COLOR.tieIn} label="انشعاب" />
              <Legend color={SECTION_COLOR.telecom} label="مخابرات" />
              <Legend color={SECTION_COLOR.receiver} label="گیرنده" />
            </div>
          </div>
        </section>

        <Guide onOpenLibrary={onOpenLibrary} />

        {/* portfolio strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Layers size={16} />} label="پروژه‌ها" value={toFa(projects.length)} />
          <Stat icon={<Check size={16} />} label="دارای برآورد ذخیره‌شده" value={toFa(priced)} />
          <Stat icon={<FileStack size={16} />} label="نسخه‌های ذخیره‌شده" value={toFa(versions)} />
          <Stat icon={<Calculator size={16} />} label="جمع آخرین برآوردها" value={<AnimatedNumber value={portfolio} format={(n) => (n ? fmtEURm(n) : '—')} />} />
        </div>

        {creating && <CreateProject onClose={() => setCreating(false)} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-extrabold" style={{ color: INK }}>پروژه‌ها</h2>
          {projects.length > 3 && (
            <label className="est-search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام پروژه" />
            </label>
          )}
        </div>

        {projects.length === 0 && !creating ? (
          <div className="est-empty est-fade-in">
            <RouteSchematic project={{ hasOnshore: true, hasOffshore: false, hasCompressorStation: false, tieInCount: 0, hasTelecomScada: false }} height={80} />
            <p className="text-sm font-bold" style={{ color: INK }}>هنوز پروژه‌ای برای برآورد تعریف نشده است</p>
            <p className="text-xs" style={{ color: MUTED_FG }}>با «تعریف پروژهٔ جدید» دامنه را انتخاب کنید؛ بقیهٔ مقادیر از مبانی پیش‌فرض پر می‌شود.</p>
            <Btn kind="primary" onClick={() => setCreating(true)}><Plus size={15} /> تعریف پروژهٔ جدید</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((p, i) => {
              const sm = summaries[p.id]
              return (
                <article key={p.id} className="est-pcard est-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                  <button type="button" className="est-pcard-main" onClick={() => selectProject(p.id)}>
                    <div className="est-pcard-art"><RouteSchematic project={p} height={78} /></div>
                    <div className="p-4 pt-3 space-y-2.5">
                      <p className="text-sm font-extrabold truncate" style={{ color: INK }}>{p.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.hasOnshore && <Badge icon={<GitBranch size={11} />} label="خشکی" />}
                        {p.hasOffshore && <Badge icon={<Waves size={11} />} label="دریایی" />}
                        {p.hasCompressorStation && <Badge icon={<Wind size={11} />} label="تقویت فشار" />}
                        {p.hasTelecomScada && <Badge icon={<Radio size={11} />} label="اسکادا" />}
                        {p.tieInCount > 0 && <Badge icon={<Workflow size={11} />} label={`${toFa(p.tieInCount)} انشعاب`} />}
                      </div>
                      <div className="flex items-end justify-between gap-2 pt-2" style={{ borderTop: `1px dashed ${BORDER}` }}>
                        {sm ? (
                          <div>
                            <div className="text-[10px]" style={{ color: MUTED_FG }}>آخرین برآورد · {formatJalali(sm.latestAt)}</div>
                            <div className="est-mono text-base font-bold" style={{ color: SAFETY }}>{fmtEUR(sm.latestEur)}</div>
                          </div>
                        ) : (
                          <div className="text-[11px]" style={{ color: MUTED_FG }}>هنوز برآوردی ذخیره نشده</div>
                        )}
                        <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: INK_SOFT }}>
                          {sm ? `${toFa(sm.versions)} نسخه` : 'شروع'} <ArrowLeft size={13} className="est-arrow" />
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`پروژه «${p.name}» و همهٔ نسخه‌های برآورد آن حذف شود؟`)) deleteProject(p.id) }}
                    className="est-pcard-del" title="حذف پروژه" aria-label={`حذف پروژه ${p.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              )
            })}
            {shown.length === 0 && <p className="text-xs" style={{ color: MUTED_FG }}>پروژه‌ای با این نام پیدا نشد.</p>}
          </div>
        )}
      </div>
      <style>{PAGE_STYLE}</style>
    </div>
  )
}

/** Two short steps: what the project is called, then what it contains — with the route drawn live. */
function CreateProject({ onClose }: { onClose: () => void }) {
  const createProject = useEstimatorStore((s) => s.createProject)
  const [draft, setDraft] = useState<EstProjectDraft>({ ...EMPTY_DRAFT })
  const [preset, setPreset] = useState('land')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EstProjectDraft>(k: K, v: EstProjectDraft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setPreset('') }

  async function submit() {
    if (!draft.name.trim()) return setError('نام پروژه را وارد کنید.')
    if (!draft.hasOnshore && !draft.hasOffshore) return setError('دست‌کم یکی از بخش‌های خشکی یا دریایی را انتخاب کنید.')
    setBusy(true); setError('')
    const id = await createProject({ ...draft, name: draft.name.trim() })
    setBusy(false)
    if (!id) setError('پروژه ایجاد نشد؛ دوباره تلاش کنید.')
  }

  return (
    <section className="est-create est-fade-in" aria-label="تعریف پروژهٔ جدید">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-extrabold" style={{ color: INK }}>تعریف پروژهٔ جدید</h2>
          <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>بخش‌هایی که انتخاب می‌کنید در مرحلهٔ بعد مشخصات فنی می‌گیرند؛ نرخ‌ها از مبانی پیش‌فرض پر می‌شود.</p>
        </div>
        <Btn kind="quiet" onClick={onClose} title="بستن"><X size={16} /></Btn>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <TextField label="نام پروژه" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="مثلاً خط انتقال گاز ۴۸ اینچ شمال‌شرق" autoFocus />

          <p className="text-xs font-medium mb-2" style={{ color: INK_SOFT }}>الگوی شروع</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PRESETS.map((pr) => (
              <button key={pr.key} type="button" className={`est-preset ${preset === pr.key ? 'is-on' : ''}`}
                onClick={() => { setDraft((d) => ({ ...d, ...pr.scope })); setPreset(pr.key) }}>
                <b>{pr.title}</b><span>{pr.hint}</span>
              </button>
            ))}
          </div>

          <p className="text-xs font-medium mb-2" style={{ color: INK_SOFT }}>دامنهٔ پروژه</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ScopeTile on={draft.hasOnshore} onClick={() => set('hasOnshore', !draft.hasOnshore)} icon={<GitBranch size={18} />} color={SECTION_COLOR.onshore} label="خط خشکی" />
            <ScopeTile on={draft.hasOffshore} onClick={() => set('hasOffshore', !draft.hasOffshore)} icon={<Waves size={18} />} color={SECTION_COLOR.offshore} label="خط دریایی" />
            <ScopeTile on={draft.hasCompressorStation} onClick={() => set('hasCompressorStation', !draft.hasCompressorStation)} icon={<Wind size={18} />} color={SECTION_COLOR.compressor} label="تقویت فشار" />
            <ScopeTile on={draft.hasTelecomScada} onClick={() => set('hasTelecomScada', !draft.hasTelecomScada)} icon={<Radio size={18} />} color={SECTION_COLOR.telecom} label="مخابرات و اسکادا" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 mt-2" style={{ background: SURFACE_2, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <Workflow size={16} style={{ color: SECTION_COLOR.tieIn }} />
              <div>
                <div className="text-sm font-medium" style={{ color: INK }}>ایستگاه‌های انشعاب</div>
                <div className="text-[10px]" style={{ color: MUTED_FG }}>فرستنده/گیرنده توپک و شیرهای بین‌راهی در مرحلهٔ بعد از طول خط محاسبه می‌شوند.</div>
              </div>
            </div>
            <Stepper value={draft.tieInCount} onChange={(v) => set('tieInCount', v)} max={20} />
          </div>
        </div>

        <div className="est-create-preview">
          <span className="text-[11px] font-semibold" style={{ color: MUTED_FG }}>پیش‌نمایش دامنه</span>
          <RouteSchematic project={draft} lengthKm={draft.hasOnshore || draft.hasOffshore ? undefined : 0} height={150} />
          <p className="text-sm font-extrabold truncate" style={{ color: INK }}>{draft.name.trim() || 'پروژهٔ بی‌نام'}</p>
          <p className="text-[11px] leading-relaxed" style={{ color: INK_SOFT }}>{scopeLabels(draft).map((l) => l.replace(/\d+/g, (d) => toFa(d))).join(' · ') || 'هیچ بخشی انتخاب نشده'}</p>
          {error && <p className="text-xs font-semibold" role="alert" style={{ color: '#e66767' }}>{error}</p>}
          <div className="flex justify-end gap-2 mt-auto pt-2">
            <Btn kind="quiet" onClick={onClose}>انصراف</Btn>
            <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'در حال ایجاد…' : <>ایجاد و ورود مشخصات <ArrowLeft size={14} /></>}</Btn>
          </div>
        </div>
      </div>
    </section>
  )
}

function ScopeTile({ on, onClick, icon, color, label }: { on: boolean; onClick: () => void; icon: ReactNode; color: string; label: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`est-tile ${on ? 'is-on' : ''}`} style={{ ['--c' as string]: color }}>
      <span className="est-tile-check" aria-hidden><Check size={11} /></span>
      <span className="est-tile-icon">{icon}</span>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="est-stat est-fade-in">
      <span style={{ color: SAFETY }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px]" style={{ color: MUTED_FG }}>{label}</div>
        <div className="est-mono text-lg font-bold truncate" style={{ color: INK }}>{value}</div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><i style={{ background: color }} />{label}</span>
}

function Badge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: SURFACE_2, color: INK_SOFT, border: `1px solid ${BORDER}` }}>
      {icon} {label}
    </span>
  )
}

const PAGE_STYLE = `
  .est-hero { display: grid; gap: 1.5rem; grid-template-columns: 1fr; align-items: center; padding: 1.6rem; border-radius: 22px; border: 1px solid ${BORDER};
    background: radial-gradient(120% 140% at 0% 0%, rgba(57,135,229,.12), transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(242,183,5,.08), transparent 60%), ${SURFACE}; }
  @media (min-width: 900px) { .est-hero { grid-template-columns: 1.05fr 1fr; padding: 2rem 2.2rem; } }
  .est-eyebrow { display: inline-flex; align-items: center; gap: .4rem; font-size: 11px; font-weight: 700; color: ${SAFETY}; background: rgba(242,183,5,.08); border: 1px solid rgba(242,183,5,.25); padding: .25rem .6rem; border-radius: 99px; }
  .est-hero h1 { font-size: clamp(1.5rem, 2.6vw, 2.15rem); font-weight: 900; line-height: 1.35; letter-spacing: -.01em; color: ${INK}; margin: .8rem 0 .6rem; }
  .est-hero p { font-size: 13px; line-height: 2; color: ${INK_SOFT}; max-width: 60ch; }
  .est-flow-steps { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
  .est-flow-steps li { display: inline-flex; align-items: center; gap: .45rem; font-size: 12px; color: ${INK_SOFT}; padding: .3rem .7rem .3rem .4rem; border-radius: 99px; background: rgba(255,255,255,.03); border: 1px solid ${BORDER}; }
  .est-flow-steps b { width: 20px; height: 20px; border-radius: 99px; display: grid; place-items: center; background: ${SAFETY}; color: #1A1400; font-size: 11px; }
  .est-hero-art { border-radius: 16px; border: 1px solid ${BORDER}; background: rgba(10,18,28,.55); padding: .6rem .8rem .8rem; }
  .est-legend { display: flex; flex-wrap: wrap; gap: .4rem .9rem; justify-content: center; font-size: 10.5px; color: ${MUTED_FG}; }
  .est-legend i { width: 8px; height: 8px; border-radius: 99px; display: inline-block; }

  .est-stat { display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border-radius: 14px; background: ${SURFACE}; border: 1px solid ${BORDER}; }

  .est-search { display: flex; align-items: center; gap: .4rem; color: ${MUTED_FG}; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 10px; padding: .45rem .7rem; min-width: 220px; }
  .est-search input { background: transparent; outline: none; color: ${INK}; font-size: 12px; flex: 1; }
  .est-search:focus-within { border-color: ${SAFETY}; }

  .est-empty { display: grid; justify-items: center; gap: .6rem; text-align: center; padding: 2.2rem 1rem; border-radius: 20px; border: 1px dashed ${BORDER}; background: ${SURFACE}; }
  .est-empty svg { max-width: 320px; }

  .est-pcard { position: relative; border-radius: 18px; background: ${SURFACE}; border: 1px solid ${BORDER}; overflow: hidden; transition: border-color .2s ease, box-shadow .25s ease, transform .25s var(--ease); }
  @media (hover: hover) and (pointer: fine) { .est-pcard:hover { border-color: #2c4058; box-shadow: 0 22px 40px -28px rgba(0,0,0,.9); transform: translateY(-2px); } }
  .est-pcard-main { display: block; width: 100%; text-align: right; }
  .est-pcard-art { background: linear-gradient(180deg, rgba(57,135,229,.07), transparent); border-bottom: 1px solid ${BORDER}; padding: .2rem .4rem 0; }
  .est-pcard:not(:hover) .est-route * { animation-play-state: paused !important; }
  .est-pcard .est-arrow { transition: transform .25s var(--ease); }
  @media (hover: hover) and (pointer: fine) { .est-pcard:hover .est-arrow { transform: translateX(-4px); } }
  .est-pcard-del { position: absolute; left: .6rem; top: .6rem; padding: .45rem; border-radius: 9px; color: ${MUTED_FG}; background: rgba(10,18,28,.7); transition: opacity .15s ease, color .15s ease; }
  @media (hover: hover) and (pointer: fine) { .est-pcard-del:hover { color: #e66767; } }
  @media (hover: hover) { .est-pcard-del { opacity: 0; } .est-pcard:hover .est-pcard-del, .est-pcard-del:focus-visible { opacity: 1; } }

  .est-create { padding: 1.4rem; border-radius: 20px; background: ${SURFACE}; border: 1px solid rgba(242,183,5,.35); box-shadow: 0 0 0 4px rgba(242,183,5,.05); }
  .est-create-preview { display: flex; flex-direction: column; gap: .5rem; padding: 1rem; border-radius: 16px; background: rgba(10,18,28,.6); border: 1px solid ${BORDER}; min-height: 100%; }
  .est-preset { text-align: right; padding: .6rem .75rem; border-radius: 12px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; transition: border-color .15s ease, transform .14s var(--ease); display: grid; gap: .15rem; }
  .est-preset b { font-size: 12px; color: ${INK}; }
  .est-preset span { font-size: 10.5px; color: ${MUTED_FG}; }
  .est-preset:active { transform: scale(.98); }
  .est-preset.is-on { border-color: ${SAFETY}; background: rgba(242,183,5,.07); }
  .est-tile { position: relative; display: grid; justify-items: center; gap: .4rem; padding: .85rem .5rem; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${MUTED_FG}; transition: border-color .15s ease, color .15s ease, background .15s ease, transform .14s var(--ease); }
  .est-tile:active { transform: scale(.97); }
  .est-tile-icon { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: rgba(255,255,255,.04); transition: background .2s ease, color .2s ease; }
  .est-tile.is-on { color: ${INK}; border-color: var(--c); background: color-mix(in srgb, var(--c) 9%, ${SURFACE_2}); }
  .est-tile.is-on .est-tile-icon { background: var(--c); color: #fff; }
  .est-tile-check { position: absolute; top: .4rem; left: .4rem; width: 16px; height: 16px; border-radius: 99px; display: grid; place-items: center; background: var(--c); color: #fff; opacity: 0; transform: scale(.6); transition: opacity .18s ease, transform .22s var(--ease); }
  .est-tile.is-on .est-tile-check { opacity: 1; transform: scale(1); }
`
