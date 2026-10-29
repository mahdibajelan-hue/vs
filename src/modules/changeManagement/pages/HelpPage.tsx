import { CM_HELP } from '../lib/help'

const FLOW = [
  ['۱ · ثبت', 'درخواست‌کننده نوع، شرح، دلیل و اثر مالی و زمانی تغییر را ثبت و ارسال می‌کند.'], ['۲ · ارزیابی', 'مسئولان فنی، قراردادی و اجرایی آثار تغییر را بررسی می‌کنند و ارزیابی را تکمیل می‌کنند.'],
  ['۳ · تعیین مسیر', 'سامانه مسیر تصویب را بر پایهٔ ماتریس اختیارات، با توجه به درصد جاری و تجمعی، مدت و نوع تغییر تعیین می‌کند. اگر قاعدهٔ مناسبی وجود نداشته باشد یا قواعد با هم تعارض داشته باشند، درخواست متوقف می‌شود.'], ['۴ · تصویب', 'هر مرجع در نوبت خود نظر یا تصمیم خود را ثبت می‌کند و تاریخ و نام کاربر همراه آن نگهداری می‌شود.'],
  ['۵ · اجرا', 'پس از تصویب، مسئول و مهلت اجرا تعیین و اجرا پیگیری می‌شود. اجرای تغییر پیش از تصویب فقط با مجوز استثنا مجاز است.'], ['۶ · نتیجه و بستن', 'هزینه و تأخیر واقعی ثبت می‌شود، انطباق آن با مصوبه کنترل می‌شود و درخواست بسته می‌شود.'],
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
