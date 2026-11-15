import { create } from 'zustand'
import * as repo from '../repo'
import type { Caps, Decision, DecisionKind, Prefill, Study, Version } from '../repo'
import type { Answers } from '../lib/questions'
import type { Result, Weights } from '../lib/engine'

type Flash = { tone: 'ok' | 'err'; text: string } | null
const NO_CAPS: Caps = { view: false, create: false, edit: false, submit: false, approve: false, export: false, configure: false, admin: false }

interface DsState {
  projectId: string | null
  loading: boolean; error: string | null; flash: Flash; busy: boolean
  studies: Study[]; versions: Version[]; decisions: Decision[]; caps: Caps
  pre: Prefill | null
  activeId: string | null
  /** the draft being edited (answers and the user's own weights; null weights = the defaults derived from the answers) */
  draft: { answers: Answers; weights: Partial<Weights> | null; sources: Record<string, string> } | null
  dirty: boolean
  load: (pid: string) => Promise<void>
  open: (id: string | null) => void
  setAnswer: (k: string, v: Answers[string]) => void
  setWeights: (w: Partial<Weights> | null) => void
  create: (title: string, from?: Answers) => Promise<string | null>
  saveDraft: () => Promise<boolean>
  saveVersion: (result: Result, weights: Weights, note: string) => Promise<boolean>
  decide: (d: DecisionKind, method: string | null, pricing: string[], procurement: string[], execution: string[], rationale: string) => Promise<boolean>
  applyToLifecycle: (strategy: string) => Promise<boolean>
  narrate: (v: Version, items: { id: string; text: string }[]) => Promise<void>
  clearFlash: () => void
}

export const useDsStore = create<DsState>()((set, get) => {
  const fail = (e: unknown) => { set({ busy: false, flash: { tone: 'err', text: repo.explain(e) } }); return false }
  const refresh = async () => { const pid = get().projectId; if (!pid) return; const d = await repo.loadAll(pid); set({ ...d }) }
  const draftOf = (s: Study | undefined, pre: Prefill | null) => s ? { answers: { ...(pre?.answers ?? {}), ...s.answers }, weights: s.weights, sources: { ...(pre?.sources ?? {}), ...s.sources } } : null
  return {
    projectId: null, loading: false, error: null, flash: null, busy: false,
    studies: [], versions: [], decisions: [], caps: NO_CAPS, pre: null, activeId: null, draft: null, dirty: false,
    async load(pid) {
      set({ projectId: pid, loading: true, error: null })
      try {
        const [d, caps, pre] = await Promise.all([repo.loadAll(pid), repo.loadCaps(pid), repo.prefill(pid).catch(() => null)])
        const keep = get().activeId && d.studies.some((s) => s.id === get().activeId) ? get().activeId : d.studies[0]?.id ?? null
        set({ ...d, caps, pre, loading: false, activeId: keep, draft: draftOf(d.studies.find((s) => s.id === keep), pre), dirty: false })
      } catch (e) { set({ loading: false, error: repo.explain(e) }) }
    },
    open(id) { const s = get().studies.find((x) => x.id === id); set({ activeId: id, draft: draftOf(s, get().pre), dirty: false }) },
    setAnswer(k, v) { const d = get().draft; if (!d) return; const sources = { ...d.sources }; delete sources[k]; set({ draft: { ...d, answers: { ...d.answers, [k]: v }, sources }, dirty: true }) },
    setWeights(w) { const d = get().draft; if (!d) return; set({ draft: { ...d, weights: w }, dirty: true }) },
    async create(title, from) {
      const { projectId: pid, pre } = get(); if (!pid) return null
      set({ busy: true })
      try {
        const answers = from ?? pre?.answers ?? {}, sources = from ? {} : pre?.sources ?? {}
        const id = await repo.saveStudy(null, pid, title, answers, null, sources)
        await refresh(); get().open(id); set({ busy: false, flash: { tone: 'ok', text: 'مطالعهٔ جدید ساخته شد؛ اطلاعات موجود پروژه و ریسک‌ها پیش‌پر شده است.' } })
        return id
      } catch (e) { fail(e); return null }
    },
    async saveDraft() {
      const { activeId, draft, projectId: pid, studies } = get(); if (!activeId || !draft || !pid) return false
      set({ busy: true })
      try {
        await repo.saveStudy(activeId, pid, studies.find((s) => s.id === activeId)?.title ?? '', draft.answers, draft.weights, draft.sources)
        await refresh(); set({ busy: false, dirty: false, flash: { tone: 'ok', text: 'پیش‌نویس ذخیره شد.' } }); return true
      } catch (e) { return fail(e) }
    },
    async saveVersion(result, weights, note) {
      const { activeId, draft } = get(); if (!activeId || !draft) return false
      set({ busy: true })
      try {
        await repo.saveVersion(activeId, draft.answers, weights, result, note)
        // the study keeps whether the weights were the user's or the defaults (the version keeps the numbers used), and the sources of its answers
        const pid = get().projectId!, title = get().studies.find((s) => s.id === activeId)?.title ?? ''
        await repo.saveStudy(activeId, pid, title, draft.answers, draft.weights, draft.sources)
        await refresh(); set({ busy: false, dirty: false, flash: { tone: 'ok', text: 'نسخهٔ جدید تحلیل ثبت شد (ورودی‌ها، وزن‌ها و نتیجه، غیرقابل‌تغییر).' } }); return true
      } catch (e) { return fail(e) }
    },
    async decide(d, method, pricing, procurement, execution, rationale) {
      const { activeId } = get(); if (!activeId) return false
      set({ busy: true })
      try {
        await repo.decide(activeId, d, method, pricing, procurement, execution, rationale)
        await refresh(); get().open(activeId)
        const msg: Record<DecisionKind, string> = { submitted: 'برای تصمیم مدیریت ارسال شد.', approve: 'راهبرد تصویب شد.', approve_override: 'راهبرد با تصمیم متفاوت مدیریت تصویب شد.', return: 'برای اصلاح برگشت داده شد.', reject: 'مطالعه رد شد.', reopen: 'مطالعه برای بازبینی بازگشایی شد.' }
        set({ busy: false, flash: { tone: 'ok', text: msg[d] } }); return true
      } catch (e) { return fail(e) }
    },
    async applyToLifecycle(strategy) {
      const { activeId } = get(); if (!activeId) return false
      set({ busy: true })
      try { await repo.applyToLifecycle(activeId, strategy); await refresh(); set({ busy: false, flash: { tone: 'ok', text: 'راهبرد پیشنهادی برای چرخهٔ عمر ثبت شد؛ در «مستر پلن چرخهٔ عمر» کنار انتخاب راهبرد نمایش داده می‌شود و با «اعمال به برنامه فازها» به برنامه می‌رود.' } }); return true } catch (e) { return fail(e) }
    },
    async narrate(v, items) {
      set({ busy: true })
      const n = await repo.narrate(items)
      if ('error' in n) { set({ busy: false, flash: { tone: 'err', text: n.error } }); return }
      try { await repo.saveNarrative(v.id, n); await refresh(); set({ busy: false, flash: { tone: 'ok', text: `خلاصهٔ هوشمند ساخته شد (${n.sentences.length.toLocaleString('fa-IR')} جمله با ارجاع؛ ${n.rejected.toLocaleString('fa-IR')} جملهٔ بدون پشتوانه کنار گذاشته شد).` } }) } catch (e) { fail(e) }
    },
    clearFlash() { set({ flash: null }) },
  }
})
