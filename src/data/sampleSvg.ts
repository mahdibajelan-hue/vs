export interface SampleLineMeta {
  svgElementId: string
  size: string
  spec: string
  service: string
  contractor: string
  plannedLength: number
  totalWelds: number
}

export const SAMPLE_LINES: SampleLineMeta[] = [
  { svgElementId: 'L-1001-6-A1A', size: '6"', spec: 'A1A', service: 'گاز ترش', contractor: 'پیمانکار الف', plannedLength: 42, totalWelds: 14 },
  { svgElementId: 'L-1002-4-B2B', size: '4"', spec: 'B2B', service: 'کندانسیت', contractor: 'پیمانکار الف', plannedLength: 28, totalWelds: 9 },
  { svgElementId: 'L-1003-8-A1A', size: '8"', spec: 'A1A', service: 'گاز شیرین', contractor: 'پیمانکار ب', plannedLength: 55, totalWelds: 18 },
  { svgElementId: 'L-1004-2-C1C', size: '2"', spec: 'C1C', service: 'یوتیلیتی', contractor: 'پیمانکار ب', plannedLength: 16, totalWelds: 6 },
  { svgElementId: 'L-1005-10-A1A', size: '10"', spec: 'A1A', service: 'گاز خروجی', contractor: 'پیمانکار الف', plannedLength: 63, totalWelds: 20 },
  { svgElementId: 'L-1006-3-B2B', size: '3"', spec: 'B2B', service: 'درین', contractor: 'پیمانکار ج', plannedLength: 21, totalWelds: 7 },
  { svgElementId: 'L-1007-12-A1A', size: '12"', spec: 'A1A', service: 'خط اصلی', contractor: 'پیمانکار الف', plannedLength: 71, totalWelds: 24 },
  { svgElementId: 'L-1008-4-C1C', size: '4"', spec: 'C1C', service: 'آب آتش‌نشانی', contractor: 'پیمانکار ج', plannedLength: 34, totalWelds: 11 },
]

export function generateSampleSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 760" font-family="Vazirmatn, sans-serif">
  <defs>
    <linearGradient id="vesselGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="760" fill="none"/>

  <g id="equip-vessel-v101">
    <ellipse cx="150" cy="560" rx="26" ry="46" fill="url(#vesselGrad)" stroke="#1e293b" stroke-width="2"/>
    <rect x="124" y="560" width="52" height="130" fill="url(#vesselGrad)" stroke="#1e293b" stroke-width="2"/>
    <ellipse cx="150" cy="690" rx="26" ry="12" fill="#475569" stroke="#1e293b" stroke-width="2"/>
    <text x="150" y="720" text-anchor="middle" font-size="14" fill="#64748b">V-101</text>
  </g>

  <g id="equip-pump-p101">
    <rect x="1080" y="640" width="90" height="46" rx="6" fill="#475569" stroke="#1e293b" stroke-width="2"/>
    <circle cx="1125" cy="663" r="16" fill="#64748b" stroke="#1e293b" stroke-width="2"/>
    <text x="1125" y="705" text-anchor="middle" font-size="14" fill="#64748b">P-101</text>
  </g>

  <g id="equip-manifold">
    <rect x="980" y="120" width="16" height="220" fill="#475569" stroke="#1e293b" stroke-width="2"/>
    <text x="988" y="110" text-anchor="middle" font-size="14" fill="#64748b">MANIFOLD</text>
  </g>

  <path id="L-1001-6-A1A" d="M 176 540 L 260 494 L 340 494 L 420 448 L 420 300 L 500 254 L 620 254"
        fill="none" stroke="#94a3b8" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="330" y="470" font-size="13" fill="#94a3b8">L-1001-6"-A1A</text>

  <path id="L-1002-4-B2B" d="M 176 610 L 250 610 L 330 564 L 420 564 L 500 518 L 620 518"
        fill="none" stroke="#94a3b8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="330" y="592" font-size="13" fill="#94a3b8">L-1002-4"-B2B</text>

  <path id="L-1003-8-A1A" d="M 620 254 L 700 254 L 780 208 L 860 208 L 940 162 L 980 162"
        fill="none" stroke="#94a3b8" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="740" y="230" font-size="13" fill="#94a3b8">L-1003-8"-A1A</text>

  <path id="L-1004-2-C1C" d="M 620 518 L 680 518 L 760 472 L 840 472 L 900 440 L 900 340 L 980 294"
        fill="none" stroke="#94a3b8" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="700" y="500" font-size="13" fill="#94a3b8">L-1004-2"-C1C</text>

  <path id="L-1005-10-A1A" d="M 420 300 L 500 346 L 580 346 L 660 392 L 740 392 L 820 438 L 900 438 L 980 438"
        fill="none" stroke="#94a3b8" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="620 " y="420" font-size="13" fill="#94a3b8">L-1005-10"-A1A</text>

  <path id="L-1006-3-B2B" d="M 260 494 L 260 400 L 340 354 L 420 354"
        fill="none" stroke="#94a3b8" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="230" y="430" font-size="13" fill="#94a3b8">L-1006-3"-B2B</text>

  <path id="L-1007-12-A1A" d="M 980 220 L 900 220 L 820 266 L 740 266 L 660 220 L 580 220 L 500 174 L 420 174 L 340 220 L 260 220 L 200 254"
        fill="none" stroke="#94a3b8" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="560" y="200" font-size="13" fill="#94a3b8">L-1007-12"-A1A (MAIN)</text>

  <path id="L-1008-4-C1C" d="M 1125 640 L 1125 560 L 1060 560 L 1060 480 L 1000 480 L 1000 400 L 980 400"
        fill="none" stroke="#94a3b8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="1010" y="540" font-size="13" fill="#94a3b8">L-1008-4"-C1C</text>
</svg>`
}
