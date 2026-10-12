import { Term } from './Term'

/** One small table that says which record to use for which situation, so «خروج برای مصرف», «ضایعات» and «تعدیل» are never mixed up. */
export function StockConcepts({ open = false }: { open?: boolean }) {
  const rows: [string, string, string, string][] = [
    ['کالا را برای کار مصرف می‌کنم', 'requisition', 'درخواست و مجوز خروج', 'موجودی کم می‌شود؛ در «مصرف» دیده می‌شود'],
    ['کالا را از یک انبار به انبار دیگر می‌برم', 'transfer', 'انتقال', 'فقط محل عوض می‌شود؛ مجموع ثابت است'],
    ['کالای خارج‌شده مصرف نشد و برمی‌گردد', 'return', 'برگشت به انبار', 'موجودی زیاد و مصرف خالص کم می‌شود'],
    ['کالا تلف، شکسته یا غیرقابل‌استفاده شد', 'scrap', 'ضایعات', 'با علت و تأیید از موجودی کم می‌شود'],
    ['شمارش انبار با دفتر نمی‌خواند', 'adjust', 'تعدیل موجودی', 'اصلاح دفتر با علت و تأیید؛ نه برای مصرف'],
    ['کالا از تأمین‌کننده رسید', 'receipt', 'رسید و بازرسی ورودی', 'پس از «پذیرفته» موجودی قابل‌مصرف می‌شود'],
  ]
  return (
    <details className="mt-concepts no-print" open={open}>
      <summary>کدام را کی استفاده کنم؟ (فرق مجوز خروج، ضایعات، تعدیل و انتقال)</summary>
      <table><thead><tr><th>وضعیت</th><th>ثبت کنید</th><th>اثر</th></tr></thead>
        <tbody>{rows.map(([when, k, what, effect]) => <tr key={k}><td>{when}</td><td><b><Term k={k}>{what}</Term></b></td><td>{effect}</td></tr>)}</tbody></table>
    </details>
  )
}
