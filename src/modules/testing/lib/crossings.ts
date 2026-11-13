/** Crossings whose pipe is pre-tested before it is installed (IGS: test pressure = factor × design pressure, held for hours). */
export const CROSSING_FA: Record<string, string> = {
  road: 'عبور از جاده', railway: 'عبور از راه‌آهن', river: 'عبور از رودخانه', wadi: 'عبور از مسیل', canal: 'عبور از کانال آب',
  pipeline: 'تقاطع با خط لوله', hdd: 'حفاری افقی (HDD)', other: 'سایر قطعات',
}
export const CROSSINGS = Object.keys(CROSSING_FA)
