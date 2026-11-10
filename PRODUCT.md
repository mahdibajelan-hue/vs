# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Every party to a gas pipeline or station project, with no single primary audience: the employer's project team (managers and supervisors), consultants, EPC contractors and site supervisors. Accounts carry one of six types: project manager, employer, consultant, contractor, supervisor and other. Each person reaches only the modules opened for them and only the projects they belong to.

Work happens in two places. Managers and controllers work at a desktop in the office: dashboards, portfolio review, decisions and approvals. Site teams work on phones: daily reports, welding and weld operations, tests, attendance and land acquisition visits. Both are first-class; neither is a reduced version of the other.

## Product Purpose
فرین PMIS runs a gas transmission project end to end in one system. That covers schedule, engineering, procurement and materials, execution and supervision, station piping, tests, PSSR, contracts and payment certificates, change management, risk, issues, stakeholders, land acquisition, Stage-Gate and portfolio management. Alongside it sit workforce-development modules: competency, personality and missions. Success means every party sees the same live picture of a project and acts on it without re-entering data elsewhere.

## Positioning
Progress is calculated from field records, not typed in. EPC progress, the project radar and portfolio indicators are derived live from the records teams already keep, such as welds and weld operations, tests, procurement and deliveries, and approved daily reports. A neighbouring PMIS that relies on manually entered percentages cannot truthfully claim this.

## Operating Context
- Projects are gas transmission pipelines (for example 42 and 48 inch lines) and their stations, run under EPC contracts.
- Interface language is formal Persian, right to left, with Jalali dates and Persian digits throughout.
- Iranian practice is part of the domain: IGS standards for testing and coating, Stage-Gate phases G1–G9, payment certificates and contract forms.
- One project membership governs every module. A new account starts with all modules closed; access levels per module are closed, view, record and edit, approve, and manage.
- Backend is Supabase; the app deploys to GitHub Pages.

## Capabilities and Constraints
- Light and dark themes both ship.
- Mixed technical terms appear in Persian copy where the field uses them (EVM, CPI, SPI, BAC, EAC, Stage-Gate, Milestone).
- Undecided: no formal accessibility standard has been set for the product.

## Brand Commitments
- Name: فرین PMIS. The browser title reads «فرین PMIS | راهکار جامع مدیریت پروژه و توسعه نیروی انسانی».
- Voice: formal Persian in every user-facing string.

## Evidence on Hand
- Two fictional demo projects hold data across every module for training and guidance: «خط ۴۸ اینچ کوهدشت–سرخس» (MAT-DEMO-48) and «خط ۴۲ اینچ سرخس–مشهد» (DEMO-42-SM). They are explicitly hypothetical and must never be presented as real projects or results.
- There are no customer testimonials, case studies, benchmarks or published metrics. Do not invent any.
- README.md still describes the earlier PipePulse product and is out of date.

## Product Principles
1. Derive, don't ask. A figure shown anywhere should come from the records behind it, and the screen should be able to say which records those are.
2. Serve all parties. Employer, consultant, contractor and supervisor each need their share of the same truth. No role is an afterthought.
3. Office and site are equal. Every flow a site team uses must work fully on a phone; every management view must hold up on a desktop.
4. One project, one membership. Access and project scope stay consistent across modules; a person never has to be added to the same project twice.
5. Never fabricate. Empty, missing or unapproved data is shown as such, not filled with estimates that look real.
