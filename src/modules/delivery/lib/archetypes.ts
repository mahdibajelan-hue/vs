import type { Answers } from './questions'

/**
 * Test archetypes modelled on typical Iranian oil & gas projects (no real project data). Used by the engine tests and
 * shown in the module as «نمونه‌های آزمایشی» so a user can see how the engine reasons before entering a real project.
 */
export const ARCHETYPES: { key: string; fa: string; expect: string; answers: Answers }[] = [
  { key: 'pipeline', fa: 'خط انتقال گاز ۴۸ اینچ، ۳۰۰ کیلومتر، طراحی پایه کامل', expect: 'روش‌های مقطوع یا تفکیک ساخت خط؛ بازار ساخت داخلی قوی', answers: {
    projectType: 'pipeline', capex: 45000, lengthKm: 300, complexity: 2, novelty: 1, distinctScopes: false, scopeMaturity: '2', changeLikelihood: 2, longLead: 5, standardization: 5, interfaces: 2,
    scheduleCriticality: 3, fixedDeadline: false, durationMonths: 30, funding: 'budget', budgetCertainty: 3, costPriority: 4, certaintyPriority: 4, inflation: 4, revenue: true,
    ownerPm: 3, ownerEng: 3, ownerProc: 4, ownerBuild: 1, experience: 5, decisionSpeed: 3, controlPriority: 3,
    epcMarket: 3, buildMarket: 5, supplierAccess: 3, riskAppetite: 3, localContent: 4, siteAccess: 3, brownfield: false, landRisk: 4, hseSensitivity: 3,
    groundRisk: 3, permitRisk: 3, supplyRisk: 3, interfaceRisk: 2, securityRisk: 2, openTender: true, reimbAllowed: false, directAllowed: false, ppAllowed: false, approvalTime: 3 } },
  { key: 'refinery', fa: 'واحد فرایندی گاز با FEED ناقص و زمان حیاتی', expect: 'EPCM یا کتاب‌باز قابل تبدیل؛ مسیر سریع', answers: {
    projectType: 'plant', capex: 120000, complexity: 5, novelty: 3, distinctScopes: true, scopeMaturity: '1', changeLikelihood: 4, longLead: 4, standardization: 2, modularPotential: 3, interfaces: 4,
    scheduleCriticality: 5, fixedDeadline: true, durationMonths: 42, funding: 'own', budgetCertainty: 4, costPriority: 3, certaintyPriority: 2, inflation: 3, revenue: true,
    ownerPm: 5, ownerEng: 4, ownerProc: 4, ownerBuild: 1, experience: 4, decisionSpeed: 4, controlPriority: 5,
    epcMarket: 3, buildMarket: 4, supplierAccess: 3, riskAppetite: 2, localContent: 2, siteAccess: 2, brownfield: false, landRisk: 1, hseSensitivity: 4,
    groundRisk: 2, permitRisk: 2, supplyRisk: 3, interfaceRisk: 4, securityRisk: 1, openTender: false, reimbAllowed: true, directAllowed: false, ppAllowed: false, approvalTime: 2 } },
  { key: 'offshore', fa: 'سکوی فراساحل با دسترسی محدود به سازندگان', expect: 'EPC با خرید زودهنگام اقلام بلندمدت؛ مدولارسازی', answers: {
    projectType: 'offshore', capex: 80000, complexity: 4, novelty: 2, distinctScopes: false, scopeMaturity: '2', changeLikelihood: 2, longLead: 5, standardization: 2, modularPotential: 5, interfaces: 3,
    scheduleCriticality: 4, fixedDeadline: false, durationMonths: 36, funding: 'own', budgetCertainty: 4, costPriority: 3, certaintyPriority: 4, inflation: 4, revenue: true,
    ownerPm: 3, ownerEng: 3, ownerProc: 3, ownerBuild: 1, experience: 3, decisionSpeed: 3, controlPriority: 3,
    epcMarket: 3, buildMarket: 3, supplierAccess: 1, riskAppetite: 3, localContent: 3, siteAccess: 5, brownfield: false, hseSensitivity: 5,
    groundRisk: 3, permitRisk: 2, supplyRisk: 5, interfaceRisk: 3, securityRisk: 2, openTender: false, reimbAllowed: false, directAllowed: false, ppAllowed: false, approvalTime: 3 } },
  { key: 'revamp', fa: 'بازسازی ایستگاه در حال بهره‌برداری با تیم توانای کارفرما', expect: 'اجرای مستقیم یا EPCM؛ اجرای فازبندی‌شده و راه‌اندازی مرحله‌ای', answers: {
    projectType: 'station', capex: 3000, complexity: 3, novelty: 1, distinctScopes: false, scopeMaturity: '2', changeLikelihood: 4, longLead: 2, standardization: 3, modularPotential: 2, interfaces: 3,
    scheduleCriticality: 3, fixedDeadline: false, durationMonths: 14, funding: 'own', budgetCertainty: 4, costPriority: 4, certaintyPriority: 2, inflation: 3, revenue: true,
    ownerPm: 4, ownerEng: 4, ownerProc: 4, ownerBuild: 4, experience: 5, decisionSpeed: 4, controlPriority: 5,
    epcMarket: 2, buildMarket: 3, supplierAccess: 3, riskAppetite: 2, localContent: 2, siteAccess: 2, brownfield: true, shutdownWindow: true, landRisk: 1, hseSensitivity: 5,
    groundRisk: 2, permitRisk: 1, supplyRisk: 2, interfaceRisk: 4, securityRisk: 1, openTender: false, reimbAllowed: true, directAllowed: true, ppAllowed: false, approvalTime: 2 } },
  { key: 'storage', fa: 'ذخیره‌سازی گاز با سرمایه‌گذار خصوصی و تعرفهٔ تضمینی', expect: 'BOT / BOO', answers: {
    projectType: 'storage', capex: 60000, complexity: 3, novelty: 2, distinctScopes: false, scopeMaturity: '2', changeLikelihood: 2, longLead: 3, standardization: 3, modularPotential: 2, interfaces: 2,
    scheduleCriticality: 2, fixedDeadline: false, durationMonths: 40, funding: 'private', budgetCertainty: 1, costPriority: 2, certaintyPriority: 5, inflation: 3, revenue: true,
    ownerPm: 2, ownerEng: 2, ownerProc: 2, ownerBuild: 1, experience: 2, decisionSpeed: 2, controlPriority: 2,
    epcMarket: 3, buildMarket: 3, supplierAccess: 3, riskAppetite: 3, localContent: 2, siteAccess: 3, brownfield: false, landRisk: 2, hseSensitivity: 3,
    groundRisk: 3, permitRisk: 2, supplyRisk: 3, interfaceRisk: 2, securityRisk: 2, openTender: true, reimbAllowed: false, directAllowed: false, ppAllowed: true, investorInterest: 5, approvalTime: 3 } },
]
