import type { ReportConfig, ReportTemplate } from '../types'

export function defaultReportConfig(): ReportConfig {
  return templateConfig('standard')
}

/** Each template is a starting preset — users can still fine-tune individual sections afterward. */
export function templateConfig(template: ReportTemplate): ReportConfig {
  if (template === 'detailed') {
    return {
      template,
      sections: {
        kpis: true,
        map: true,
        legend: true,
        linesTable: true,
        milestones: true,
        scheduleSCurve: true,
        weldsChart: true,
      },
    }
  }
  return {
    template: 'standard',
    sections: {
      kpis: true,
      map: true,
      legend: true,
      linesTable: true,
      milestones: false,
      scheduleSCurve: false,
      weldsChart: false,
    },
  }
}
