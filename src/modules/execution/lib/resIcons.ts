import { Ambulance, Anchor, BadgeCheck, Bed, Briefcase, Bus, Cable, Camera, ChefHat, Compass, Construction, Container, Drill, Droplets, Factory, Flame, Fuel, Gauge, HardHat, Hammer, Lightbulb, Monitor, Mountain, Package, PaintRoller, Pickaxe, Printer, Radiation, Ruler, Satellite, Shield, ShieldCheck, Shovel, SprayCan, Stethoscope, Toolbox, Tractor, Truck, Users, Warehouse, Wrench, Zap, Car, Building2, type LucideIcon } from 'lucide-react'

/** First rule whose words occur in the name wins; the last rule of each list is the fallback. */
const MAN: [string, LucideIcon][] = [
  ['جوشکار', Flame], ['فیتر', Wrench], ['QC', BadgeCheck], ['HSE', ShieldCheck], ['بهیار', Stethoscope], ['نگهبان', Shield], ['آشپز', ChefHat], ['آشیز', ChefHat], ['برقکار', Zap],
  ['ریگر', Anchor], ['نقشه', Compass], ['رادیو', Radiation], ['عایق', PaintRoller], ['سندبلاست', SprayCan], ['آرماتور', Hammer], ['قالب', Hammer], ['بتن', Construction], ['اپراتور', Cable],
  ['جرثقیل', Construction], ['تراکتور', Tractor], ['تریلی', Truck], ['کامیون', Truck], ['سایدبوم', Tractor], ['بیل', Shovel], ['لودر', Tractor], ['بولدوزر', Tractor], ['گریدر', Tractor], ['پی‌ولدر', Tractor], ['راننده', Car],
  ['انبار', Warehouse], ['مکانیک', Wrench], ['کنترل پروژه', Gauge], ['دفتر', Briefcase], ['رئیس', HardHat], ['سرپرست', HardHat], ['کارشناس', BadgeCheck], ['کارگر', Pickaxe],
]
const EQUIP: [string, LucideIcon][] = [
  ['آمبولانس', Ambulance], ['مینی‌بوس', Bus], ['خوابگاه', Bed], ['کانکس', Container], ['پرینتر', Printer], ['کامپیوتر', Monitor], ['کپی', Printer], ['دفتر', Briefcase], ['GPS', Satellite], ['دوربین', Camera],
  ['تانکر', Fuel], ['آب‌پاش', Droplets], ['کارواش', Droplets], ['خودرو', Car], ['سواری', Car], ['وانت', Car], ['تریلی', Truck], ['کامیون', Truck], ['کمپرسی', Truck], ['کفی', Truck], ['بول ماشین', Truck],
  ['ساید', Tractor], ['تراکتور', Tractor], ['بلدوزر', Tractor], ['گریدر', Tractor], ['لودر', Tractor], ['بیل', Shovel], ['چکش', Hammer], ['جرثقیل', Construction], ['پی‌ولدر', Tractor], ['کف‌جوش', Flame],
  ['جوش', Flame], ['سرپیک', Flame], ['گاز', Flame], ['رکتی', Zap], ['ژنراتور', Zap], ['موتور', Zap], ['کمپرسور', Cable], ['سندبلاست', SprayCan], ['نازل', SprayCan], ['هالیدی', Lightbulb], ['پمپ', Gauge],
  ['فشارسنج', Gauge], ['ثبات', Gauge], ['کراولر', Radiation], ['رادیو', Radiation], ['چشمه', Radiation], ['سورس', Radiation], ['TDL', Radiation], ['آون', Package], ['دستگاه', Drill],
]
const SECTION: [string, LucideIcon][] = [
  ['ستادی', Briefcase], ['کارفرما', Building2], ['نقشه', Compass], ['مسیرسازی', Tractor], ['ریسه', Truck], ['حمل', Truck], ['جوشکاری', Flame], ['حفاری', Shovel], ['رادیو', Radiation], ['سندبلاست', SprayCan],
  ['عایق', PaintRoller], ['خاک', Mountain], ['بکفیل', Mountain], ['لوله‌گذاری', Ruler], ['فیبر', Cable], ['CCW', Construction], ['هیدرواستاتیک', Gauge], ['ایستگاه', Factory],
]
const pick = (list: [string, LucideIcon][], name: string, fallback: LucideIcon): LucideIcon => list.find(([w]) => name.includes(w))?.[1] ?? fallback
export const iconForRole = (name: string, kind: 'man' | 'equip'): LucideIcon => (kind === 'man' ? pick(MAN, name, Users) : pick(EQUIP, name, Toolbox))
export const iconForSection = (name: string): LucideIcon => pick(SECTION, name, Toolbox)
export { HardHat, Truck, Users }
