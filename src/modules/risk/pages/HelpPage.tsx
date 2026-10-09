import { useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { RK_HELP } from '../lib/help'

const ORDER: (keyof typeof RK_HELP)[] = ['hub', 'form', 'register', 'drawer', 'assessment', 'response', 'monitoring', 'kri', 'dashboard', 'portfolio', 'assistant', 'integration', 'alerts', 'reports', 'kpi', 'settings']

/** The whole guide on one page (each section also has its own «راهنما» button). */
export function HelpPage() {
  const [q, setQ] = useState('')
  const topics = ORDER.map((k) => ({ k, ...RK_HELP[k] })).filter((t) => !q.trim() || JSON.stringify(t).includes(q.trim()))
  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title"><BookOpen size={22} style={{ color: 'var(--im-muted-2)' }} />راهنمای مدیریت ریسک</div><div className="im-page-sub">آموزش هر بخش؛ در هر صفحه دکمهٔ «راهنما» همین توضیح را کنار کار شما باز می‌کند</div></div></div>
      <div style={{ position: 'relative', marginBottom: 14 }}><Search size={14} style={{ position: 'absolute', right: 11, top: 12, color: 'var(--im-muted)' }} /><input style={{ paddingInlineStart: 32 }} placeholder="جستجو در راهنما…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو در راهنما" /></div>
      <div className="im-notice info" style={{ marginBottom: 14 }}><b>اصل راهنما:</b> موفقیت مدیریت ریسک با تعداد ریسک‌های ثبت‌شده سنجیده نمی‌شود؛ با توانایی در کاهش مواجهه، جلوگیری از تحقق تهدیدها، افزایش آمادگی پروژه و کمک به تصمیم‌گیری به‌موقع. تکمیل یک اقدام به‌تنهایی ریسک را کم نمی‌کند — اثر باید با ارزیابی مجدد یا شاهد تأیید شود.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        {topics.map((t) => (
          <section key={t.k} className="im-card" aria-label={t.title}>
            <div className="im-section-title">{t.title}</div>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13, lineHeight: 1.9 }}>{t.purpose}</p>
            {'steps' in t && t.steps && <><h4 style={{ margin: '8px 0 4px', fontSize: 12 }}>روش کار</h4><ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.9 }}>{t.steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
            {'how' in t && t.how && <><h4 style={{ margin: '8px 0 4px', fontSize: 12 }}>چطور حساب می‌شود</h4><ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.9 }}>{t.how.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {'tips' in t && t.tips && <><h4 style={{ margin: '8px 0 4px', fontSize: 12 }}>نکته</h4><ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.9 }}>{t.tips.map((s) => <li key={s}>{s}</li>)}</ul></>}
          </section>
        ))}
        {topics.length === 0 && <div className="im-empty">موردی یافت نشد.</div>}
      </div>
    </div>
  )
}
