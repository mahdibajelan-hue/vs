import { Award } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function TechnicalCompetencyCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModuleCard
      number="04"
      title="ارزیابی شایستگی عوامل فنی"
      englishTag="Technical Competency & Qualification"
      description="مصاحبه ساختاریافته، امتیازدهی و صلاحیت‌سنجی مدیران و عوامل فنی پروژه بر اساس نقش."
      icon={Award}
      accent="#a855f7"
      onSelect={onSelect}
    />
  )
}
