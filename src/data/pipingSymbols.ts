export type SymbolType =
  | 'valve-gate'
  | 'valve-globe'
  | 'valve-ball'
  | 'valve-check'
  | 'valve-butterfly'
  | 'valve-control'
  | 'valve-relief'
  | 'insulating-joint'
  | 'fitting-tee'
  | 'fitting-elbow-30'
  | 'fitting-elbow-45'
  | 'fitting-elbow-90'
  | 'fitting-reducer'
  | 'fitting-flange'
  | 'fitting-cap'
  | 'fitting-union'
  | 'fitting-blind'
  | 'fitting-support'

export type SymbolCategory = 'valve' | 'joint' | 'fitting'

export interface SymbolDef {
  type: SymbolType
  label: string
  category: SymbolCategory
  markup: string
}

const S = '#64748b'
const SW = 1.6

export const SYMBOL_DEFS: Record<SymbolType, SymbolDef> = {
  'valve-gate': {
    type: 'valve-gate',
    label: 'شیر دروازه‌ای (Gate)',
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
    category: 'valve',
    markup: `
      <path d="M -9 -6 L 0 0 L -9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 9 -6 L 0 0 L 9 6 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
      <line x1="0" y1="0" x2="6.5" y2="-8" stroke="${S}" stroke-width="${SW}"/>
      <path d="M 6.5 -8 L 4.3 -11.2 M 6.5 -8 L 9.5 -9.8" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'insulating-joint': {
    type: 'insulating-joint',
    label: 'اتصال عایق (Insulating Joint)',
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
    category: 'fitting',
    markup: `
      <line x1="0" y1="0" x2="0" y2="-10" stroke="${S}" stroke-width="${SW}"/>
      <circle cx="0" cy="0" r="1.8" fill="${S}" stroke="none"/>
    `,
  },
  'fitting-elbow-30': {
    type: 'fitting-elbow-30',
    label: 'زانو ۳۰ درجه (Elbow 30°)',
    category: 'fitting',
    markup: `
      <path d="M -10 0 L -3 0 Q -0.5 -0.8 3.06 -3.5" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-elbow-45': {
    type: 'fitting-elbow-45',
    label: 'زانو ۴۵ درجه (Elbow 45°)',
    category: 'fitting',
    markup: `
      <path d="M -10 0 L -3 0 Q -1 -1 1.95 -4.95" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-elbow-90': {
    type: 'fitting-elbow-90',
    label: 'زانو ۹۰ درجه (Elbow 90°)',
    category: 'fitting',
    markup: `
      <path d="M -10 0 L -4 0 A 4 4 0 0 1 0 -4 L 0 -10" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-reducer': {
    type: 'fitting-reducer',
    label: 'ردیوسر (Reducer)',
    category: 'fitting',
    markup: `
      <path d="M -6 -5 L 6 -2.4 L 6 2.4 L -6 5 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-flange': {
    type: 'fitting-flange',
    label: 'فلنج (Flange)',
    category: 'fitting',
    markup: `
      <line x1="-1.6" y1="-6.5" x2="-1.6" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
      <line x1="1.6" y1="-6.5" x2="1.6" y2="6.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-cap': {
    type: 'fitting-cap',
    label: 'کپ (Cap)',
    category: 'fitting',
    markup: `
      <path d="M 0 -6.5 A 6.5 6.5 0 0 1 0 6.5 Z" fill="${S}" stroke="none"/>
    `,
  },
  'fitting-union': {
    type: 'fitting-union',
    label: 'یونیون (Union)',
    category: 'fitting',
    markup: `
      <line x1="-1" y1="-5.5" x2="-1" y2="5.5" stroke="${S}" stroke-width="${SW}"/>
      <line x1="1" y1="-5.5" x2="1" y2="5.5" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
  'fitting-blind': {
    type: 'fitting-blind',
    label: 'بلایند/اسپکتاکل (Blind)',
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
    category: 'fitting',
    markup: `
      <line x1="0" y1="2" x2="0" y2="8" stroke="${S}" stroke-width="${SW}"/>
      <path d="M -4.5 8 L 4.5 8 L 0 13.5 Z" fill="none" stroke="${S}" stroke-width="${SW}"/>
    `,
  },
}

export const SYMBOL_CATEGORY_LABEL: Record<SymbolCategory, string> = {
  valve: 'شیرآلات',
  joint: 'اتصال عایق',
  fitting: 'اتصالات',
}

export const SYMBOL_LIST: SymbolDef[] = Object.values(SYMBOL_DEFS)
