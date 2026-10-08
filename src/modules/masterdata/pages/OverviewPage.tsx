import { ArrowLeft, Check } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PageHead, faNum } from '../components/md'

export type NavTarget = 'organizations' | 'portfolios' | 'programs' | 'projects' | 'parties'

/** The set-up path in the order the data depends on itself, with what is done and what is next. */
export function OverviewPage({ go }: { go: (t: NavTarget) => void }) {
  const orgs = useMasterDataStore((s) => s.organizations)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const parties = useMasterDataStore((s) => s.parties)
  const team = useMasterDataStore((s) => s.team)

  const withParties = projects.filter((p) => ['employer', 'contractor'].every((r) => parties.some((x) => x.projectId === p.id && x.role === r))).length
  const withTeam = projects.filter((p) => team.some((t) => t.projectId === p.id && t.positionKey === 'project_manager') && team.some((t) => t.projectId === p.id && t.positionKey === 'executive') && p.description.trim()).length
  const steps: { n: number; title: string; text: string; done: boolean; meta: string; target: NavTarget }[] = [
    { n: 1, title: 'شرکت‌ها و سازمان‌ها', text: 'کارفرما، پیمانکار و مشاورها را یک‌بار تعریف کنید.', done: orgs.length > 0, meta: `${faNum(orgs.length)} سازمان`, target: 'organizations' },
    { n: 2, title: 'پورتفولیوها', text: 'بالاترین سطح گروه‌بندی پروژه‌ها.', done: portfolios.length > 0, meta: `${faNum(portfolios.length)} پورتفولیو`, target: 'portfolios' },
    { n: 3, title: 'طرح‌ها', text: 'هر طرح زیر یک پورتفولیو قرار می‌گیرد.', done: programs.length > 0, meta: `${faNum(programs.length)} طرح`, target: 'programs' },
    { n: 4, title: 'پروژه‌ها', text: 'پروژه‌ها را زیر طرح‌ها بسازید.', done: projects.length > 0, meta: `${faNum(projects.length)} پروژه`, target: 'projects' },
    { n: 5, title: 'ارکان هر پروژه', text: 'کارفرما، پیمانکار، مشاور طراحی و مشاور نظارت هر پروژه را مشخص کنید.', done: projects.length > 0 && withParties === projects.length, meta: `${faNum(withParties)} از ${faNum(projects.length)} پروژه`, target: 'parties' },
    { n: 6, title: 'شناسنامه و ساختار پروژه', text: 'شرح مختصر، مجری طرح، مدیر پروژه و بقیهٔ ساختار منابع انسانی.', done: projects.length > 0 && withTeam === projects.length, meta: `${faNum(withTeam)} از ${faNum(projects.length)} پروژه`, target: 'projects' },
  ]
  const next = steps.find((s) => !s.done)
  return (
    <div className="mx-auto max-w-[860px]">
      <PageHead title="راه‌اندازی داده‌های پایه" hint="شش گام به همین ترتیب؛ هر گام بر پایهٔ قبلی ساخته می‌شود." />
      <ol className="md-panel m-0 list-none overflow-hidden p-0">
        {steps.map((s, i) => {
          const current = next?.n === s.n
          return (
            <li key={s.n} className="md-in" style={{ '--i': i } as React.CSSProperties}>
              <button className="md-row" style={{ background: current ? 'var(--md-accent-soft)' : undefined }} onClick={() => go(s.target)}>
                <span className="md-avatar md-num" data-round aria-hidden style={s.done ? { background: 'var(--md-accent)', color: 'var(--md-accent-ink)', borderColor: 'transparent' } : undefined}>{s.done ? <Check size={16} strokeWidth={2.6} /> : faNum(s.n)}</span>
                <span className="min-w-0 flex-1"><b className="block text-[14px]">{s.title}</b><span className="md-eyebrow block">{s.text}</span></span>
                <span className="md-eyebrow md-num shrink-0">{s.meta}</span>
                <ArrowLeft size={15} aria-hidden style={{ color: 'var(--md-ink-3)' }} />
              </button>
            </li>
          )
        })}
      </ol>
      {next ? <p className="md-eyebrow mt-4">گام بعدی: {next.title}.</p> : <p className="md-eyebrow mt-4">همهٔ گام‌ها کامل است.</p>}
    </div>
  )
}
