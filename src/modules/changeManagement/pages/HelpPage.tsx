import { CM_HELP } from '../lib/help'

const FLOW = [
  ['۱ · ثبت', 'درخواست‌کننده نوع، شرح، دلیل و اثر مالی/زمانی را ثبت و ارسال می‌کند.'], ['۲ · ارزیابی', 'مسئولان فنی/قراردادی/اجرایی آثار را بررسی و ارزیابی را کامل می‌کنند.'],
  ['۳ · تعیین مسیر', 'سامانه از ماتریس اختیارات مسیر را تعیین می‌کند (درصد جاری و تجمعی، مدت، نوع). اگر قاعده نباشد یا تعارض داشته باشد، متوقف می‌شود.'], ['۴ · تصویب', 'هر مرجع در نوبت خودش نظر یا تصمیم می‌دهد؛ همه با تاریخ و کاربر ثبت می‌شود.'],
  ['۵ · اجرا', 'پس از تصویب، مسئول و مهلت تعیین و اجرا پیگیری می‌شود. اجرای پیش از تصویب فقط با مجوز استثنا.'], ['۶ · نتیجه و بستن', 'هزینه و تأخیر واقعی ثبت، انطباق با مصوبه کنترل و درخواست بسته می‌شود.'],
]

export function HelpPage() {
  const topics = Object.values(CM_HELP).filter((t) => t.title)
  return (
    <div className="im-page" style={{ display: 'grid', gap: 14 }}>
      <div><div className="im-page-title">راهنمای مدیریت تغییرات</div><div className="im-page-sub">جریان کار و توضیح هر بخش</div></div>
      <div className="im-card"><div className="im-section-title">جریان کار</div><div className="im-grid" style={{ gap: 8 }}>{FLOW.map(([t, d]) => <div key={t} className="im-card-flat"><b style={{ fontSize: 13 }}>{t}</b><div style={{ fontSize: 12.5, lineHeight: 1.9 }}>{d}</div></div>)}</div></div>
      {topics.map((t) => (
        <div key={t.title} className="im-card"><div className="im-section-title">{t.title}</div><p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.9 }}>{t.purpose}</p>
          {'steps' in t && t.steps && <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 12.5, lineHeight: 2 }}>{t.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
          {'tips' in t && t.tips && <div className="cm-note" style={{ marginTop: 8 }}><div>{t.tips.map((s) => <div key={s}>• {s}</div>)}</div></div>}
        </div>
      ))}
    </div>
  )
}
