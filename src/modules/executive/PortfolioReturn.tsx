import { Briefcase } from 'lucide-react'
import { useModuleStore } from '../../store/useModuleStore'
import './mpv.css'

/** A project module opened as a multi-project view keeps one tap back to Portfolio Management. */
export function PortfolioReturn() {
  return (
    <button type="button" className="mpv-return no-print" dir="rtl" onClick={() => useModuleStore.getState().enterModule('executive')}>
      <Briefcase size={15} aria-hidden /> نمای چندپروژه‌ای · بازگشت به پرتفولیو
    </button>
  )
}
