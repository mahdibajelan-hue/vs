export type SymbolType =
  | 'valve-gate'
  | 'valve-globe'
  | 'valve-ball'
  | 'valve-check'
  | 'valve-butterfly'
  | 'valve-control'
  | 'valve-relief'
  | 'valve-lbv-gov'
  | 'insulating-joint'
  | 'fitting-tee'
  | 'fitting-elbow-30'
  | 'fitting-elbow-45'
  | 'fitting-elbow-90'
  | 'fitting-hot-bend'
  | 'fitting-reducer'
  | 'fitting-flange'
  | 'fitting-cap'
  | 'fitting-union'
  | 'fitting-blind'
  | 'fitting-support'
  | 'equipment-ko-drum'
  | 'equipment-flare-stack'
  | 'equipment-pig-receiver'
  | 'equipment-slug-catcher'
  | 'equipment-blowdown'

export type SymbolCategory = 'valve' | 'joint' | 'fitting' | 'equipment'

export interface SymbolDef {
  type: SymbolType
  label: string
  /** Short English tag shown next to the symbol once placed on the canvas — many icons look alike at a glance. */
  shortLabel: string
  category: SymbolCategory
  markup: string
}

const S = '#64748b'
const SW = 1.6
/** Elbows/hot-bends read as faint scribbles at the default weight — thickened to stand out against the line they sit on. */
const BEND_SW = 2.6

