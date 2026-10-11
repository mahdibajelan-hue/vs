import { Award } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function TechnicalCompetencyCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="04"
      title="ارزیابی شایستگی عوامل فنی"
      englishTag="Technical Competency & Qualification"
      description="مصاحبه ساختاریافته، امتیازدهی و صلاحیت‌سنجی مدیران و عوامل فنی پروژه."
      icon={Award}
      accent="#9333ea"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
