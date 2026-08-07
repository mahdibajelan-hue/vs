export function AboutPage() {
  return (
    <div>
      <div className="im-topbar">
        <div>
          <div className="im-page-title">درباره ما</div>
          <div className="im-page-sub">درباره سامانه رصد</div>
        </div>
      </div>
      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">درباره رصد</div>
        <div style={{ fontSize: 13.5, color: 'var(--im-muted-2)', lineHeight: 2 }}>
          رصد یک سامانه‌ی سبک برای پیگیری مشکلات پروژه‌هاست؛ برای هر مشکل، مسئول انجام، مسئول تایید و مهلت اقدام تعریف می‌شود و گزارش تاخیرها به‌صورت خودکار و لحظه‌ای تهیه می‌شود.
        </div>
      </div>
      <div className="im-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="im-id-pill" style={{ margin: 0, flexShrink: 0 }}>
          م
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>توسعه‌دهنده: مهدی باجلان</div>
          <div style={{ fontSize: 12.5, color: 'var(--im-muted)', marginTop: 4 }}>
            ایمیل:{' '}
            <a href="mailto:mahdi.bajelan@gmail.com" style={{ color: 'var(--im-amber)' }}>
              mahdi.bajelan@gmail.com
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