export const SYMBOL_DEFS: Record<SymbolType, SymbolDef> = {
  'valve-gate': {
    type: 'valve-gate',
    label: 'شیر دروازه‌ای (Gate)',
    shortLabel: 'Gate',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="0" y2="-9" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="-11.5" r="2.3" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-globe': {
    type: 'valve-globe',
    label: 'شیر گلوب (Globe)',
    shortLabel: 'Globe',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="-3.5" y2="-9" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="-3.5" cy="-11.3" r="2.3" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-ball': {
    type: 'valve-ball',
    label: 'شیر توپی (Ball)',
    shortLabel: 'Ball',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="0" r="2.4" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="5" y2="-7.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-check': {
    type: 'valve-check',
    label: 'شیر یک‌طرفه (Check)',
    shortLabel: 'Check',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M -3 -3.4 L 3.4 0 L -3 3.4 Z" fill="${S}" stroke="none"/>
    `,
  },
  'valve-butterfly': {
    type: 'valve-butterfly',
    label: 'شیر پروانه‌ای (Butterfly)',
    shortLabel: 'Butterfly',
    category: 'valve',
    markup: `
      <circle cx="0" cy="0" r="6.5" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="-6.5" x2="0" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="-6.5" x2="0" y2="-10" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-control': {
    type: 'valve-control',
    label: 'شیر کنترلی (Control)',
    shortLabel: 'Control',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="0" y2="-8" stroke="${S}" stroke-width="${SW}"/>
      <rect x="-3.2" y="-13.5" width="6.4" height="5.5" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-relief': {
    type: 'valve-relief',
    label: 'شیر اطمینان (Relief/PSV)',
    shortLabel: 'PSV',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="6.5" y2="-8" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 6.5 -8 L 4.3 -11.2 M 6.5 -8 L 9.5 -9.8" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'valve-lbv-gov': {
    type: 'valve-lbv-gov',
    label: 'شیر بلاک خطی با اکچویتور گازی (LBV — GOV Actuator)',
    shortLabel: 'LBV/GOV',
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="0" y2="-6" stroke="${S}" stroke-width="${SW}"/>
      <rect x="-3.4" y="-10.5" width="6.8" height="4.5" rx="1" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="-12.7" r="1.3" fill="${S}" stroke="none"/>
    `,
  },
  'insulating-joint': {
    type: 'insulating-joint',
    label: 'اتصال عایق (Insulating Joint)',
    shortLabel: 'Ins. Joint',
    category: 'joint',
    markup: `
      <line x1="-2.3" y1="-7" x2="-2.3" y2="7" stroke="${S}" stroke-width="${SW}"/>
      <line x1="2.3" y1="-7" x2="2.3" y2="7" stroke="${S}" stroke-width="${SW}"/>
      <line x1="-2.3" y1="-7" x2="2.3" y2="7" stroke="${S}" stroke-width="1.2" stroke-dasharray="1.6 1.4"/>
    `,
  },
  'fitting-tee': {
    type: 'fitting-tee',
    label: 'سه‌راهی (Tee)',
    shortLabel: 'Tee',
    category: 'fitting',
    markup: `
      <line x1="0" y1="0" x2="0" y2="-11" stroke="${S}" stroke-width="${SW}"/>
      <line x1="-3" y1="-11" x2="3" y2="-11" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="0" r="2.1" fill="${S}" stroke="none"/>
    `,
  },
  'fitting-elbow-30': {
    type: 'fitting-elbow-30',
    label: 'زانو ۳۰ درجه (Elbow 30°)',
    shortLabel: 'Elbow 30°',
    category: 'fitting',
    markup: `
      <path d="M -13 0 L -4 0 Q -0.6 -1 4 -4.6" fill="none" stroke="${S}" stroke-width="${BEND_SW}" stroke-linecap="round"/>
    `,
  },
  'fitting-elbow-45': {
    type: 'fitting-elbow-45',
    label: 'زانو ۴۵ درجه (Elbow 45°)',
    shortLabel: 'Elbow 45°',
    category: 'fitting',
    markup: `
      <path d="M -13 0 L -4 0 Q -1.3 -1.3 2.5 -6.4" fill="none" stroke="${S}" stroke-width="${BEND_SW}" stroke-linecap="round"/>
    `,
  },
  'fitting-elbow-90': {
    type: 'fitting-elbow-90',
    label: 'زانو ۹۰ درجه (Elbow 90°)',
    shortLabel: 'Elbow 90°',
    category: 'fitting',
    markup: `
      <path d="M -13 0 L -5 0 A 5 5 0 0 1 0 -5 L 0 -13" fill="none" stroke="${S}" stroke-width="${BEND_SW}" stroke-linecap="round"/>
    `,
  },
  'fitting-hot-bend': {
    type: 'fitting-hot-bend',
    label: 'هات بند شعاع بزرگ (Hot Bend 5D/7D)',
    shortLabel: 'Hot Bend',
    category: 'fitting',
    markup: `
      <path d="M -13 5 Q -13 -13 5 -13" fill="none" stroke="${S}" stroke-width="${BEND_SW}" stroke-linecap="round"/>
    `,
  },
  'fitting-reducer': {
    type: 'fitting-reducer',
    label: 'ردیوسر (Reducer)',
    shortLabel: 'Reducer',
    category: 'fitting',
    markup: `
      <path d="M -6 -5 L 6 -2.4 L 6 2.4 L -6 5 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-flange': {
    type: 'fitting-flange',
    label: 'فلنج (Flange)',
    shortLabel: 'Flange',
    category: 'fitting',
    markup: `
      <line x1="-1.6" y1="-6.5" x2="-1.6" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
      <line x1="1.6" y1="-6.5" x2="1.6" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-cap': {
    type: 'fitting-cap',
    label: 'کپ (Cap)',
    shortLabel: 'Cap',
    category: 'fitting',
    markup: `
      <path d="M 0 -6.5 A 6.5 6.5 0 0 1 0 6.5 Z" fill="${S}" stroke="none"/>
    `,
  },
  'fitting-union': {
    type: 'fitting-union',
    label: 'یونیون (Union)',
    shortLabel: 'Union',
    category: 'fitting',
    markup: `
      <line x1="-1" y1="-5.5" x2="-1" y2="5.5" stroke="${S}" stroke-width="${SW}"/>
      <line x1="1" y1="-5.5" x2="1" y2="5.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-blind': {
    type: 'fitting-blind',
    label: 'بلایند/اسپکتاکل (Blind)',
    shortLabel: 'Blind',
    category: 'fitting',
    markup: `
      <line x1="-3.4" y1="-6.5" x2="-3.4" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="0" r="4.2" fill="${S}" stroke="none"/>
      <line x1="3.4" y1="-6.5" x2="3.4" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-support': {
    type: 'fitting-support',
    label: 'ساپورت لوله (Support)',
    shortLabel: 'Support',
    category: 'fitting',
    markup: `
      <line x1="0" y1="2" x2="0" y2="8" stroke="${S}" stroke-width="${SW}"/>
      <path d="M -4.5 8 L 4.5 8 L 0 13.5 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'equipment-ko-drum': {
    type: 'equipment-ko-drum',
    label: 'مخزن ناکاوت (K.O. Drum)',
    shortLabel: 'K.O. Drum',
    category: 'equipment',
    markup: `
      <rect x="-4.5" y="-11" width="9" height="22" rx="4.5" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="-4.5" y1="-4" x2="-10.5" y2="-4" stroke="${S}" stroke-width="${SW}"/>
      <line x1="4.5" y1="6" x2="10.5" y2="6" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'equipment-flare-stack': {
    type: 'equipment-flare-stack',
    label: 'دودکش فلر (Flare Stack)',
    shortLabel: 'Flare',
    category: 'equipment',
    markup: `
      <line x1="0" y1="9" x2="0" y2="-2.5" stroke="${S}" stroke-width="1.8"/>
      <path d="M 0 -2.5 C -3.4 -6 -2.3 -10.3 0 -14 C 2.3 -10.3 3.4 -6 0 -2.5 Z" fill="${S}" stroke="none"/>
      <line x1="-4.5" y1="13.5" x2="4.5" y2="13.5" stroke="${S}" stroke-width="1.4"/>
      <line x1="-4.5" y1="13.5" x2="0" y2="9" stroke="${S}" stroke-width="1.2"/>
      <line x1="4.5" y1="13.5" x2="0" y2="9" stroke="${S}" stroke-width="1.2"/>
      <line x1="-4.5" y1="13.5" x2="0" y2="11" stroke="${S}" stroke-width="0.8"/>
      <line x1="4.5" y1="13.5" x2="0" y2="11" stroke="${S}" stroke-width="0.8"/>
    `,
  },
  'equipment-pig-receiver': {
    type: 'equipment-pig-receiver',
    label: 'پیگ ریسیور (Pig Receiver)',
    shortLabel: 'Pig Receiver',
    category: 'equipment',
    markup: `
      <rect x="-10.5" y="-4" width="14" height="8" rx="4" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="7.5" cy="0" r="4.2" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'equipment-slug-catcher': {
    type: 'equipment-slug-catcher',
    label: 'اسلاگ کچر (Slug Catcher)',
    shortLabel: 'Slug Catcher',
    category: 'equipment',
    markup: `
      <rect x="-11" y="-3.8" width="22" height="7.6" rx="3.8" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="-11" y1="-1.3" x2="11" y2="-1.3" stroke="${S}" stroke-width="1" stroke-dasharray="1.5 1.2"/>
      <line x1="-11" y1="1.3" x2="11" y2="1.3" stroke="${S}" stroke-width="1" stroke-dasharray="1.5 1.2"/>
    `,
  },
  'equipment-blowdown': {
    type: 'equipment-blowdown',
    label: 'بلودان (Blowdown)',
    shortLabel: 'Blowdown',
    category: 'equipment',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="0" y2="-9" stroke="${S}" stroke-width="${SW}"/>
      <line x1="-2.6" y1="-9" x2="2.6" y2="-9" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
}

export const SYMBOL_CATEGORY_LABEL: Record<SymbolCategory, string> = {
  valve: 'شیرآلات',
  joint: 'اتصال عایق',
  fitting: 'اتصالات',
  equipment: 'تجهیزات',
}

export const SYMBOL_LIST: SymbolDef[] = Object.values(SYMBOL_DEFS)
