// @ts-nocheck
/* eslint-disable */
// Stage-Gate lifecycle engine — a faithful port of the module in 30-Day_Quick_Win_Challenge/index.html
// (lcState … lcBindEvents). The rendering/logic is kept as in the source on purpose so the Gantt and
// orbit behave identically; only the data layer is adapted (sg_* tables) and the globals the source
// took from its host page are injected through `env`.
export function createStageGateEngine(env) {
  const { _supabase, currentUser, currentProfile, onGotoClientReport } = env
  let myProjectAccess = env.myProjectAccess || []
  let pickedProjectContext = null
  const switchView = (v) => { if (v === 'clientReport' && onGotoClientReport) onGotoClientReport() }
  function getGuideProjectNames() { return new Set() }
        function esc(str) {
            const d = document.createElement('div');
            d.textContent = str ?? '';
            return d.innerHTML;
        }
        function gregorianToJalali(gy, gm, gd) {
            const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
            let jy = (gy <= 1600) ? 0 : 979;
            gy -= (gy <= 1600) ? 621 : 1600;
            const gy2 = (gm > 2) ? (gy + 1) : gy;
            let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
            jy += 33 * Math.floor(days / 12053);
            days %= 12053;
            jy += 4 * Math.floor(days / 1461);
            days %= 1461;
            if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
            const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
            const jd = (days < 186) ? 1 + (days % 31) : 1 + ((days - 186) % 30);
            return [jy, jm, jd];
        }

        function jalaliToGregorian(jy, jm, jd) {
            let gy = (jy <= 979) ? 621 : 1600;
            jy -= (jy <= 979) ? 0 : 979;
            let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
            gy += 400 * Math.floor(days / 146097);
            days %= 146097;
            if (days > 36524) {
                gy += 100 * Math.floor(--days / 36524);
                days %= 36524;
                if (days >= 365) days++;
            }
            gy += 4 * Math.floor(days / 1461);
            days %= 1461;
            if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
            let gd = days + 1;
            const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0);
            const sal_a = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let gm = 0;
            for (gm = 0; gm < 13; gm++) {
                if (gd <= sal_a[gm]) break;
                gd -= sal_a[gm];
            }
            return [gy, gm, gd];
        }

        const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        function toPersianDigits(str) {
            return String(str).replace(/[0-9]/g, d => PERSIAN_DIGITS[d]);
        }
        function toLatinDigits(str) {
            return String(str).replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)));
        }

        // "2026-08-30" or an ISO timestamp -> "۱۴۰۵/۰۶/۰۸"
        function formatJalali(isoDateStr) {
            if (!isoDateStr) return '';
            const datePart = String(isoDateStr).slice(0, 10);
            const [gy, gm, gd] = datePart.split('-').map(Number);
            if (!gy || !gm || !gd) return '';
            const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
            return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
        }

        // Shared by jalaliInputToIso() and the month-arithmetic in
        // updateEndDateFromStartAndDuration() below — both need the raw
        // [jy, jm, jd] before any Gregorian conversion happens.
        function parseJalaliDateParts(jalaliStr) {
            const normalized = toLatinDigits(jalaliStr || '').trim();
            const parts = normalized.split(/[\/\-]/).map(Number);
            if (parts.length !== 3 || parts.some(n => isNaN(n))) return null;
            const [jy, jm, jd] = parts;
            if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
            return [jy, jm, jd];
        }

        // "۱۴۰۵/۰۶/۰۸" (or with Latin digits/dashes) -> "2026-08-30", or null if invalid
        function jalaliInputToIso(jalaliStr) {
            const parts = parseJalaliDateParts(jalaliStr);
            if (!parts) return null;
            const [gy, gm, gd] = jalaliToGregorian(parts[0], parts[1], parts[2]);
            return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
        }

        let activeJalaliPicker = null;
        let activeJalaliPickerInput = null;
        let activeJalaliPickerOutsideHandler = null;

        function closeJalaliPicker() {
            if (activeJalaliPickerOutsideHandler) {
                document.removeEventListener('click', activeJalaliPickerOutsideHandler);
                activeJalaliPickerOutsideHandler = null;
            }
            if (activeJalaliPicker) {
                activeJalaliPicker.remove();
                activeJalaliPicker = null;
                activeJalaliPickerInput = null;
            }
        }

        function attachJalaliDatePicker(input) {
            input.readOnly = true;
            input.classList.add('cursor-pointer', 'bg-white');
            input.addEventListener('click', (e) => { e.stopPropagation(); openJalaliPicker(input); });
        }

        // «از تقویم شمسی استفاده شود و نیازی به تایپ تاریخ نباشد اما در
        // صورت تمایل کاربر با کیبورد هم بشود مقادیر را وارد نمود» — same
        // click-to-open popup as attachJalaliDatePicker, but the field
        // stays a normal editable text input (not readOnly), so typing a
        // date directly still works — clicking to open the calendar is
        // just the faster default.
        function attachJalaliDatePickerKeyboardOk(input) {
            input.classList.add('cursor-pointer');
            input.addEventListener('click', (e) => { e.stopPropagation(); openJalaliPicker(input); });
        }

        function openJalaliPicker(input) {
            if (activeJalaliPickerInput === input) { closeJalaliPicker(); return; }
            closeJalaliPicker();

            const today = new Date();
            let [jy, jm] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const existingIso = jalaliInputToIso(input.value);
            if (existingIso) {
                const [ey, em, ed] = existingIso.split('-').map(Number);
                [jy, jm] = gregorianToJalali(ey, em, ed);
            }

            const pop = document.createElement('div');
            pop.className = 'fixed z-50 bg-white border rounded-xl shadow-lg p-3 text-xs';
            pop.style.width = '240px';
            // render() replaces pop's children (month nav, day select), which
            // would detach the exact node a bubbled click event was dispatched
            // on — making the outside-click check below (which walks up from
            // e.target) see no connection to `pop` and self-close the picker
            // on every nav click. Stopping propagation here keeps all clicks
            // inside the popup from ever reaching that document listener.
            pop.addEventListener('click', (e) => e.stopPropagation());
            document.body.appendChild(pop);
            activeJalaliPicker = pop;
            activeJalaliPickerInput = input;

            function selectDay(d) {
                const [gy, gm, gd] = jalaliToGregorian(jy, jm, d);
                const iso = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
                input.value = formatJalali(iso);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                closeJalaliPicker();
            }

            function render() {
                const dim = daysInJalaliMonth(jy, jm);
                const [gy1, gm1, gd1] = jalaliToGregorian(jy, jm, 1);
                const startOffset = (new Date(gy1, gm1 - 1, gd1).getDay() + 1) % 7;
                const selectedIso = jalaliInputToIso(input.value);

                let cells = '';
                for (let i = 0; i < startOffset; i++) cells += '<span></span>';
                for (let d = 1; d <= dim; d++) {
                    const [dgy, dgm, dgd] = jalaliToGregorian(jy, jm, d);
                    const dIso = `${dgy}-${String(dgm).padStart(2, '0')}-${String(dgd).padStart(2, '0')}`;
                    const isSelected = dIso === selectedIso;
                    cells += `<button type="button" data-day="${d}" class="jdp-day h-7 rounded-lg hover:bg-blue-100 ${isSelected ? 'bg-blue-900 text-white font-bold' : ''}">${toPersianDigits(d)}</button>`;
                }

                pop.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <button type="button" class="jdp-next px-2 py-1 rounded hover:bg-slate-100">›</button>
                        <span class="font-bold">${JALALI_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}</span>
                        <button type="button" class="jdp-prev px-2 py-1 rounded hover:bg-slate-100">‹</button>
                    </div>
                    <div class="grid grid-cols-7 gap-1 text-center text-slate-400 mb-1">${JALALI_WEEKDAY_LABELS.map(w => `<span>${w}</span>`).join('')}</div>
                    <div class="grid grid-cols-7 gap-1 text-center">${cells}</div>
                    <button type="button" class="jdp-today w-full mt-2 text-blue-900 hover:underline">امروز</button>
                `;

                pop.querySelector('.jdp-prev').addEventListener('click', () => { jm++; if (jm > 12) { jm = 1; jy++; } render(); });
                pop.querySelector('.jdp-next').addEventListener('click', () => { jm--; if (jm < 1) { jm = 12; jy--; } render(); });
                pop.querySelector('.jdp-today').addEventListener('click', () => {
                    const t = new Date();
                    const [ty, tm, td] = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
                    jy = ty; jm = tm;
                    selectDay(td);
                });
                pop.querySelectorAll('.jdp-day').forEach(btn => {
                    btn.addEventListener('click', () => selectDay(Number(btn.dataset.day)));
                });

                position();
            }

            // Row count (and so popup height) varies 4-6 weeks by month, and
            // the input can sit anywhere on the page (including near the
            // bottom of a scrollable modal like the new-task wizard) — so
            // always opening downward can push the last week(s) of the
            // month past the viewport with no way to scroll to them (the
            // popup is position:fixed, which doesn't move with page
            // scroll). Flip to opening above the input when there isn't
            // room below but there is above, and otherwise clamp so the
            // popup never extends past either viewport edge. Re-run on
            // every render() (not just the initial open) since navigating
            // between months can change the popup's height.
            function position() {
                const rect = input.getBoundingClientRect();
                const popHeight = pop.offsetHeight;
                const spaceBelow = window.innerHeight - rect.bottom;
                const openAbove = spaceBelow < popHeight + 8 && rect.top > popHeight + 8;
                pop.style.top = openAbove
                    ? `${Math.max(8, rect.top - popHeight - 4)}px`
                    : `${Math.min(rect.bottom + 4, window.innerHeight - popHeight - 8)}px`;
                pop.style.left = `${Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248))}px`;
            }

            render();

            const onDocClick = (e) => {
                if (activeJalaliPicker && !activeJalaliPicker.contains(e.target) && e.target !== input) closeJalaliPicker();
            };
            setTimeout(() => {
                document.addEventListener('click', onDocClick);
                activeJalaliPickerOutsideHandler = onDocClick;
            }, 0);
        }

        // --------------------------------------------------
        // FORM VOCABULARY (repeated checklists / dropdown option sets
        // shared between the check-in form and the reports that read it)
        const ICON_PATHS = {
            grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
            tool: '<path d="M14.7 6.3a4 4 0 1 1-5.4 5.4L3 18v3h3l6.3-6.3"/><path d="M14.7 6.3 18 3l3 3-3.3 3.3"/>',
            zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
            trendingUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
            barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
            fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
            edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
            clipboard: '<path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><rect x="5" y="4" width="14" height="18" rx="2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/>',
            logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
            clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
            alertTriangle: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
            checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            gauge: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 17 7"/>',
            calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
            activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
            shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
            users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            checklist: '<path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        };
        function iconSvg(name, cls) {
            return `<svg class="${cls || 'w-5 h-5'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
        }
        // ============================================================
        // PROJECT LIFECYCLE & STAGE-GATE MODULE
        //
        // Renders the org's 9-gate lifecycle (lifecycle_phases +
        // objectives/outputs/criteria, all fetched — nothing about a phase's
        // content is hard-coded here) as an orbit around a Project Core with
        // dual planned/actual rings. Progress is always DERIVED from item
        // completion (never typed in), and Gate readiness is tracked
        // separately from Progress% — a phase can sit at 100% progress and
        // still not be gate-PASSED if a mandatory exit criterion is pending.
        //
        // G6 (EPC) deliberately has no progress fields of its own: its E/P/C
        // planned/actual/weight already live on client_reports (the same
        // numbers شown on «اطلاعات پایه پروژه»), reused here rather than
        // duplicated. G4 (Basic Design) is the only phase with its own
        // manually-recorded, history-tracked periodic actual %.
        // ============================================================
        let lcState = {
            projectName: null,
            phases: [],
            projectPhases: {},
            items: {},
            gateDecisions: {},
            progressHistory: {},
            clientReport: null,
            clientReportHistory: [],
            selectedPhase: null,
            canEdit: false,
            activeTab: 'orbit',
            scheduleItems: [],
            scheduleDeps: [],
            baselines: [],
            collapsedScheduleRows: new Set(),
            scheduleEditor: null,
            phaseDurations: {},
            strategyDeps: {},
            masterSchedule: null,
            scheduleVersions: [],
            strategyDraft: null,
            successTemplates: [],
            ganttZoom: 1,
        };

        const LC_OBJECTIVE_STATUSES = [['not_started', 'شروع نشده', 'slate'], ['in_progress', 'در حال انجام', 'amber'], ['completed', 'تکمیل‌شده', 'emerald'], ['blocked', 'مسدود', 'red']];
        const LC_OUTPUT_STATUSES = [['pending', 'در انتظار', 'slate'], ['submitted', 'ارسال‌شده', 'amber'], ['verified', 'تاییدشده', 'emerald'], ['rejected', 'رد شده', 'red']];
        const LC_CRITERION_STATUSES = [['pending', 'در انتظار', 'slate'], ['completed', 'انجام‌شده', 'amber'], ['verified', 'تاییدشده', 'emerald'], ['failed', 'ناموفق', 'red'], ['waived', 'صرف‌نظرشده', 'purple']];
        const LC_KIND_STATUSES = { objective: LC_OBJECTIVE_STATUSES, output: LC_OUTPUT_STATUSES, criterion: LC_CRITERION_STATUSES };
        const LC_KIND_FRACTION = {
            objective: { not_started: 0, in_progress: 0.5, completed: 1, blocked: 0 },
            output: { pending: 0, submitted: 0.5, verified: 1, rejected: 0 },
            criterion: { pending: 0, completed: 0.5, verified: 1, failed: 0, waived: 1 },
        };
        const LC_GATE_STATUS_META = {
            not_ready: { label: 'آماده نیست', color: 'slate' },
            ready_for_review: { label: 'آماده بررسی', color: 'blue' },
            conditional: { label: 'عبور مشروط', color: 'purple' },
            passed: { label: 'گذر تاییدشده', color: 'emerald' },
            blocked: { label: 'مسدود', color: 'red' },
        };
        const LC_NODE_STATUS_META = {
            completed: { label: 'گیت گذشته‌شده', color: '#10b981', dark: '#065f46' },
            conditional: { label: 'عبور مشروط', color: '#a855f7', dark: '#6b21a8' },
            ready: { label: 'آماده بررسی گیت', color: '#3b82f6', dark: '#1e3a8a' },
            active: { label: 'در حال اجرا', color: '#f59e0b', dark: '#b45309' },
            upcoming: { label: 'پیش رو', color: '#64748b', dark: '#334155' },
            blocked: { label: 'مسدود', color: '#ef4444', dark: '#991b1b' },
        };

        function isAdminUser() { return currentProfile.role === 'admin'; }

        function lcTitleWithReviewFlag(title) {
            const t = title || '';
            const needsReview = /\[NEEDS REVIEW\]/i.test(t);
            return { clean: t.replace(/\s*\[NEEDS REVIEW\]/i, ''), needsReview };
        }

        function lcEmptyStateHtml(msg) {
            return `<div class="bg-white rounded-2xl shadow-sm border p-10 text-center text-slate-400 text-sm">${esc(msg)}</div>`;
        }

        async function openLifecyclePreview(projectName) {
            if (!projectName) { alert('لطفاً ابتدا پروژه را انتخاب کنید.'); return; }
            pickedProjectContext = { project_name: projectName, organization: (myProjectAccess.find(a => a.project_name === projectName) || {}).organization || 'کارفرما' };
            lcState.projectName = projectName;
            // Every fresh open of چرخه عمر پروژه (nav click, project switch,
            // or the manual «بارگذاری» button) starts back on the orbit —
            // lcState persists for the whole SPA session, so without this a
            // previous visit's Gantt tab or open phase page would still be
            // showing instead of the orbit the user actually expects to land on.
            lcState.activeTab = 'orbit';
            lcState.selectedPhase = null;
            document.getElementById('lcProjectNameLabel').textContent = projectName;
            document.getElementById('lcBody').innerHTML = '<p class="text-center text-slate-400 p-10">در حال بارگذاری چرخه عمر پروژه...</p>';

            const [{ data: phases, error: phasesErr }, { data: projectPhases }, { data: items }, { data: gateDecisions }, { data: progressHistory }, { data: clientReports }, { data: scheduleItems }, { data: scheduleDeps }, { data: baselines }, { data: phaseDurations }, { data: strategyDeps }, { data: masterSchedule }, { data: scheduleVersions }, { data: successTemplates }] = await Promise.all([
                _supabase.from('sg_lifecycle_phases').select('*, lifecycle_objectives:sg_lifecycle_objectives(*), lifecycle_outputs:sg_lifecycle_outputs(*), lifecycle_criteria:sg_lifecycle_criteria(*)').eq('is_active', true).order('sort_order'),
                _supabase.from('sg_project_lifecycle_phases').select('*').eq('project_name', projectName),
                _supabase.from('sg_project_phase_items').select('*').eq('project_name', projectName),
                _supabase.from('sg_lifecycle_gate_decisions').select('*').eq('project_name', projectName).order('decided_at', { ascending: false }),
                _supabase.from('sg_lifecycle_progress_history').select('*').eq('project_name', projectName).order('recorded_at', { ascending: true }),
                _supabase.from('sg_client_reports').select('*').eq('project_name', projectName).order('created_at', { ascending: true }),
                _supabase.from('sg_lifecycle_schedule_items').select('*').eq('project_name', projectName),
                _supabase.from('sg_lifecycle_schedule_dependencies').select('*').eq('project_name', projectName),
                _supabase.from('sg_lifecycle_schedule_baselines').select('*, lifecycle_schedule_baseline_items:sg_lifecycle_schedule_baseline_items(*)').eq('project_name', projectName).order('created_at', { ascending: false }),
                _supabase.from('sg_lifecycle_phase_durations').select('*'),
                _supabase.from('sg_lifecycle_strategy_phase_dependencies').select('*'),
                _supabase.from('sg_lifecycle_master_schedule').select('*').eq('project_name', projectName).maybeSingle(),
                _supabase.from('sg_lifecycle_master_schedule_versions').select('*').eq('project_name', projectName).order('created_at', { ascending: false }),
                _supabase.from('sg_lifecycle_schedule_success_templates').select('*').order('created_at', { ascending: false }),
            ]);

            if (phasesErr) {
                document.getElementById('lcBody').innerHTML = lcEmptyStateHtml('خطا در بارگذاری داده مرجع چرخه عمر: ' + phasesErr.message);
                return;
            }

            lcState.phases = (phases || []).slice().sort((a, b) => a.sort_order - b.sort_order);
            lcState.projectPhases = {};
            (projectPhases || []).forEach(pp => { lcState.projectPhases[pp.phase_code] = pp; });
            lcState.items = {};
            (items || []).forEach(it => {
                lcState.items[it.phase_code] = lcState.items[it.phase_code] || { objective: {}, output: {}, criterion: {} };
                lcState.items[it.phase_code][it.kind][it.item_id] = it;
            });
            lcState.gateDecisions = {};
            (gateDecisions || []).forEach(d => {
                lcState.gateDecisions[d.phase_code] = lcState.gateDecisions[d.phase_code] || [];
                lcState.gateDecisions[d.phase_code].push(d);
            });
            lcState.progressHistory = {};
            (progressHistory || []).forEach(h => {
                lcState.progressHistory[h.phase_code] = lcState.progressHistory[h.phase_code] || [];
                lcState.progressHistory[h.phase_code].push(h);
            });
            lcState.clientReportHistory = clientReports || [];
            lcState.clientReport = lcState.clientReportHistory.length ? lcState.clientReportHistory[lcState.clientReportHistory.length - 1] : null;
            lcState.scheduleItems = (scheduleItems || []).slice().sort((a, b) => (a.seq - b.seq) || (a.id - b.id));
            lcState.scheduleDeps = scheduleDeps || [];
            lcState.baselines = baselines || [];
            lcState.phaseDurations = {};
            (phaseDurations || []).forEach(d => { lcState.phaseDurations[d.phase_code] = d.duration_days; });
            lcState.strategyDeps = {};
            (strategyDeps || []).forEach(d => {
                lcState.strategyDeps[d.strategy] = lcState.strategyDeps[d.strategy] || [];
                lcState.strategyDeps[d.strategy].push(d);
            });
            lcState.masterSchedule = masterSchedule || null;
            lcState.scheduleVersions = scheduleVersions || [];
            lcState.strategyDraft = null;
            lcState.successTemplates = successTemplates || [];
            lcState.canEdit = isAdminUser() || myProjectAccess.some(a => a.project_name === projectName);
            // lcState.selectedPhase was already reset to null at the top of
            // this function so every fresh open lands on the orbit (all 9
            // planets visible) — this used to be re-pointed at the current
            // active phase right here, right after data finished loading,
            // which silently undid that reset on every single load.

            lcRenderAll();
        }

        // ---------------- Calculation engine ----------------
        function lcPlannedProgressByDate(plannedStart, plannedFinish, asOf) {
            if (!plannedStart || !plannedFinish) return null;
            const s = new Date(plannedStart).getTime(), f = new Date(plannedFinish).getTime(), n = (asOf || new Date()).getTime();
            if (!(f > s)) return null;
            if (n <= s) return 0;
            if (n >= f) return 100;
            return Math.round((n - s) / (f - s) * 100);
        }

        function lcEpcWeighted(cr, mode) {
            if (!cr) return 0;
            const we = Number(cr.progress_engineering_weight) || 0;
            const wp = Number(cr.progress_procurement_weight) || 0;
            const wc = Number(cr.progress_construction_weight) || 0;
            const totalW = (we + wp + wc) || 100;
            const suffix = mode === 'planned' ? '_planned' : '';
            const e = Number(cr['progress_engineering' + suffix]) || 0;
            const p = Number(cr['progress_procurement' + suffix]) || 0;
            const c = Number(cr['progress_construction' + suffix]) || 0;
            const effWe = we || (totalW / 3), effWp = wp || (totalW / 3), effWc = wc || (totalW / 3);
            return (e * effWe + p * effWp + c * effWc) / totalW;
        }

        function lcPhaseProgress(phase) {
            const pp = lcState.projectPhases[phase.code];
            if (phase.progress_engine === 'epc') {
                return { actual: lcEpcWeighted(lcState.clientReport, 'actual'), planned: lcEpcWeighted(lcState.clientReport, 'planned') };
            }
            if (phase.progress_engine === 'basic_design') {
                const actual = pp && typeof pp.manual_actual_pct === 'number' ? pp.manual_actual_pct : 0;
                const planned = lcPlannedProgressByDate(pp?.planned_start, pp?.planned_finish);
                return { actual, planned: planned == null ? actual : planned };
            }
            // «محاسبات پیشرفت واقعی بر اساس پیشرفت هر مجموعه فعالیت در
            // جدول زمانی اون مرحله باشه» — a 'step' phase's actual progress
            // is now the weighted rollup of its own schedule (Gantt)
            // items' recorded %, the exact same number as that phase's
            // Gantt bar fill (see lcPhaseScheduleActualPct). Key Outputs
            // and Exit Criteria no longer feed into this number at all:
            // Exit Criteria still gate whether the phase can PASS (see
            // lcGateReadiness below), just without contributing a %, and
            // Key Outputs are purely informational now (lcChecklistSectionHtml).
            const actual = lcPhaseScheduleActualPct(phase.code) ?? 0;
            const planned = lcPlannedProgressByDate(pp?.planned_start, pp?.planned_finish);
            return { actual, planned: planned == null ? actual : planned };
        }

        function lcGateReadiness(phase) {
            const pp = lcState.projectPhases[phase.code];
            const it = lcState.items[phase.code] || { objective: {}, output: {}, criterion: {} };
            const mandatoryCriteria = (phase.lifecycle_criteria || []).filter(c => c.is_active !== false && c.is_mandatory);
            const criteriaOk = mandatoryCriteria.every(c => ['verified', 'waived'].includes(it.criterion[c.id]?.status));
            // Key Outputs are informational-only now — no status to check,
            // so only Exit Criteria gate the pass.
            const readyForGate = criteriaOk;
            const stored = pp?.gate_status || 'not_ready';
            const pendingMandatory = mandatoryCriteria.filter(c => !['verified', 'waived'].includes(it.criterion[c.id]?.status));
            let effective = stored;
            if (stored === 'not_ready' || stored === 'ready_for_review') effective = readyForGate ? 'ready_for_review' : 'not_ready';
            return { effective, readyForGate, criteriaOk, pendingMandatory };
        }

        // «تایید معیار عبور هم» — raw verified/total count for the orbit
        // callout, so gate readiness reads like a checklist rather than
        // another percentage. Key Outputs are informational-only now (no
        // status to count), so this only covers Exit Criteria.
        function lcCriterionCounts(phase) {
            const it = lcState.items[phase.code] || { objective: {}, output: {}, criterion: {} };
            const activeCriteria = (phase.lifecycle_criteria || []).filter(c => c.is_active !== false);
            return {
                criteriaOk: activeCriteria.filter(c => ['verified', 'waived'].includes(it.criterion[c.id]?.status)).length,
                criteriaTotal: activeCriteria.length,
            };
        }

        function lcOverallProgress() {
            let sumW = 0, sumActual = 0, sumPlanned = 0;
            const n = lcState.phases.length || 1;
            lcState.phases.forEach(p => {
                const pp = lcState.projectPhases[p.code];
                const w = (pp && typeof pp.weight_pct === 'number') ? pp.weight_pct : (100 / n);
                const { actual, planned } = lcPhaseProgress(p);
                sumW += w; sumActual += w * actual; sumPlanned += w * planned;
            });
            return { actual: sumW ? sumActual / sumW : 0, planned: sumW ? sumPlanned / sumW : 0 };
        }

        function lcTotalWeight() {
            const n = lcState.phases.length || 1;
            return lcState.phases.reduce((sum, p) => sum + (lcState.projectPhases[p.code]?.weight_pct ?? (100 / n)), 0);
        }

        function lcCurrentActivePhase() {
            return lcState.phases.find(p => (lcState.projectPhases[p.code]?.gate_status) !== 'passed') || lcState.phases[lcState.phases.length - 1];
        }

        function lcNodeStatus(phase) {
            const pp = lcState.projectPhases[phase.code];
            const gate = pp?.gate_status || 'not_ready';
            if (gate === 'blocked') return 'blocked';
            if (gate === 'passed') return 'completed';
            if (gate === 'conditional') return 'conditional';
            if (gate === 'ready_for_review') return 'ready';
            const { actual } = lcPhaseProgress(phase);
            return actual > 0 ? 'active' : 'upcoming';
        }

        // «در بخش نمایش چرخه عمر در صورتی که در هر یک از زیرمجموعه تاخیری
        // ایجاد شده بصورت برجسته و کوچک با یک علامت اخطار نام زیرمجموعه و
        // تعداد روز تاخیر ... نوشته شود» — the single WORST-overdue leaf
        // schedule item under a phase (planned_finish already past, not
        // yet 100% actual) — leaves only, so a parent container isn't
        // separately flagged for a delay that's really its child's.
        function lcMostDelayedScheduleItem(phaseCode) {
            const todayIso = new Date().toISOString().slice(0, 10);
            let worst = null;
            const walk = (parentId) => {
                lcScheduleChildren(phaseCode, parentId).forEach(item => {
                    const children = lcScheduleChildren(phaseCode, item.id);
                    if (children.length) { walk(item.id); return; }
                    if (!item.planned_finish || item.planned_finish >= todayIso) return;
                    if (lcItemActualPct(item) >= 100) return;
                    const delayDays = lcDaysBetween(item.planned_finish, todayIso);
                    if (!worst || delayDays > worst.delayDays) worst = { item, delayDays };
                });
            };
            walk(null);
            return worst;
        }

        // ---------------- Rendering ----------------
        function lcRenderAll() {
            if (!lcState.phases.length) {
                document.getElementById('lcBody').innerHTML = lcEmptyStateHtml('داده مرجع چرخه عمر هنوز در سامانه ثبت نشده است — از فایل seed_lifecycle_master_data.sql برای بارگذاری آن استفاده کنید.');
                return;
            }
            document.getElementById('lcBody').innerHTML = `
                <style>
                    /* Positioning (translate to the node's spot on the orbit) stays a
                       plain SVG "transform" ATTRIBUTE on the outer <g>, never touched
                       by CSS — mixing the two on the SAME element is what used to make
                       every node visibly jump to the canvas corner on hover (a CSS
                       "transform" replaces the attribute instead of composing with it).
                       The hover scale below only ever applies to the inner <g class="lc-node">,
                       which carries no positioning attribute of its own. Nothing here
                       animates on its own — scale only ever changes on :hover, and the
                       float-panel entrance below runs once (180ms) and then stops. */
                    .lc-node { transition: transform .15s ease; transform-box: fill-box; transform-origin: center; }
                    .lc-node:hover { transform: scale(1.08); }
                    /* Every phase's title is always visible now (dim, small,
                       positioned radially outward from its node so 9 titles
                       around a circle fan away from each other instead of
                       piling up underneath every node the same way) — it
                       grows larger and bold on hover so the one you're
                       looking at is unambiguous even where two neighbors'
                       titles run long enough to overlap at rest. The fuller
                       callout (status + completion %) still only appears on
                       hover/selection, further out beside the node. */
                    .lc-node-title { display:inline-block; font-size:9px; font-weight:600; line-height:1.2; opacity:.65; transition: all .15s ease; }
                    .lc-node-hit:hover .lc-node-title-wrap { z-index: 10; }
                    .lc-node-hit:hover .lc-node-title { opacity:1; font-weight:800; font-size:12px; }
                    .lc-callout { opacity: 0; transition: opacity .15s ease; }
                    .lc-node-hit:hover .lc-callout, .lc-callout.lc-callout-pinned { opacity: 1; }
                    /* Tailwind's text-white/text-slate-* utilities here read
                       this app's OWN light/dark theme CSS variables (so an
                       ordinary "white" card correctly flips dark when the
                       whole app's theme toggle is set to dark) — but every
                       .lc-dark-panel in this module is deliberately dark
                       regardless of that toggle. The app's dark theme
                       redefines "white" as a dark navy (so a light card
                       becomes a dark one), so text-white used for literal
                       bright text against one of these ALREADY-dark panels
                       would silently turn near-invisible the moment a
                       user's own app theme is set to dark — exactly what
                       was reported for the برنامه زمان‌بندی tab. Pinning
                       these to literal values here matches how every other
                       color in these panels (all inline hex/rgba) already
                       works, independent of that toggle. */
                    .lc-dark-panel .text-white,
                    .lc-dark-panel .hover\\:text-white:hover { color: #ffffff !important; }
                    .lc-dark-panel .text-slate-200 { color: #e2e8f0 !important; }
                    .lc-dark-panel .text-slate-300 { color: #cbd5e1 !important; }
                    .lc-dark-panel .text-slate-400 { color: #94a3b8 !important; }
                    .lc-dark-panel .text-slate-500 { color: #94a3b8 !important; }
                </style>
                ${lcTabBarHtml()}
                ${lcExecStripHtml()}
                ${lcState.activeTab === 'plan' ? lcMasterPlanHtml()
                    : lcState.selectedPhase ? lcPhaseDetailPageHtml(lcState.phases.find(p => p.code === lcState.selectedPhase))
                    : lcOrbitPageHtml()}
                ${lcMetadataBarHtml()}
            `;
            lcBindEvents();
        }

        // The orbit is deliberately sized to fit on screen without scrolling
        // (≈60% of its first full-page-redesign size) rather than maximizing
        // its own footprint — legibility of the whole cycle at a glance
        // matters more here than making any single node bigger.
        function lcOrbitPageHtml() {
            return `
            <div class="lc-dark-panel rounded-2xl p-4 md:p-6 flex flex-col" style="background: radial-gradient(ellipse 90% 70% at 50% 10%, #123159 0%, #04070f 78%); border: 1px solid rgba(255,255,255,.07); min-height: 48vh;">
                ${lcIdentityStripHtml()}
                <div class="relative flex-1 flex items-center justify-center" id="lcOrbitStage" style="min-height: 37vh;">
                    <div style="width:100%; max-width:600px; margin:0 auto; position:relative;">
                        ${lcOrbitSvg()}
                    </div>
                </div>
                ${lcLegendHtml()}
            </div>`;
        }

        // Clicking a node used to open a floating card over the orbit; now it
        // navigates to a dedicated page instead — a dark header with the
        // phase's headline numbers, this phase's OWN slice of the Master
        // Plan timeline (same renderer as the "برنامه زمان‌بندی" tab, just
        // scoped to one phase's schedule tree), and the full checklist/gate/
        // approval detail as plain text/cards underneath.
        function lcPhaseDetailPageHtml(phase) {
            if (!phase) { lcState.selectedPhase = null; return lcOrbitPageHtml(); }
            const { actual, planned } = lcPhaseProgress(phase);
            const variance = Math.round(actual) - Math.round(planned);
            const gate = lcGateReadiness(phase);
            const gateMeta = LC_GATE_STATUS_META[gate.effective];
            const gateName = lcTitleWithReviewFlag(phase.gate_name);
            return `
            <div class="space-y-5">
                <div class="lc-dark-panel rounded-2xl p-5" style="background: linear-gradient(135deg, #0b1830, #10243f);">
                    <button type="button" data-lc-back-to-orbit class="no-print text-[11px] font-bold mb-3 inline-flex items-center gap-1 hover:underline" style="color:#93c5fd;">→ بازگشت به چرخه عمر</button>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1" style="background:rgba(255,255,255,.1); color:#93c5fd;">مرحله ${toPersianDigits(phase.sort_order)} از ${toPersianDigits(lcState.phases.length)}</span>
                            <h3 class="text-lg font-extrabold text-white">${esc(phase.title)}</h3>
                            <p class="text-[11px] mt-0.5" style="color:#93c5fd;">مسئول: ${esc(phase.responsible)} · گیت: ${esc(gateName.clean)}${gateName.needsReview ? ' ⚠' : ''}</p>
                        </div>
                        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-${gateMeta.color}-100 text-${gateMeta.color}-700">وضعیت گیت: ${esc(gateMeta.label)}${!gate.readyForGate ? ` (${toPersianDigits(gate.pendingMandatory.length)} معیار الزامی باقی‌مانده)` : ''}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-3 mt-4">
                        <div class="rounded-xl p-2.5 text-center" style="background:rgba(255,255,255,.06);"><p class="text-[10px]" style="color:#93c5fd;">واقعی</p><p class="text-lg font-extrabold text-white">${toPersianDigits(Math.round(actual))}٪</p></div>
                        <div class="rounded-xl p-2.5 text-center" style="background:rgba(255,255,255,.06);"><p class="text-[10px]" style="color:#93c5fd;">برنامه‌ای</p><p class="text-lg font-extrabold text-white">${toPersianDigits(Math.round(planned))}٪</p></div>
                        <div class="rounded-xl p-2.5 text-center" style="background:rgba(255,255,255,.06);"><p class="text-[10px]" style="color:#93c5fd;">انحراف</p><p class="text-lg font-extrabold ${variance < -5 ? 'text-red-400' : variance > 2 ? 'text-emerald-400' : 'text-blue-300'}">${variance >= 0 ? '+' : ''}${toPersianDigits(Math.round(variance))}٪</p></div>
                    </div>
                    ${lcPhaseHeroActionsHtml(phase)}
                </div>
                ${lcPhaseTimelineSectionHtml(phase)}
                <div id="lcPhaseDetailBody" class="bg-white rounded-2xl shadow-sm border p-5">
                    ${lcDetailPanelHtml()}
                </div>
            </div>`;
        }

        // «دکمه‌های ایجاد فعالیت‌های زیرمجموعه و ری‌پلن رو بزرگتر و در
        // جای مناسب قرار بده» — the same two actions already available as
        // small icons on this phase's own Gantt row (still there for quick
        // access from the whole-project Master Plan tab) also get a
        // proper, clearly-labeled button right on this phase's own hero —
        // exactly where someone working on this phase is already looking.
        function lcPhaseHeroActionsHtml(phase) {
            if (!lcState.canEdit) return '';
            const pp = lcState.projectPhases[phase.code];
            const hasChildren = lcScheduleChildren(phase.code, null).length > 0;
            const buttons = [];
            if (!hasChildren) {
                buttons.push(`<button type="button" data-lc-action="auto-generate-objectives" data-phase="${esc(phase.code)}" class="text-[11px] font-bold px-3 py-2 rounded-xl border" style="color:#a78bfa; border-color:#a78bfa66;">🧩 ایجاد زیرفعالیت‌ها از اهداف مرحله</button>`);
            }
            if (pp?.planned_start) {
                buttons.push(`<button type="button" data-lc-action="replan-from-delay" data-phase="${esc(phase.code)}" class="text-[11px] font-bold px-3 py-2 rounded-xl border" style="color:#fb923c; border-color:#fb923c66;">🔄 ری‌پلن (در صورت تاخیر)</button>`);
            }
            if (!buttons.length) return '';
            return `<div class="no-print flex flex-wrap items-center gap-2 mt-4 pt-4" style="border-top:1px solid rgba(255,255,255,.08);">${buttons.join('')}</div>`;
        }

        function lcPhaseTimelineSectionHtml(phase) {
            const rows = lcBuildScheduleRows(phase.code);
            const range = lcScheduleDateRange(phase.code);
            return `
            <div class="lc-dark-panel rounded-2xl p-4 md:p-6" style="background: radial-gradient(ellipse 90% 70% at 50% 10%, #123159 0%, #04070f 78%); border: 1px solid rgba(255,255,255,.07);">
                <h4 class="text-white font-extrabold text-xs mb-3">جدول زمانی این مرحله</h4>
                ${lcGanttGridHtml(rows, range)}
            </div>`;
        }

        function lcArcPath(cx, cy, r, a1, a2) {
            const toXY = (a) => { const rad = a * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
            const [x1, y1] = toXY(a1 + 3), [x2, y2] = toXY(a2 - 3);
            const large = (a2 - a1) > 180 ? 1 : 0;
            return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
        }

        // Node positions are computed once here and reused by both the SVG
        // (icon badges + progress rings) and the HTML overlay below it
        // (compact label + hover callout) — so everything lines up with its
        // own node. The viewBox carries deliberate extra margin (nodeOrbitR +
        // nodeR leaves ~90 units to the edge) so a callout box can float
        // outside the ring itself without being clipped by the panel.
        function lcNodeLayout() {
            const N = lcState.phases.length;
            const cx = 380, cy = 380, nodeOrbitR = 270, nodeR = 42;
            return lcState.phases.map((p, i) => {
                const angle = -90 + (360 / N) * i;
                const rad = angle * Math.PI / 180;
                return { phase: p, index: i, angle, nx: cx + nodeOrbitR * Math.cos(rad), ny: cy + nodeOrbitR * Math.sin(rad) };
            });
        }

        const LC_NEON_GREEN = '#39ff8a';
        const LC_PLANNED_COLOR = '#7dd3fc';
        const LC_NODE_PLANNED_COLOR = '#fb923c';

        function lcOrbitSvg() {
            const cx = 380, cy = 380, coreR = 165, plannedR = 158, actualR = 149, nodeOrbitR = 270, nodeR = 42;
            const overall = lcOverallProgress();
            const ringLen = (r) => 2 * Math.PI * r;
            const arc = (r, pct, style) => {
                const len = ringLen(r);
                const dash = len * Math.max(0, Math.min(100, pct)) / 100;
                return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-linecap="round" stroke-dasharray="${dash} ${len - dash}" transform="rotate(-90 ${cx} ${cy})" style="${style}"/>`;
            };
            const layout = lcNodeLayout();
            const N = layout.length;

            const gradDefs = Object.entries(LC_NODE_STATUS_META).map(([key, m]) => `
                <radialGradient id="lcGrad-${key}" cx="35%" cy="30%" r="75%">
                    <stop offset="0%" stop-color="${m.color}"/><stop offset="100%" stop-color="${m.dark}"/>
                </radialGradient>`).join('');

            // The connector between each pair of nodes doubles as a "how far
            // around the loop have we come, and which way are we going"
            // indicator: the stretch behind an already-passed gate glows
            // neon green, the stretch still ahead stays a dim dotted line,
            // and a small chevron on each stretch points in the direction
            // of travel (clockwise, G1 -> G2 -> ... -> G9).
            let nodesHtml = '', connectorsHtml = '';
            layout.forEach(({ phase: p, index: i, angle, nx, ny }) => {
                const nextAngle = -90 + (360 / N) * (i + 1);
                const midAngle = (angle + nextAngle) / 2;
                const midRad = midAngle * Math.PI / 180;
                const status = lcNodeStatus(p);
                const meta = LC_NODE_STATUS_META[status];
                const { actual, planned } = lcPhaseProgress(p);
                const isSelected = lcState.selectedPhase === p.code;
                // Same dual planned/actual ring idea as the Project Core, just
                // drawn as two thin bands just outside each node's own circle
                // (rather than hugging the inside of a much bigger circle) —
                // orange for planned, the same neon green used for "actual"
                // everywhere else in this module (core ring, connectors,
                // Gantt bars), which reads as a clear contrast against orange.
                const nodePlannedR = nodeR + 11, nodeActualR = nodeR + 6;
                const nodePlannedRingLen = 2 * Math.PI * nodePlannedR, nodeActualRingLen = 2 * Math.PI * nodeActualR;
                const nodePlannedDash = nodePlannedRingLen * Math.max(0, Math.min(100, planned)) / 100;
                const nodeActualDash = nodeActualRingLen * Math.max(0, Math.min(100, actual)) / 100;
                const isPassed = lcState.projectPhases[p.code]?.gate_status === 'passed';
                const segColor = isPassed ? LC_NEON_GREEN : 'rgba(255,255,255,.28)';
                const midX = cx + nodeOrbitR * Math.cos(midRad), midY = cy + nodeOrbitR * Math.sin(midRad);
                const tangentDeg = midAngle + 90; // direction of clockwise travel at this point

                connectorsHtml += `
                    <path d="${lcArcPath(cx, cy, nodeOrbitR, angle, nextAngle)}" fill="none" stroke="${segColor}" stroke-opacity="${isPassed ? 0.85 : 0.5}" stroke-width="2.5" stroke-dasharray="${isPassed ? '0' : '1 7'}" stroke-linecap="round" ${isPassed ? `filter="drop-shadow(0 0 4px ${LC_NEON_GREEN})"` : ''}/>
                    <path d="M -4,-3 L 4,0 L -4,3 Z" fill="${segColor}" opacity="${isPassed ? 0.95 : 0.55}" transform="translate(${midX} ${midY}) rotate(${tangentDeg})"/>`;

                const iconKey = status === 'completed' ? 'checkCircle' : p.icon_key;
                nodesHtml += `
                <g data-lc-phase="${p.code}" transform="translate(${nx} ${ny})" style="cursor:pointer;">
                    <g class="lc-node">
                        <circle r="${nodeR + 15}" fill="${meta.color}" opacity="${isSelected ? 0.28 : 0.14}" filter="url(#lcNodeBlur)"/>
                        <circle r="${nodePlannedR}" fill="none" stroke="#020617" stroke-opacity="0.55" stroke-width="3"/>
                        <circle r="${nodeActualR}" fill="none" stroke="#020617" stroke-opacity="0.55" stroke-width="3.5"/>
                        <circle r="${nodePlannedR}" fill="none" stroke="${LC_NODE_PLANNED_COLOR}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${nodePlannedDash} ${nodePlannedRingLen - nodePlannedDash}" transform="rotate(-90)" opacity="0.95"/>
                        <circle r="${nodeActualR}" fill="none" stroke="${LC_NEON_GREEN}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${nodeActualDash} ${nodeActualRingLen - nodeActualDash}" transform="rotate(-90)" opacity="0.95" filter="drop-shadow(0 0 3px ${LC_NEON_GREEN})"/>
                        <circle r="${nodeR}" fill="url(#lcGrad-${status})" stroke="${isSelected ? '#ffffff' : meta.color}" stroke-width="${isSelected ? 3 : 1.5}" stroke-opacity="${isSelected ? 0.95 : 0.5}"/>
                        <g transform="translate(-12,-12)" stroke="#ffffff" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">${ICON_PATHS[iconKey] || ''}</g>
                    </g>
                </g>`;
            });

            const VB = 760; // keep in sync with the <svg viewBox> below
            const labelsHtml = layout.map(({ phase: p, index: i, angle, nx, ny }) => {
                const status = lcNodeStatus(p);
                const meta = LC_NODE_STATUS_META[status];
                const { actual, planned } = lcPhaseProgress(p);
                const counts = lcCriterionCounts(p);
                const isSelected = lcState.selectedPhase === p.code;
                const leftPct = (nx / VB) * 100, topPct = (ny / VB) * 100;
                const rad = angle * Math.PI / 180;
                const pushLeft = Math.cos(rad) < 0; // which side of the node the callout opens toward

                // Title position, expressed as a % of .lc-node-hit's OWN box
                // (not the viewBox) so it scales correctly with the SVG at
                // any rendered size: radially outward from the node center,
                // just past its glow halo, so titles fan out around the
                // circle instead of all sitting directly underneath.
                const boxSize = nodeR * 2;
                const labelDist = nodeR + 24;
                const titleLeftPct = 50 + (labelDist * Math.cos(rad) / boxSize) * 100;
                const titleTopPct = 50 + (labelDist * Math.sin(rad) / boxSize) * 100;
                const delay = lcMostDelayedScheduleItem(p.code);

                return `
                <div data-lc-phase="${p.code}" class="lc-node-hit" style="position:absolute; right:${100 - leftPct}%; top:${topPct}%; width:${nodeR * 2}px; height:${nodeR * 2}px; transform:translate(50%, -50%); pointer-events:auto; cursor:pointer;">
                    <div class="lc-node-title-wrap text-center pointer-events-none" style="position:absolute; right:${100 - titleLeftPct}%; top:${titleTopPct}%; transform:translate(50%, -50%); width:130px; z-index:2;">
                        <span class="lc-node-title" style="color:${meta.color};">${esc(p.title)}</span>
                        <div class="flex items-center justify-center gap-1 mt-1">
                            <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap" style="background:${LC_NODE_PLANNED_COLOR}26; color:${LC_NODE_PLANNED_COLOR};" title="پیشرفت برنامه‌ای">ب ${toPersianDigits(Math.round(planned))}٪</span>
                            <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full whitespace-nowrap" style="background:${LC_NEON_GREEN}26; color:${LC_NEON_GREEN};" title="پیشرفت واقعی">و ${toPersianDigits(Math.round(actual))}٪</span>
                        </div>
                    </div>
                    ${delay ? `<div class="pointer-events-none text-center" style="position:absolute; right:${100 - titleLeftPct}%; top:${titleTopPct}%; transform:translate(50%, calc(-50% + 15px)); width:160px; z-index:6;">
                        <span class="animate-pulse text-[8px] font-extrabold px-1.5 py-0.5 rounded-full inline-block" style="background:#dc2626; color:#ffffff; box-shadow:0 0 6px rgba(220,38,38,.7);" title="زیرفعالیت تاخیردار">⚠ ${esc(lcTitleWithReviewFlag(delay.item.title).clean)} (+${toPersianDigits(delay.delayDays)} روز)</span>
                    </div>` : ''}
                    <div class="lc-callout${isSelected ? ' lc-callout-pinned' : ''} pointer-events-none" style="position:absolute; ${pushLeft ? 'right' : 'left'}:calc(100% + 10px); top:50%; transform:translateY(-50%); width:180px; z-index:5;">
                        <div class="rounded-xl px-3 py-2.5 text-center" style="background:rgba(8,15,30,.88); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.14); box-shadow:0 8px 24px rgba(0,0,0,.35);">
                            <p class="text-[10px] font-bold" style="color:${meta.color};">${toPersianDigits(i + 1)} · ${esc(meta.label)}</p>
                            <p class="text-[12px] font-extrabold text-white leading-snug mt-1">${esc(p.title)}</p>
                            <div class="grid grid-cols-2 gap-1.5 mt-2">
                                <div class="rounded-lg py-1.5" style="background:${LC_NODE_PLANNED_COLOR}22;">
                                    <p class="text-[9px] font-bold" style="color:${LC_NODE_PLANNED_COLOR};">برنامه‌ای</p>
                                    <p class="text-sm font-extrabold" style="color:${LC_NODE_PLANNED_COLOR};">${toPersianDigits(Math.round(planned))}٪</p>
                                </div>
                                <div class="rounded-lg py-1.5" style="background:${LC_NEON_GREEN}22;">
                                    <p class="text-[9px] font-bold" style="color:${LC_NEON_GREEN};">واقعی</p>
                                    <p class="text-sm font-extrabold" style="color:${LC_NEON_GREEN};">${toPersianDigits(Math.round(actual))}٪</p>
                                </div>
                            </div>
                            <div class="flex items-center justify-between text-[10px] mt-2 pt-1.5" style="border-top:1px solid rgba(255,255,255,.14); color:#cbd5e1;">
                                <span>معیار عبور</span><b style="color:${counts.criteriaTotal && counts.criteriaOk === counts.criteriaTotal ? LC_NEON_GREEN : '#fbbf24'};">${toPersianDigits(counts.criteriaOk)}/${toPersianDigits(counts.criteriaTotal)} تایید</b>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            return `
            <svg viewBox="0 0 ${VB} ${VB}" class="w-full h-auto select-none" style="overflow: visible;">
                <defs>
                    <radialGradient id="lcCoreGrad" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="#123159"/><stop offset="100%" stop-color="#08152c"/></radialGradient>
                    <filter id="lcNodeBlur" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>
                    ${gradDefs}
                </defs>
                <circle cx="${cx}" cy="${cy}" r="${nodeOrbitR}" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1" stroke-dasharray="2 6"/>
                ${connectorsHtml}
                <circle cx="${cx}" cy="${cy}" r="${coreR}" fill="url(#lcCoreGrad)"/>
                ${arc(plannedR, overall.planned, `stroke:${LC_PLANNED_COLOR};stroke-width:3.5;opacity:.7;`)}
                ${arc(actualR, overall.actual, `stroke:${LC_NEON_GREEN};stroke-width:4;filter:drop-shadow(0 0 5px ${LC_NEON_GREEN}) drop-shadow(0 0 12px ${LC_NEON_GREEN}aa);`)}
                ${nodesHtml}
            </svg>
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">${lcCoreOverlayHtml()}</div>
            <div class="absolute inset-0 pointer-events-none">${labelsHtml}</div>`;
        }

        function lcCoreOverlayHtml() {
            const overall = lcOverallProgress();
            const variance = Math.round(overall.actual) - Math.round(overall.planned);
            const status = variance < -5 ? 'عقب از برنامه' : variance > 2 ? 'جلوتر از برنامه' : 'مطابق برنامه';
            const statusColor = variance < -5 ? 'text-red-400' : variance > 2 ? 'text-emerald-400' : 'text-blue-300';
            const activePhase = lcCurrentActivePhase();
            return `
            <div class="text-center px-4" style="max-width:230px;">
                <p class="text-[11px] font-bold tracking-wide" style="color:#93c5fd;">پیشرفت کلی پروژه</p>
                <p class="text-5xl font-extrabold text-white leading-none mt-1.5">${toPersianDigits(Math.round(overall.actual))}<span class="text-xl">٪</span></p>
                <p class="text-[11px] mt-1" style="color:#cbd5e1;">واقعی</p>
                <p class="text-xs mt-2" style="color:#94a3b8;">برنامه‌ای: <b style="color:#e2e8f0;">${toPersianDigits(Math.round(overall.planned))}٪</b></p>
                <p class="text-xs font-bold mt-1 ${statusColor}">${variance >= 0 ? '+' : ''}${toPersianDigits(Math.round(variance))}٪ — ${status}</p>
                ${activePhase ? `<p class="text-[11px] mt-2 pt-2 border-t" style="border-color:rgba(255,255,255,.12); color:#93c5fd;">فاز جاری: <b style="color:#fff;">${esc(activePhase.title)}</b></p>` : ''}
            </div>`;
        }

        function lcLegendHtml() {
            return `<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-4 pt-3" style="border-top: 1px solid rgba(255,255,255,.08);">
                ${Object.values(LC_NODE_STATUS_META).map(m => `<span class="inline-flex items-center gap-1.5 text-[10px] font-semibold" style="color:#94a3b8;"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${m.color}"></span>${esc(m.label)}</span>`).join('')}
            </div>`;
        }

        // شناسنامه پروژه — now a thin strip along the top of the orbit panel
        // rather than its own side column, so the orbit keeps the entire
        // width of the page. Real fields only (from «اطلاعات پایه پروژه»);
        // no photo/location/quality/HSE fields exist anywhere in this app
        // yet, so those stay out rather than being invented. The schedule
        // variance itself is already shown in the exec strip above, so this
        // doesn't repeat it as a separate gauge.
        function lcIdentityStripHtml() {
            const cr = lcState.clientReport;
            const parts = [
                cr?.contract_type === 'سایر' ? cr?.contract_type_other : cr?.contract_type,
                cr?.contractor_name ? `پیمانکار: ${cr.contractor_name}` : null,
                cr?.consultant_name ? `مشاور: ${cr.consultant_name}` : null,
            ].filter(Boolean);
            return `
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-4 mb-4" style="border-bottom: 1px solid rgba(255,255,255,.08);">
                <p class="text-white font-extrabold text-sm md:text-base">${esc(lcState.projectName)}</p>
                ${parts.length ? `<p class="text-[11px] md:text-xs" style="color:#93c5fd;">${parts.map(esc).join(' · ')}</p>` : ''}
            </div>`;
        }

        function lcExecStripHtml() {
            const overall = lcOverallProgress();
            const variance = Math.round(overall.actual) - Math.round(overall.planned);
            const activePhase = lcCurrentActivePhase();
            const gate = activePhase ? lcGateReadiness(activePhase) : null;
            const gateMeta = gate ? LC_GATE_STATUS_META[gate.effective] : null;

            let pendingMandatory = 0, blockedItems = 0;
            lcState.phases.forEach(p => {
                const it = lcState.items[p.code] || { objective: {}, output: {}, criterion: {} };
                (p.lifecycle_criteria || []).filter(c => c.is_mandatory && c.is_active !== false).forEach(c => {
                    if (!['verified', 'waived'].includes(it.criterion[c.id]?.status)) pendingMandatory++;
                });
                Object.values(it.criterion).forEach(row => { if (row.status === 'failed') blockedItems++; });
            });

            return `
            <div class="lc-dark-panel rounded-2xl p-5" style="background: linear-gradient(135deg, #0b1830, #10243f);">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p class="text-[11px]" style="color:#93c5fd;">پیشرفت واقعی کل</p><p class="text-2xl font-extrabold text-white">${toPersianDigits(Math.round(overall.actual))}٪</p></div>
                    <div><p class="text-[11px]" style="color:#93c5fd;">پیشرفت برنامه‌ای کل</p><p class="text-2xl font-extrabold text-white">${toPersianDigits(Math.round(overall.planned))}٪</p></div>
                    <div><p class="text-[11px]" style="color:#93c5fd;">انحراف</p><p class="text-2xl font-extrabold ${variance < -5 ? 'text-red-400' : variance > 2 ? 'text-emerald-400' : 'text-blue-300'}">${variance >= 0 ? '+' : ''}${toPersianDigits(Math.round(variance))}٪</p></div>
                    <div><p class="text-[11px]" style="color:#93c5fd;">فاز جاری</p><p class="text-lg font-extrabold text-white">${activePhase ? esc(activePhase.title) : '—'}</p></div>
                </div>
                <div class="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t" style="border-color:rgba(255,255,255,.1);">
                    ${gateMeta ? `<span class="text-[11px] px-2.5 py-1 rounded-full font-bold bg-${gateMeta.color}-100 text-${gateMeta.color}-700">گیت فاز جاری: ${esc(gateMeta.label)}</span>` : ''}
                    ${pendingMandatory ? `<span class="text-[11px] px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-700">${toPersianDigits(pendingMandatory)} معیار الزامی معلق</span>` : ''}
                    ${blockedItems ? `<span class="text-[11px] px-2.5 py-1 rounded-full font-bold bg-red-100 text-red-700">${toPersianDigits(blockedItems)} مورد مسدود</span>` : ''}
                </div>
            </div>`;
        }

        function lcStatusMeta(kind, status) {
            const found = (LC_KIND_STATUSES[kind] || []).find(([sv]) => sv === status);
            return found ? { label: found[1], color: found[2] } : { label: status || '—', color: 'slate' };
        }
        function lcStatusBadge(kind, status) {
            const meta = lcStatusMeta(kind, status);
            return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-${meta.color}-100 text-${meta.color}-700">${esc(meta.label)}</span>`;
        }

        // «خروجی کلیدی رو در یک لیست برای اطلاع ... بیاور اما نیاز به ورود
        // هیچ اطلاعاتی نداشته باشند و محاسبات هم بر اساس آن‌ها نباشد» —
        // Key Outputs are purely informational now: no status, no evidence,
        // no calc dependency, just a plain reference list. Exit Criteria
        // keep their full interactive checklist (status/evidence/file),
        // since they still gate whether the phase can PASS — they just no
        // longer show an aggregate percentage either (see lcPhaseProgress).
        function lcOutputListHtml(phase) {
            const master = (phase.lifecycle_outputs || []).filter(m => m.is_active !== false).slice().sort((a, b) => a.seq - b.seq);
            if (!master.length) return '';
            return `
            <div>
                <p class="text-[11px] font-extrabold text-slate-500 mb-1.5">خروجی‌های کلیدی <span class="text-slate-400 font-normal">(اطلاع‌رسانی — بدون نیاز به ثبت)</span></p>
                <ul class="space-y-1 list-disc pr-4">
                    ${master.map(m => {
                        const { clean, needsReview } = lcTitleWithReviewFlag(m.title);
                        return `<li class="text-xs text-slate-600">${esc(clean)}${needsReview ? ' <span title="این مورد از استخراج تصویری سند مرجع است و باید توسط PMO تایید شود" class="text-amber-500 cursor-help">⚠</span>' : ''}</li>`;
                    }).join('')}
                </ul>
            </div>`;
        }

        function lcChecklistSectionHtml(phase, kind, label) {
            const masterKey = kind === 'objective' ? 'lifecycle_objectives' : kind === 'output' ? 'lifecycle_outputs' : 'lifecycle_criteria';
            const master = (phase[masterKey] || []).filter(m => m.is_active !== false).slice().sort((a, b) => a.seq - b.seq);
            if (!master.length) return '';
            const progressMap = (lcState.items[phase.code] || {})[kind] || {};
            const statuses = LC_KIND_STATUSES[kind];
            return `
            <div>
                <p class="text-[11px] font-extrabold text-slate-500 mb-1.5">${esc(label)}</p>
                <div class="space-y-1.5">
                    ${master.map(m => {
                        const row = progressMap[m.id] || { status: statuses[0][0] };
                        const { clean, needsReview } = lcTitleWithReviewFlag(m.title);
                        const mandatoryTag = (kind === 'criterion' && m.is_mandatory) ? '<span class="text-[9px] font-bold text-red-500 mr-1">[الزامی]</span>' : '';
                        return `
                        <div class="border rounded-xl p-2.5" data-lc-item-row data-kind="${kind}" data-item-id="${m.id}" data-phase="${phase.code}">
                            <div class="flex items-center justify-between gap-2">
                                <p class="text-xs font-bold text-slate-700 flex-1">${esc(clean)}${mandatoryTag}${needsReview ? ' <span title="این مورد از استخراج تصویری سند مرجع است و باید توسط PMO تایید شود" class="text-amber-500 cursor-help">⚠</span>' : ''}</p>
                                ${lcStatusBadge(kind, row.status)}
                            </div>
                            ${lcState.canEdit ? `
                            <div class="flex flex-wrap items-center gap-1.5 mt-2">
                                <select data-lc-action="set-status" class="text-[10px] border rounded-lg px-1.5 py-1">
                                    ${statuses.map(([sv, sl]) => `<option value="${sv}" ${row.status === sv ? 'selected' : ''}>${esc(sl)}</option>`).join('')}
                                </select>
                                <input type="text" data-lc-field="evidence" placeholder="مدرک/شاهد (لینک یا توضیح)" value="${esc(row.evidence || '')}" class="text-[10px] border rounded-lg px-2 py-1 flex-1 min-w-[110px]">
                                <input type="file" data-lc-field="evidence-file" class="text-[10px]" style="max-width:130px;">
                                <button type="button" data-lc-action="save-item" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-900 text-white">ذخیره</button>
                            </div>
                            ${row.evidence_file_url ? `<a href="${esc(row.evidence_file_url)}" target="_blank" rel="noopener" class="text-[10px] text-blue-600 underline mt-1 inline-block">📎 مشاهده فایل ضمیمه</a>` : ''}
                            ` : `
                            ${row.evidence ? `<p class="text-[10px] text-slate-400 mt-1">مدرک: ${esc(row.evidence)}</p>` : ''}
                            ${row.evidence_file_url ? `<a href="${esc(row.evidence_file_url)}" target="_blank" rel="noopener" class="text-[10px] text-blue-600 underline mt-1 inline-block">📎 مشاهده فایل ضمیمه</a>` : ''}
                            `}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }

        function lcSparklineHtml(values) {
            if (!values || values.length < 2) return '';
            const w = 260, h = 40, pad = 4, max = 100, min = 0;
            const pts = values.map((v, i) => {
                const x = pad + (i / (values.length - 1)) * (w - pad * 2);
                const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
                return `${x},${y}`;
            }).join(' ');
            return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-10"><polyline points="${pts}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }

        function lcEpcDrilldownHtml() {
            const cr = lcState.clientReport;
            if (!cr) return `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-700">هنوز «اطلاعات پایه و پیشرفت پروژه» برای این پروژه ثبت نشده؛ پیشرفت E/P/C از آن فرم خوانده می‌شود.</div>`;
            const rows = [['engineering', 'مهندسی (E)'], ['procurement', 'تدارکات (P)'], ['construction', 'اجرا (C)']];
            const overall = lcEpcWeighted(cr, 'actual'), overallPlanned = lcEpcWeighted(cr, 'planned');
            return `
            <div class="border rounded-xl p-3 space-y-2.5">
                <div class="flex items-center justify-between">
                    <p class="text-[11px] font-extrabold text-slate-600">درون‌کاوی EPC (مهندسی / تدارکات / اجرا)</p>
                    <button type="button" data-lc-action="goto-client-report" class="text-[10px] font-bold text-blue-700 underline">ویرایش در «اطلاعات پایه پروژه»</button>
                </div>
                ${rows.map(([key, rlabel]) => {
                    const w = Number(cr[`progress_${key}_weight`]) || 0;
                    const a = Number(cr[`progress_${key}`]) || 0;
                    const pl = Number(cr[`progress_${key}_planned`]) || 0;
                    const v = a - pl;
                    return `<div>
                        <div class="flex items-center justify-between text-[11px] mb-1">
                            <span class="font-bold text-slate-600">${rlabel} <span class="text-slate-400 font-normal">وزن ${toPersianDigits(w)}٪</span></span>
                            <span class="font-bold ${v < -5 ? 'text-red-600' : v > 0 ? 'text-emerald-600' : 'text-slate-600'}">${toPersianDigits(a)}٪ <span class="text-slate-400 font-normal">(برنامه ${toPersianDigits(pl)}٪)</span></span>
                        </div>
                        <div class="h-2 rounded-full bg-slate-100 overflow-hidden relative">
                            <div class="h-full bg-slate-300 absolute inset-y-0 right-0" style="width:${Math.min(100, pl)}%"></div>
                            <div class="h-full bg-blue-600 absolute inset-y-0 right-0" style="width:${Math.min(100, a)}%"></div>
                        </div>
                    </div>`;
                }).join('')}
                <div class="pt-2 border-t flex items-center justify-between text-xs">
                    <span class="font-extrabold text-slate-700">پیشرفت وزنی EPC</span>
                    <span class="font-extrabold text-slate-800">${toPersianDigits(Math.round(overall))}٪ <span class="text-slate-400 font-normal text-[10px]">(برنامه ${toPersianDigits(Math.round(overallPlanned))}٪)</span></span>
                </div>
            </div>`;
        }

        function lcBasicDesignHtml(phase, pp) {
            const history = lcState.progressHistory[phase.code] || [];
            const latest = pp.manual_actual_pct;
            return `
            <div class="border rounded-xl p-3 space-y-2.5">
                <div class="flex items-center justify-between">
                    <p class="text-[11px] font-extrabold text-slate-600">پیشرفت دوره‌ای طراحی پایه</p>
                    ${pp.contract_value ? `<span class="text-[10px] text-slate-400">ارزش قرارداد: ${toPersianDigits(Number(pp.contract_value).toLocaleString('en-US'))} ریال</span>` : ''}
                </div>
                ${lcSparklineHtml(history.map(h => h.new_pct))}
                <div class="text-[11px] text-slate-500">آخرین درصد ثبت‌شده: <b class="text-slate-800">${latest != null ? toPersianDigits(latest) + '٪' : '—'}</b></div>
                ${history.length ? `<div class="max-h-28 overflow-y-auto scroll-thin space-y-1">
                    ${history.slice().reverse().map(h => `<div class="flex items-center justify-between text-[10px] text-slate-500 border-b pb-1">
                        <span>${esc(h.period_label || formatJalali(h.recorded_at))}</span>
                        <span>${h.previous_pct != null ? toPersianDigits(h.previous_pct) + '٪ ← ' : ''}<b class="text-slate-700">${toPersianDigits(h.new_pct)}٪</b></span>
                    </div>`).join('')}
                </div>` : ''}
                ${lcState.canEdit ? `
                <div class="grid grid-cols-3 gap-1.5 pt-1">
                    <input type="text" data-lc-field="bd-period" placeholder="برچسب دوره (مثلاً هفته ۲ آبان)" class="text-[10px] border rounded-lg px-2 py-1.5 col-span-3 md:col-span-1">
                    <input type="number" min="0" max="100" data-lc-field="bd-pct" placeholder="درصد جدید" class="text-[10px] border rounded-lg px-2 py-1.5">
                    <button type="button" data-lc-action="record-bd-progress" data-phase="${phase.code}" class="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-blue-900 text-white">ثبت پیشرفت دوره</button>
                </div>` : ''}
            </div>`;
        }

        function lcGateActionsHtml(phase, gate) {
            if (!lcState.canEdit) return '';
            const pp = lcState.projectPhases[phase.code] || {};
            const stored = pp.gate_status || 'not_ready';
            let body;
            if (stored === 'passed') {
                body = `<div class="space-y-2">
                    <p class="text-[11px] text-emerald-700 font-bold">✓ این گیت تایید نهایی شده است.</p>
                    ${isAdminUser() ? `<button type="button" data-lc-action="cancel-gate-pass" data-phase="${phase.code}" class="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-400 text-red-500 hover:bg-red-50">لغو تایید نهایی (در صورت تایید اشتباه)</button>` : ''}
                </div>`;
            } else if (stored === 'conditional') {
                body = `<p class="text-[11px] text-purple-700 font-bold">این گیت با شرط عبور کرده — پیگیری شرط لازم است (به تاریخچه تصمیمات مراجعه کنید).</p>`;
            } else if (isAdminUser()) {
                body = `
                <div class="space-y-2">
                    <p class="text-[11px] text-slate-500">${gate.readyForGate ? 'همه موارد الزامی تکمیل شده — آماده تصمیم‌گیری Gate.' : 'برخی موارد الزامی هنوز تکمیل نشده است.'}</p>
                    <div class="grid grid-cols-3 gap-1.5">
                        <button type="button" data-lc-action="gate-pass" data-phase="${phase.code}" class="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-emerald-600 text-white">PASS GATE</button>
                        <button type="button" data-lc-action="gate-conditional" data-phase="${phase.code}" class="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-purple-600 text-white">عبور مشروط</button>
                        <button type="button" data-lc-action="gate-return" data-phase="${phase.code}" class="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-red-600 text-white">بازگشت جهت اقدام</button>
                    </div>
                </div>`;
            } else if (stored === 'ready_for_review') {
                body = `<p class="text-[11px] text-blue-700 font-bold">درخواست بررسی Gate ارسال شده — در انتظار تصمیم PMO/تایید‌کننده.</p>`;
            } else {
                body = `<button type="button" data-lc-action="request-gate" data-phase="${phase.code}" ${!gate.readyForGate ? 'disabled' : ''} class="w-full text-[11px] font-bold px-3 py-2 rounded-xl ${gate.readyForGate ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}">درخواست بررسی Gate</button>`;
            }
            return `<div class="border rounded-xl p-3">${body}</div>`;
        }

        function lcApprovalsHistoryHtml(phase) {
            const decisions = lcState.gateDecisions[phase.code] || [];
            if (!decisions.length) return '';
            const labels = { pass: 'PASS', conditional: 'عبور مشروط', return: 'بازگشت جهت اقدام', cancelled: 'لغو تایید نهایی' };
            return `<div>
                <p class="text-[11px] font-extrabold text-slate-500 mb-1.5">تاریخچه تصمیمات Gate</p>
                <div class="space-y-1.5">
                    ${decisions.map(d => `<div class="text-[10px] border rounded-lg p-2">
                        <div class="flex items-center justify-between"><b class="text-slate-700">${esc(labels[d.decision] || d.decision)}</b><span class="text-slate-400">${formatJalali(d.decided_at)}</span></div>
                        <p class="text-slate-500 mt-0.5">توسط: ${esc(d.decided_by)}</p>
                        ${d.reason ? `<p class="text-red-500 mt-0.5">دلیل: ${esc(d.reason)}</p>` : ''}
                        ${d.condition_text ? `<p class="text-purple-600 mt-0.5">شرط: ${esc(d.condition_text)}${d.condition_owner ? ' — مسئول: ' + esc(d.condition_owner) : ''}${d.condition_due_date ? ' — مهلت: ' + formatJalali(d.condition_due_date) : ''}</p>` : ''}
                    </div>`).join('')}
                </div>
            </div>`;
        }

        function lcRisksSectionHtml(phase) {
            const it = lcState.items[phase.code] || { objective: {}, output: {}, criterion: {} };
            const risks = [];
            (phase.lifecycle_criteria || []).forEach(c => { if (it.criterion[c.id]?.status === 'failed') risks.push({ label: c.title, kind: 'معیار ناموفق', comment: it.criterion[c.id].comment }); });
            if (!risks.length) return '';
            return `<div class="bg-red-50 border border-red-200 rounded-xl p-3">
                <p class="text-[11px] font-extrabold text-red-700 mb-1.5">ریسک‌ها / موانع اثرگذار بر گیت</p>
                <div class="space-y-1">${risks.map(r => `<p class="text-[10px] text-red-600">• <b>${esc(r.kind)}:</b> ${esc(lcTitleWithReviewFlag(r.label).clean)}${r.comment ? ' — ' + esc(r.comment) : ''}</p>`).join('')}</div>
            </div>`;
        }

        function lcPhaseScheduleHtml(phase, pp) {
            const fmt = (d) => d ? formatJalali(d) : '—';
            // project_lifecycle_phases.actual_start/actual_finish are never
            // written by any form in this module — fall back to the same
            // schedule-item rollup the Gantt bar itself now uses, so this
            // panel doesn't keep reading "—" even once every sub-activity
            // is actually done.
            const derived = pp.actual_start || pp.actual_finish ? null : lcPhaseActualDateRange(phase.code);
            const actualStart = pp.actual_start || derived?.start;
            const actualFinish = pp.actual_finish || derived?.finish;
            return `<div class="border rounded-xl p-3 space-y-1.5 text-[11px]">
                <div class="flex justify-between"><span class="text-slate-500">شروع برنامه‌ای</span><b class="text-slate-700">${fmt(pp.planned_start)}</b></div>
                <div class="flex justify-between"><span class="text-slate-500">پایان برنامه‌ای</span><b class="text-slate-700">${fmt(pp.planned_finish)}</b></div>
                <div class="flex justify-between"><span class="text-slate-500">شروع واقعی</span><b class="text-slate-700">${fmt(actualStart)}</b></div>
                <div class="flex justify-between"><span class="text-slate-500">پایان واقعی</span><b class="text-slate-700">${fmt(actualFinish)}</b></div>
                <div class="flex justify-between"><span class="text-slate-500">وزن فاز در چرخه عمر</span><b class="text-slate-700">${pp.weight_pct != null ? toPersianDigits(pp.weight_pct) + '٪' : 'به‌صورت مساوی'}</b></div>
                ${isAdminUser() ? `
                <div class="flex items-center gap-2 pt-1">
                    <input type="number" min="0" max="100" step="0.1" data-lc-field="phase-weight" value="${pp.weight_pct ?? ''}" placeholder="وزن فاز (٪)" class="text-[10px] border rounded-lg px-2 py-1 flex-1">
                    <button type="button" data-lc-action="save-phase-weight" data-phase="${phase.code}" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-900 text-white">ذخیره وزن</button>
                </div>
                <p class="text-[9px] text-slate-400">جمع وزن همه فازها اکنون: ${toPersianDigits(Math.round(lcTotalWeight()))}٪ (باید ۱۰۰٪ باشد)</p>` : ''}
            </div>`;
        }

        function lcDetailPanelHtml() {
            if (!lcState.selectedPhase) {
                return `<div class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-10 gap-2">
                    ${iconSvg('target', 'w-10 h-10 opacity-40')}
                    <p class="text-sm font-bold text-slate-500">یک فاز را از روی مدار انتخاب کنید</p>
                    <p class="text-xs">خروجی‌های کلیدی، معیارهای عبور و وضعیت گیت همین‌جا نمایش داده می‌شود؛ اهداف مرحله را در جدول زمانی همین فاز ببینید.</p>
                </div>`;
            }
            const phase = lcState.phases.find(p => p.code === lcState.selectedPhase);
            if (!phase) return lcEmptyStateHtml('فاز یافت نشد.');
            const gate = lcGateReadiness(phase);
            const pp = lcState.projectPhases[phase.code] || {};

            // The header (title/responsible/gate name), the actual/planned/
            // variance stat tiles and the gate-status badge are all already
            // shown in the phase detail page's dark hero above this card —
            // this body starts straight from the drilldown/checklists so
            // nothing is duplicated.
            return `
            <div class="space-y-4">
                ${phase.progress_engine === 'epc' ? lcEpcDrilldownHtml() : ''}
                ${phase.progress_engine === 'basic_design' ? lcBasicDesignHtml(phase, pp) : ''}

                ${lcOutputListHtml(phase)}
                ${lcChecklistSectionHtml(phase, 'criterion', 'معیار عبور (Exit Criteria)')}

                ${lcGateActionsHtml(phase, gate)}
                ${lcRisksSectionHtml(phase)}
                ${lcApprovalsHistoryHtml(phase)}
                ${lcPhaseScheduleHtml(phase, pp)}
            </div>`;
        }

        function lcMetadataBarHtml() {
            const cr = lcState.clientReport;
            const g1Pass = (lcState.gateDecisions['G1'] || []).find(d => d.decision === 'pass');
            const plannedStart = lcState.phases.length ? lcState.projectPhases[lcState.phases[0].code]?.planned_start : null;
            const plannedEnd = cr?.contract_end_date || null;
            const forecastEnd = cr?.forecast_completion_date || null;
            const todayIso = new Date().toISOString().slice(0, 10);
            const durDays = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;
            const plannedDuration = durDays(plannedStart, plannedEnd);
            const elapsed = plannedStart ? durDays(plannedStart, todayIso) : null;
            const remaining = forecastEnd ? durDays(todayIso, forecastEnd) : null;

            const cells = [
                ['تاریخ ابلاغ پروژه', g1Pass ? formatJalali(g1Pass.decided_at) : '—'],
                ['شماره نامه / مصوبه', '—'],
                ['تاریخ تصویب / ابلاغ', g1Pass ? formatJalali(g1Pass.decided_at) : '—'],
                ['تاریخ شروع برنامه‌ای', plannedStart ? formatJalali(plannedStart) : '—'],
                ['تاریخ پایان برنامه‌ای', plannedEnd ? formatJalali(plannedEnd) : '—'],
                ['تاریخ پیش‌بینی پایان واقعی', forecastEnd ? formatJalali(forecastEnd) : '—'],
                ['مدت برنامه‌ای', plannedDuration != null ? toPersianDigits(plannedDuration) + ' روز' : '—'],
                ['مدت سپری‌شده', elapsed != null ? toPersianDigits(Math.max(0, elapsed)) + ' روز' : '—'],
                ['مدت باقی‌مانده', remaining != null ? toPersianDigits(remaining) + ' روز' : '—'],
            ];
            return `<div class="bg-white rounded-2xl shadow-sm border p-4">
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
                    ${cells.map(([clabel, cvalue]) => `<div class="text-center"><p class="text-[9px] text-slate-400 mb-0.5">${esc(clabel)}</p><p class="text-[11px] font-extrabold text-slate-700">${cvalue}</p></div>`).join('')}
                </div>
            </div>`;
        }

        // ---------------- Lifecycle Master Plan (Gantt) — Phase 1: ----------------
        // read-only. Renders every phase as a top-level Gantt row (using the
        // planned/actual dates already on project_lifecycle_phases — no new
        // table needed for the phase level itself) and, under each phase,
        // its lifecycle_schedule_items tree of sub-phases/activities,
        // expand/collapse per node, plus FS/SS/FF/SF dependency lines drawn
        // between whichever nodes are currently visible. Editing (drag-and-
        // drop, add/remove nodes and dependencies), the "effective timeline
        // coverage" validator, the bottom-up progress rollup and baselines
        // are later phases of this same feature, not this one.
        const LC_JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        const LC_GANTT_ROW_H = 30;
        const LC_GANTT_HEADER_H = 32;
        const LC_GANTT_LABEL_W = 260;
        const LC_GANTT_TIMELINE_W_BASE = 760;
        const LC_GANTT_ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3];

        // «امکان زوم کردن روی فعالیت‌ها و گانت» — everything below already
        // positions bars/ticks by PERCENTAGE of this width, so widening it
        // is the whole zoom: more pixels per day, same dates.
        function lcGanttTimelineW() { return Math.round(LC_GANTT_TIMELINE_W_BASE * (lcState.ganttZoom || 1)); }
        function lcGanttZoomStep(dir) {
            const levels = LC_GANTT_ZOOM_LEVELS;
            const idx = levels.indexOf(lcState.ganttZoom || 1);
            const nextIdx = idx === -1 ? levels.indexOf(1) : Math.min(levels.length - 1, Math.max(0, idx + dir));
            lcState.ganttZoom = levels[nextIdx];
            lcRenderAll();
        }

        function lcTabBarHtml() {
            const tabs = [['orbit', 'نمای مداری'], ['plan', 'برنامه زمان‌بندی (Gantt)']];
            return `<div class="no-print flex items-center gap-2">
                ${tabs.map(([key, label]) => `<button type="button" data-lc-tab="${key}" class="text-xs font-bold px-4 py-2 rounded-xl border transition ${lcState.activeTab === key ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-500 hover:bg-slate-50'}">${esc(label)}</button>`).join('')}
            </div>`;
        }

        function lcScheduleChildren(phaseCode, parentId) {
            return lcState.scheduleItems.filter(si => si.phase_code === phaseCode && (si.parent_id ?? null) === parentId);
        }

        function lcAppendScheduleChildRows(rows, phaseCode, parentId, depth) {
            lcScheduleChildren(phaseCode, parentId).forEach(item => {
                const rowId = 'item:' + item.id;
                const children = lcScheduleChildren(phaseCode, item.id);
                rows.push({ id: rowId, depth, title: item.title, isPhase: false, phaseCode, item, start: item.planned_start, finish: item.planned_finish, hasChildren: children.length > 0 });
                if (children.length && !lcState.collapsedScheduleRows.has(rowId)) lcAppendScheduleChildRows(rows, phaseCode, item.id, depth + 1);
            });
        }

        // phaseFilter, when given, scopes rows to just that one phase — used
        // by the phase detail page's own timeline section; omitted, it
        // builds the whole-project Master Plan tab.
        function lcBuildScheduleRows(phaseFilter) {
            const rows = [];
            const phasesToShow = phaseFilter ? lcState.phases.filter(p => p.code === phaseFilter) : lcState.phases;
            phasesToShow.forEach(phase => {
                const pp = lcState.projectPhases[phase.code] || {};
                const rowId = 'phase:' + phase.code;
                const topChildren = lcScheduleChildren(phase.code, null);
                rows.push({
                    id: rowId, depth: 0, title: phase.title, isPhase: true, phaseCode: phase.code,
                    start: pp.planned_start, finish: pp.planned_finish, actualStart: pp.actual_start, actualFinish: pp.actual_finish,
                    gateStatus: pp.gate_status || 'not_ready', hasChildren: topChildren.length > 0,
                });
                if (topChildren.length && !lcState.collapsedScheduleRows.has(rowId)) lcAppendScheduleChildRows(rows, phase.code, null, 1);
            });
            return rows;
        }

        // Deliberately computed from ALL phases/items regardless of what's
        // currently expanded — collapsing a branch narrows which rows are
        // drawn but must not rescale the timeline underneath the rest of
        // the chart. Same phaseFilter as lcBuildScheduleRows, kept as a
        // separate parameter (rather than deriving the range from the rows
        // themselves) precisely so collapsing doesn't rescale it either.
        function lcScheduleDateRange(phaseFilter) {
            const dates = [];
            const phasesToScan = phaseFilter ? lcState.phases.filter(p => p.code === phaseFilter) : lcState.phases;
            phasesToScan.forEach(phase => {
                const pp = lcState.projectPhases[phase.code];
                if (pp) dates.push(pp.planned_start, pp.planned_finish, pp.actual_start, pp.actual_finish);
            });
            const itemsToScan = phaseFilter ? lcState.scheduleItems.filter(si => si.phase_code === phaseFilter) : lcState.scheduleItems;
            itemsToScan.forEach(si => dates.push(si.planned_start, si.planned_finish));
            let min = null, max = null;
            dates.forEach(d => {
                if (!d) return;
                const t = new Date(d).getTime();
                if (isNaN(t)) return;
                if (min == null || t < min) min = t;
                if (max == null || t > max) max = t;
            });
            if (min == null) return null;
            const spanDays = Math.max(1, (max - min) / 86400000);
            const padDays = Math.max(3, Math.round(spanDays * 0.04));
            const minD = new Date(min); minD.setDate(minD.getDate() - padDays);
            const maxD = new Date(max); maxD.setDate(maxD.getDate() + padDays);
            return { minIso: minD.toISOString().slice(0, 10), maxIso: maxD.toISOString().slice(0, 10), totalDays: Math.max(1, (maxD - minD) / 86400000) };
        }

        function lcPctForDate(iso, range) {
            if (!iso || !range) return null;
            const days = (new Date(iso) - new Date(range.minIso)) / 86400000;
            return Math.max(0, Math.min(100, (days / range.totalDays) * 100));
        }

        // «بخش هدر که مربوط به تاریخ هست دارای دو سطر باشد سطر بالایی سال
        // ... سطر پایین شماره ماه ... هدف اینه که با نوشتن تاریخ‌ها کل هدر
        // سیاه نشود» — yearLabel/monthLabel are rendered as two short
        // stacked lines instead of one long "MonthName Year" string, so
        // dense multi-year ranges (many month boundaries close together)
        // don't overlap into an unreadable block of text.
        function lcJalaliMonthTicks(range) {
            const ticks = [];
            const d = new Date(range.minIso);
            const end = new Date(range.maxIso);
            let guard = 0;
            while (d <= end && guard < 3000) {
                const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                if (jd === 1) ticks.push({ iso: d.toISOString().slice(0, 10), yearLabel: toPersianDigits(jy), monthLabel: toPersianDigits(String(jm).padStart(2, '0')) });
                d.setDate(d.getDate() + 1);
                guard++;
            }
            return ticks;
        }

        // Faint alternating week bands across the timeline body — a rough,
        // color-only sense of day-level granularity between month
        // boundaries without adding any more text next to the already
        // dense month/year ticks.
        function lcWeekBandsHtml(range) {
            const bands = [];
            let weekIndex = 0;
            for (let offset = 0; offset < range.totalDays; offset += 7, weekIndex++) {
                if (weekIndex % 2 === 0) continue;
                const leftPct = (offset / range.totalDays) * 100;
                const widthPct = (Math.min(7, range.totalDays - offset) / range.totalDays) * 100;
                bands.push(`<div class="absolute inset-y-0" style="left:${leftPct}%; width:${widthPct}%; background:#ffffff; opacity:.025;"></div>`);
            }
            return bands.join('');
        }

        // ---------------- Effective timeline coverage (Phase 3) ----------------
        // "Effective coverage" is a merged-interval check, not a sum of
        // durations: a parent whose children overlap in time (the whole
        // point of letting phases run non-sequentially) must never be
        // flagged just because the durations added together exceed its own
        // span — only an actual uncovered gap, or children spilling outside
        // the parent's own declared range, counts.
        const LC_COVERAGE_META = {
            full: { label: 'پوشش کامل', icon: '🟢' },
            minor_gap: { label: 'شکاف جزئی', icon: '🟡' },
            gap: { label: 'شکاف زمانی', icon: '🔴' },
            overflow: { label: 'تجاوز از بازه', icon: '🔴' },
        };
        function lcDaysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

        function lcMergeIntervals(intervals) {
            const sorted = intervals.slice().sort((a, b) => a[0].localeCompare(b[0]));
            const merged = [];
            sorted.forEach(([s, f]) => {
                const last = merged[merged.length - 1];
                // Two ranges that touch (one starts the very day after the
                // other ends) are back-to-back work, not a gap, so they merge too.
                if (last && s <= lcAddDays(last[1], 1)) { if (f > last[1]) last[1] = f; }
                else merged.push([s, f]);
            });
            return merged;
        }

        function lcCoverageStatus(parentStart, parentFinish, childIntervals) {
            if (!parentStart || !parentFinish) return null;
            const dated = childIntervals.filter(([s, f]) => s && f);
            const parentDurationDays = lcDaysBetween(parentStart, parentFinish) + 1;
            if (!dated.length) return { status: 'gap', gapDays: parentDurationDays, overflowDays: 0, coveragePct: 0 };
            const merged = lcMergeIntervals(dated);
            let coveredWithinParent = 0;
            merged.forEach(([s, f]) => {
                const cs = s < parentStart ? parentStart : s, cf = f > parentFinish ? parentFinish : f;
                if (cs <= cf) coveredWithinParent += lcDaysBetween(cs, cf) + 1;
            });
            const gapDays = Math.max(0, parentDurationDays - coveredWithinParent);
            const earliest = merged[0][0], latest = merged[merged.length - 1][1];
            const overflowDays = (earliest < parentStart ? lcDaysBetween(earliest, parentStart) : 0) + (latest > parentFinish ? lcDaysBetween(parentFinish, latest) : 0);
            const minorGapThreshold = Math.max(1, Math.round(parentDurationDays * 0.1));
            const status = overflowDays > 1 ? 'overflow' : gapDays > minorGapThreshold ? 'gap' : gapDays > 0 ? 'minor_gap' : 'full';
            return { status, gapDays, overflowDays, coveragePct: Math.round(coveredWithinParent / parentDurationDays * 100) };
        }

        function lcRowCoverage(row) {
            if (!row.hasChildren || !row.start || !row.finish) return null;
            const children = row.isPhase ? lcScheduleChildren(row.phaseCode, null) : lcScheduleChildren(row.phaseCode, row.item.id);
            return lcCoverageStatus(row.start, row.finish, children.map(c => [c.planned_start, c.planned_finish]));
        }

        function lcCoverageSummaryHtml(rows) {
            const counts = { minor_gap: 0, gap: 0, overflow: 0 };
            rows.forEach(r => { const cov = lcRowCoverage(r); if (cov && cov.status !== 'full') counts[cov.status]++; });
            const parts = [];
            if (counts.overflow) parts.push(`${LC_COVERAGE_META.overflow.icon} ${toPersianDigits(counts.overflow)} ردیف با تجاوز از بازه فاز/زیرفاز`);
            if (counts.gap) parts.push(`${LC_COVERAGE_META.gap.icon} ${toPersianDigits(counts.gap)} ردیف با شکاف زمانی`);
            if (counts.minor_gap) parts.push(`${LC_COVERAGE_META.minor_gap.icon} ${toPersianDigits(counts.minor_gap)} ردیف با شکاف جزئی`);
            if (!parts.length) return '';
            return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mb-3 px-3 py-2 rounded-lg" style="background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.2); color:#fca5a5;">${parts.join(' · ')}</div>`;
        }

        // ---------------- Actual-progress rollup + status engine (Phase 4) ----------------
        // A leaf's actual % is the only one ever typed in (via the editor
        // drawer's "٪ پیشرفت واقعی" field, hidden for anything with
        // children); every parent's is always this weighted average of its
        // children, recursing all the way down — Activity -> Sub-Phase ->
        // Phase-level schedule tree. This deliberately stays scoped to the
        // schedule-item tree itself and is never surfaced as a second
        // project-wide "physical progress" number next to the orbit's own
        // (checklist/EPC/basic-design-engine-driven) progress — showing two
        // differently-computed "the" progress numbers side by side would
        // just make it unclear which one is authoritative. Weighting logic
        // mirrors lcCategoryProgress() above: a null weight_pct splits
        // equally with its siblings rather than counting as zero.
        function lcItemActualPct(item) {
            const children = lcScheduleChildren(item.phase_code, item.id);
            if (!children.length) return item.manual_actual_pct != null ? item.manual_actual_pct : 0;
            const hasCustomWeight = children.some(c => typeof c.weight_pct === 'number');
            let sum = 0, totalW = 0;
            children.forEach(c => {
                const w = hasCustomWeight ? (Number(c.weight_pct) || 0) : 1;
                sum += lcItemActualPct(c) * w;
                totalW += w;
            });
            return totalW ? sum / totalW : 0;
        }

        // A PHASE row's own actual progress/dates, rolled up the exact same
        // way lcItemActualPct already rolls up a schedule item WITH
        // children — just applied one level higher, to the phase's own
        // top-level schedule items. project_lifecycle_phases.actual_start/
        // actual_finish are never written by any part of this module (no
        // form anywhere sets them), so a phase's own Gantt bar and its
        // "شروع/پایان واقعی" metadata used to always read empty even after
        // every one of its schedule items reached 100% — this derives both
        // from the schedule tree instead, staying scoped to the Gantt's own
        // rendering of that tree (same "never leaks into the orbit's own
        // checklist-driven progress" boundary as lcItemActualPct above).
        function lcPhaseScheduleActualPct(phaseCode) {
            const topItems = lcScheduleChildren(phaseCode, null);
            if (!topItems.length) return null;
            const hasCustomWeight = topItems.some(c => typeof c.weight_pct === 'number');
            let sum = 0, totalW = 0;
            topItems.forEach(c => {
                const w = hasCustomWeight ? (Number(c.weight_pct) || 0) : 1;
                sum += lcItemActualPct(c) * w;
                totalW += w;
            });
            return totalW ? sum / totalW : 0;
        }

        function lcPhaseActualDateRange(phaseCode) {
            const items = lcState.scheduleItems.filter(si => si.phase_code === phaseCode);
            if (!items.length) return null;
            const started = items.filter(si => lcItemActualPct(si) > 0);
            if (!started.length) return { start: null, finish: null };
            const start = started.reduce((min, si) => (!min || (si.planned_start && si.planned_start < min)) ? si.planned_start : min, null);
            const overallPct = lcPhaseScheduleActualPct(phaseCode);
            let finish = null;
            if (overallPct != null && overallPct >= 100) {
                finish = items.reduce((max, si) => (!max || (si.planned_finish && si.planned_finish > max)) ? si.planned_finish : max, null);
            }
            return { start, finish };
        }

        const LC_ITEM_STATUS_META = {
            completed: { label: 'تکمیل‌شده', icon: '🔵' },
            not_started: { label: 'شروع نشده', icon: '⚪' },
            delayed: { label: 'تاخیردار', icon: '🔴' },
            at_risk: { label: 'در معرض ریسک', icon: '🟡' },
            on_track: { label: 'طبق برنامه', icon: '🟢' },
        };

        // Time Progress (how much of the item's own date window has
        // elapsed, via the same lcPlannedProgressByDate already used for
        // phases) vs Physical Progress (the rollup above) — the two are
        // shown together implicitly: the fill bar IS physical progress,
        // and it sits against the grid's one shared "today" line, so how
        // far the fill reaches relative to that line already reads as
        // "ahead of / behind schedule" without a second per-bar marker.
        // This status badge just names that same comparison explicitly.
        function lcItemStatus(row) {
            if (row.isPhase || !row.start || !row.finish) return null;
            const physicalPct = lcItemActualPct(row.item);
            if (physicalPct >= 100) return 'completed';
            const timePct = lcPlannedProgressByDate(row.start, row.finish);
            if (timePct == null) return null;
            if (physicalPct === 0 && timePct <= 5) return 'not_started';
            const variance = physicalPct - timePct;
            if (variance < -15) return 'delayed';
            if (variance < -5) return 'at_risk';
            return 'on_track';
        }

        function lcGanttLabelHtml(row) {
            const caret = row.hasChildren
                ? `<button type="button" data-lc-toggle-row="${esc(row.id)}" class="w-4 h-4 shrink-0 inline-flex items-center justify-center text-[9px] rounded hover:bg-white/10" style="color:#93c5fd;">${lcState.collapsedScheduleRows.has(row.id) ? '▸' : '▾'}</button>`
                : `<span class="inline-block w-4 shrink-0"></span>`;
            const titleCls = row.isPhase ? 'text-white font-extrabold' : (row.depth === 1 ? 'text-slate-200 font-bold' : 'text-slate-400');
            const gateDot = row.isPhase ? `<span class="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-${LC_GATE_STATUS_META[row.gateStatus].color}-500"></span>` : '';
            const weightTag = (!row.isPhase && row.item?.weight_pct != null) ? `<span class="text-[9px] shrink-0" style="color:#64748b;">${toPersianDigits(row.item.weight_pct)}٪</span>` : '';
            const itemStatus = lcItemStatus(row);
            const statusBadge = itemStatus ? `<span class="shrink-0" title="وضعیت: ${esc(LC_ITEM_STATUS_META[itemStatus].label)}">${LC_ITEM_STATUS_META[itemStatus].icon}</span>` : '';
            const coverage = lcRowCoverage(row);
            const coverageBadge = coverage ? `<span class="shrink-0" title="${esc(LC_COVERAGE_META[coverage.status].label)} (${toPersianDigits(coverage.coveragePct)}٪ پوشش${coverage.overflowDays ? '، ' + toPersianDigits(coverage.overflowDays) + ' روز تجاوز' : ''})">${LC_COVERAGE_META[coverage.status].icon}</span>` : '';
            // Rather than nesting Auto-Fit/Fit-to-Phase inside the editor
            // drawer (which for a phase row never actually represents "the
            // phase itself" — clicking a phase row only ever opens "add a
            // child" — these two live right on any row that has children,
            // as their own <button>s inside this <div>. A <button> nested in
            // a <div> is valid HTML, unlike the caret-in-a-button case above,
            // so only their own stopPropagation is needed to keep a click on
            // them from also opening the editor drawer underneath.
            const fitButtons = (lcState.canEdit && row.hasChildren) ? `<span class="shrink-0 flex items-center">
                <button type="button" data-lc-action="auto-fit" data-row-kind="${row.isPhase ? 'phase' : 'item'}" data-phase="${esc(row.phaseCode)}" data-item-id="${row.isPhase ? '' : row.item.id}" title="تنظیم خودکار بازه این ردیف بر اساس زیرمجموعه‌ها" class="text-[9px] w-4 h-4 inline-flex items-center justify-center rounded hover:bg-white/10" style="color:${LC_PLANNED_COLOR};">⇲</button>
                <button type="button" data-lc-action="fit-children" data-row-kind="${row.isPhase ? 'phase' : 'item'}" data-phase="${esc(row.phaseCode)}" data-item-id="${row.isPhase ? '' : row.item.id}" title="تنظیم بازه زیرمجموعه‌ها متناسب با این ردیف" class="text-[9px] w-4 h-4 inline-flex items-center justify-center rounded hover:bg-white/10" style="color:${LC_NODE_PLANNED_COLOR};">⇱</button>
            </span>` : '';
            // Bulk-seed a phase's first round of schedule sub-items straight
            // from its own (immutable) اهداف مرحله — one schedule item per
            // objective — instead of typing each one by hand. Only offered
            // before the phase has any children yet, so it's never a
            // surprise duplicate-creation trap once real editing has begun.
            const autoGenButton = (lcState.canEdit && row.isPhase && !row.hasChildren) ? `<button type="button" data-lc-action="auto-generate-objectives" data-phase="${esc(row.phaseCode)}" title="ایجاد خودکار زیرفعالیت‌ها از روی اهداف این مرحله" class="shrink-0 text-[12px] w-6 h-6 inline-flex items-center justify-center rounded-lg border hover:bg-white/10" style="color:#a78bfa; border-color:#a78bfa66;">🧩</button>` : '';
            // «در صورت تاخیرات بیش از اندازه کاربر بتونه برنامه رو ری‌پلن
            // بکنه» — always offered on any phase row that already has a
            // planned window (lcReplanFromDelay itself is a no-op alert
            // when that phase isn't actually overdue yet).
            const replanButton = (lcState.canEdit && row.isPhase && lcState.projectPhases[row.phaseCode]?.planned_start) ? `<button type="button" data-lc-action="replan-from-delay" data-phase="${esc(row.phaseCode)}" title="ری‌پلن: در صورت تاخیر، این فاز و فازهای بعدی را از امروز جلو بکش" class="shrink-0 text-[12px] w-6 h-6 inline-flex items-center justify-center rounded-lg border hover:bg-white/10" style="color:#fb923c; border-color:#fb923c66;">🔄</button>` : '';
            // Clicking the row itself (rather than adding separate icon
            // buttons, which the narrow label column has no room for) opens
            // the schedule editor drawer below the grid — for a phase row
            // that means adding its first sub-phase, for an item row it
            // means editing that item. This is a <div>, not a <button>,
            // specifically so the caret's own <button> can nest inside it
            // without producing invalid (and click-broken) nested buttons.
            const editAttrs = lcState.canEdit ? `data-lc-open-schedule-editor data-kind="${row.isPhase ? 'phase' : 'item'}" data-phase="${esc(row.phaseCode)}" data-item-id="${row.isPhase ? '' : row.item.id}"` : '';
            // Duration in parens on phase rows only (Section 7 of the
            // Execution Strategy spec) — purely a label, reads from the
            // same lifecycle_phase_durations master data the schedule
            // engine itself schedules against, so it never drifts from it.
            const durationDays = row.isPhase ? lcState.phaseDurations[row.phaseCode] : null;
            const durationSuffix = durationDays ? ` (${toPersianDigits(Math.round(durationDays / 30 * 10) / 10)}م)` : '';
            return `<div ${editAttrs} class="flex items-center gap-1.5 w-full px-1 overflow-hidden${lcState.canEdit ? ' cursor-pointer hover:bg-white/5 rounded' : ''}" style="padding-right:${row.depth * 14}px;">
                ${caret}${gateDot}${statusBadge}
                <span class="text-[10.5px] ${titleCls} truncate" title="${esc(row.title)}">${esc(row.title)}${durationSuffix}</span>
                ${weightTag}${coverageBadge}${fitButtons}${autoGenButton}${replanButton}
            </div>`;
        }

        // «برای افزودن زیرمجموعه به یک مرحله از اهداف مرحله استفاده کن و
        // خودت اتوماتیک ایجاد کن» — turns a phase's own, unchanged
        // lifecycle_objectives into its first round of
        // lifecycle_schedule_items (one row per objective), laid out
        // back-to-back inside that phase's OWN planned_start/planned_finish
        // window — which already reflects whichever Execution Strategy is
        // applied — so the generated sub-schedule can never run outside the
        // phase's own dates or contradict the chosen strategy. Purely
        // additive: never reads or writes lifecycle_objectives itself, only
        // copies each objective's title into a new schedule row. Pulled out
        // as its own pure (no-network) function so both the per-phase and
        // the "همه فازها" bulk action below build rows the exact same way.
        function lcBuildAutoGenRows(phase) {
            const objectives = (phase.lifecycle_objectives || []).filter(o => o.is_active !== false).slice().sort((a, b) => a.seq - b.seq);
            const pp = lcState.projectPhases[phase.code];
            if (!objectives.length || !pp?.planned_start || !pp?.planned_finish) return [];
            const totalDays = Math.max(1, lcDaysBetween(pp.planned_start, pp.planned_finish));
            const share = Math.max(1, Math.floor(totalDays / objectives.length));
            const weight = Math.round((100 / objectives.length) * 10) / 10;
            let cursor = pp.planned_start;
            return objectives.map((obj, i) => {
                const isLast = i === objectives.length - 1;
                const start = cursor;
                const finish = isLast ? pp.planned_finish : lcAddDays(cursor, share);
                cursor = finish;
                return {
                    project_name: lcState.projectName, phase_code: phase.code, parent_id: null, seq: i + 1,
                    title: obj.title, planned_start: start, planned_finish: finish, weight_pct: weight,
                };
            });
        }

        async function lcAutoGenerateScheduleFromObjectives(phaseCode) {
            const phase = lcState.phases.find(p => p.code === phaseCode);
            if (!phase) return;
            if (!(phase.lifecycle_objectives || []).some(o => o.is_active !== false)) { alert('این مرحله هیچ هدفی در «اهداف مرحله» ندارد.'); return; }
            const pp = lcState.projectPhases[phaseCode];
            if (!pp?.planned_start || !pp?.planned_finish) {
                alert('ابتدا باید بازه زمانی برنامه‌ای این فاز مشخص شده باشد (از طریق «برنامه زمان‌بندی اصلی» / استراتژی اجرا).');
                return;
            }
            const rows = lcBuildAutoGenRows(phase);
            const existing = lcScheduleChildren(phaseCode, null);
            if (existing.length && !confirm(`این فاز از قبل ${toPersianDigits(existing.length)} زیرفعالیت دارد. ${toPersianDigits(rows.length)} زیرفعالیت جدید بر اساس اهداف مرحله اضافه شود؟`)) return;
            const { data, error } = await _supabase.from('sg_lifecycle_schedule_items').insert(rows).select();
            if (error) { alert('خطا در ایجاد خودکار زیرفعالیت‌ها: ' + error.message); return; }
            lcState.scheduleItems.push(...data);
            lcRenderAll();
        }

        // «همه گیت‌ها رو اصلاح کن» — the same generation as above, run once
        // for every one of the 9 phases in a single pass, so the whole
        // project's schedule tree gets seeded from its own gate objectives
        // without clicking through each phase one at a time. Only ever
        // touches a phase that has objectives, already has a planned
        // window, and doesn't already have schedule items of its own — a
        // phase someone has already started customizing is left alone.
        async function lcAutoGenerateAllPhasesFromObjectives() {
            const eligible = [], skippedHasChildren = [], skippedNoObjOrDates = [];
            lcState.phases.forEach(phase => {
                const hasObjectives = (phase.lifecycle_objectives || []).some(o => o.is_active !== false);
                const pp = lcState.projectPhases[phase.code];
                const hasChildren = lcScheduleChildren(phase.code, null).length > 0;
                if (!hasObjectives || !pp?.planned_start || !pp?.planned_finish) { skippedNoObjOrDates.push(phase.title); return; }
                if (hasChildren) { skippedHasChildren.push(phase.title); return; }
                eligible.push(phase);
            });
            if (!eligible.length) {
                alert('هیچ فازی برای ایجاد خودکار واجد شرایط نیست.'
                    + (skippedHasChildren.length ? ` فازهای دارای زیرفعالیت از قبل: ${skippedHasChildren.join('، ')}.` : '')
                    + (skippedNoObjOrDates.length ? ` فازهای بدون هدف یا بازه زمانی: ${skippedNoObjOrDates.join('، ')}.` : ''));
                return;
            }
            if (!confirm(`زیرفعالیت‌ها برای ${toPersianDigits(eligible.length)} فاز (${eligible.map(p => p.title).join('، ')}) بر اساس اهداف مرحله ایجاد شود؟`
                + (skippedHasChildren.length ? `\n(فازهای دارای زیرفعالیت از قبل رد می‌شوند: ${skippedHasChildren.join('، ')})` : ''))) return;
            const rows = [];
            eligible.forEach(phase => rows.push(...lcBuildAutoGenRows(phase)));
            const { data, error } = await _supabase.from('sg_lifecycle_schedule_items').insert(rows).select();
            if (error) { alert('خطا در ایجاد خودکار زیرفعالیت‌ها: ' + error.message); return; }
            lcState.scheduleItems.push(...data);
            lcRenderAll();
        }

        // «در صورت تاخیرات بیش از اندازه کاربر بتونه برنامه رو ری‌پلن
        // بکنه» — a delayed phase's planned window has already slipped
        // relative to today; re-planning slides that phase AND every phase
        // after it (in lifecycle_phases.sort_order — the same forward-only
        // dependency direction the Execution Strategy engine itself
        // assumes) forward by exactly the amount it's overdue, plus every
        // schedule item already inside one of those phases, so the whole
        // remaining plan stays internally consistent. Phases before the
        // delayed one (already executed/gated) are never touched — this is
        // a re-plan of what's still ahead, not a rewrite of history. Counts
        // as a schedule revision, matching the same "revised" governance
        // status lcApplyMasterSchedule already uses for a post-baseline change.
        async function lcReplanFromDelay(phaseCode) {
            const phase = lcState.phases.find(p => p.code === phaseCode);
            const anchor = lcState.projectPhases[phaseCode];
            if (!phase || !anchor?.planned_start) { alert('ابتدا باید بازه زمانی برنامه‌ای این فاز مشخص شده باشد.'); return; }
            const todayIso = new Date().toISOString().slice(0, 10);
            const delta = lcDaysBetween(anchor.planned_start, todayIso);
            if (delta <= 0) { alert('این فاز هنوز به تاخیر نیفتاده — نیازی به ری‌پلن نیست.'); return; }
            const order = lcState.phases.map(p => p.code);
            const affected = order.slice(order.indexOf(phaseCode));
            if (!confirm(`با این کار، تاریخ‌های برنامه‌ای «${phase.title}» و همه فازهای بعدی (${toPersianDigits(affected.length)} فاز)، به‌اندازه ${toPersianDigits(delta)} روز تاخیر به جلو منتقل می‌شود؛ زیرفعالیت‌های هرکدام هم به همین اندازه جابه‌جا می‌شوند. ادامه می‌دهید؟`)) return;

            const phaseRows = affected
                .map(code => lcState.projectPhases[code])
                .filter(pp => pp && (pp.planned_start || pp.planned_finish))
                .map(pp => ({
                    project_name: lcState.projectName, phase_code: pp.phase_code,
                    planned_start: pp.planned_start ? lcAddDays(pp.planned_start, delta) : null,
                    planned_finish: pp.planned_finish ? lcAddDays(pp.planned_finish, delta) : null,
                }));
            const { data: newPhaseRows, error: phaseErr } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert(phaseRows, { onConflict: 'project_name,phase_code' }).select();
            if (phaseErr) { alert('خطا در ری‌پلن فازها: ' + phaseErr.message); return; }
            newPhaseRows.forEach(row => { lcState.projectPhases[row.phase_code] = row; });

            const affectedSet = new Set(affected);
            const itemsToShift = lcState.scheduleItems.filter(si => affectedSet.has(si.phase_code) && (si.planned_start || si.planned_finish));
            for (const si of itemsToShift) {
                const patch = {
                    planned_start: si.planned_start ? lcAddDays(si.planned_start, delta) : null,
                    planned_finish: si.planned_finish ? lcAddDays(si.planned_finish, delta) : null,
                };
                const { data, error } = await _supabase.from('sg_lifecycle_schedule_items').update(patch).eq('id', si.id).select().single();
                if (!error && data) {
                    const idx = lcState.scheduleItems.findIndex(x => x.id === si.id);
                    if (idx >= 0) lcState.scheduleItems[idx] = data;
                }
            }

            if (lcState.masterSchedule) {
                const { data: msRow, error: msErr } = await _supabase.from('sg_lifecycle_master_schedule')
                    .update({ governance_status: 'revised', updated_at: new Date().toISOString(), updated_by: currentUser.email })
                    .eq('project_name', lcState.projectName).select().single();
                if (!msErr && msRow) lcState.masterSchedule = msRow;
            }
            await _supabase.from('sg_lifecycle_audit_log').insert({
                project_name: lcState.projectName, phase_code: phaseCode, action: 'replan_from_delay', field: 'planned_dates',
                old_value: anchor.planned_start, new_value: lcAddDays(anchor.planned_start, delta), changed_by: currentUser.email,
            });
            lcRenderAll();
        }

        // ---------------- Baselines (Phase 5) ----------------
        // A baseline is a frozen snapshot, never edited after creation — see
        // migration 039's own comment for why. Only the LATEST one is drawn
        // for comparison; older ones stay in the database (and lcState) for
        // a manager to look up later, but showing more than one bar per row
        // at once would just clutter the chart rather than help it.
        function lcLatestBaseline() {
            return lcState.baselines[0] || null;
        }
        function lcBaselineItemFor(baseline, scheduleItemId) {
            return baseline?.lifecycle_schedule_baseline_items?.find(bi => bi.schedule_item_id === scheduleItemId) || null;
        }

        function lcGanttBarHtml(row, index, range) {
            const top = index * LC_GANTT_ROW_H;
            if (!row.start || !row.finish) {
                return `<div class="absolute text-[9px]" style="top:${top}px; left:8px; height:${LC_GANTT_ROW_H}px; line-height:${LC_GANTT_ROW_H}px; color:#475569;">بدون تاریخ برنامه‌ای</div>`;
            }
            const startPct = lcPctForDate(row.start, range), finishPct = lcPctForDate(row.finish, range);
            const left = Math.min(startPct, finishPct), width = Math.max(0.8, Math.abs(finishPct - startPct));
            const barTop = top + (LC_GANTT_ROW_H - 14) / 2;

            let baselineBar = '';
            if (!row.isPhase) {
                const bi = lcBaselineItemFor(lcLatestBaseline(), row.item.id);
                if (bi && bi.planned_start && bi.planned_finish) {
                    const bLeftPct = lcPctForDate(bi.planned_start, range), bRightPct = lcPctForDate(bi.planned_finish, range);
                    const bLeft = Math.min(bLeftPct, bRightPct), bWidth = Math.max(0.8, Math.abs(bRightPct - bLeftPct));
                    baselineBar = `<div class="absolute rounded-sm" style="left:${bLeft}%; width:${bWidth}%; top:${top + 2}px; height:3px; background:#94a3b8; opacity:.65;" title="خط مبنا: ${formatJalali(bi.planned_start)} تا ${formatJalali(bi.planned_finish)}"></div>`;
                }
            }

            let inlineFill = '', actualBar = '';
            if (row.isPhase) {
                const rolledPct = lcPhaseScheduleActualPct(row.phaseCode);
                if (rolledPct != null) {
                    // Rolled up from this phase's own schedule items — same
                    // inline %-fill treatment as an item row with children.
                    const fillPct = Math.max(0, Math.min(100, rolledPct));
                    if (fillPct > 0) inlineFill = `<div class="absolute inset-y-0 left-0 rounded" style="width:${fillPct}%; background:${LC_NEON_GREEN}; opacity:.85;"></div>`;
                } else if (row.actualStart) {
                    const aStartPct = lcPctForDate(row.actualStart, range);
                    const aFinishPct = lcPctForDate(row.actualFinish || new Date().toISOString().slice(0, 10), range);
                    const aLeft = Math.min(aStartPct, aFinishPct), aWidth = Math.max(0.8, Math.abs(aFinishPct - aStartPct));
                    actualBar = `<div class="absolute rounded" style="left:${aLeft}%; width:${aWidth}%; top:${barTop + 15}px; height:5px; background:${LC_NEON_GREEN}; box-shadow:0 0 6px ${LC_NEON_GREEN}aa;"></div>`;
                }
            } else {
                // Works the same for a leaf (its own manual_actual_pct) and
                // a parent (the rollup) — lcItemActualPct already branches
                // on whether the item has children.
                const fillPct = Math.max(0, Math.min(100, lcItemActualPct(row.item)));
                if (fillPct > 0) inlineFill = `<div class="absolute inset-y-0 left-0 rounded" style="width:${fillPct}%; background:${LC_NEON_GREEN}; opacity:.85;"></div>`;
            }

            // Only schedule items (not phase rows) are directly draggable —
            // a phase's own planned/actual dates are governed by its gate
            // workflow (G1's "ابلاغ" timestamp etc.) and edited through the
            // existing phase-weight/date UI in its detail panel, not here.
            const draggable = lcState.canEdit && !row.isPhase;
            const dragAttrs = draggable ? `data-lc-drag-item="${row.item.id}"` : '';
            const handles = draggable ? `
                <div class="absolute inset-y-0 left-0" data-lc-resize="start" style="width:6px; cursor:ew-resize;"></div>
                <div class="absolute inset-y-0 right-0" data-lc-resize="finish" style="width:6px; cursor:ew-resize;"></div>` : '';

            // Critical-path phases (zero float in the Master Schedule's own
            // backward-pass CPM) get a red outline instead of the ordinary
            // planned-bar border — a read-only visual cue, item-level bars
            // are untouched since only the phase-level Execution Strategy
            // engine computes float today.
            const cpEntry = row.isPhase ? lcCriticalSetForCurrentSchedule()?.[row.phaseCode] : null;
            const barBorder = cpEntry?.critical ? '#f87171' : `${LC_PLANNED_COLOR}aa`;
            const criticalTitle = cpEntry?.critical ? ' title="روی مسیر بحرانی (Critical Path)"' : '';

            return `
            ${baselineBar}
            <div class="absolute rounded"${criticalTitle} ${dragAttrs} style="left:${left}%; width:${width}%; top:${barTop}px; height:14px; background:${LC_PLANNED_COLOR}33; border:1px solid ${barBorder}; overflow:visible; ${draggable ? 'cursor:grab;' : ''}"><div class="w-full h-full overflow-hidden rounded">${inlineFill}</div>${handles}</div>
            ${actualBar}`;
        }

        function lcDependencyConnectorsSvg(rows, range) {
            if (!lcState.scheduleDeps.length) return '';
            const rowIndexByItemId = new Map();
            rows.forEach((row, i) => { if (!row.isPhase) rowIndexByItemId.set(row.item.id, i); });
            const itemsById = new Map(lcState.scheduleItems.map(si => [si.id, si]));
            const paths = [];
            lcState.scheduleDeps.forEach(dep => {
                const predRow = rowIndexByItemId.get(dep.predecessor_id), succRow = rowIndexByItemId.get(dep.successor_id);
                const pred = itemsById.get(dep.predecessor_id), succ = itemsById.get(dep.successor_id);
                if (predRow == null || succRow == null || !pred || !succ || !pred.planned_start || !pred.planned_finish || !succ.planned_start || !succ.planned_finish) return;
                const fromIso = (dep.dep_type === 'SS' || dep.dep_type === 'SF') ? pred.planned_start : pred.planned_finish;
                const toIso = (dep.dep_type === 'FS' || dep.dep_type === 'SS') ? succ.planned_start : succ.planned_finish;
                const fromX = lcPctForDate(fromIso, range) / 100 * lcGanttTimelineW();
                const toX = lcPctForDate(toIso, range) / 100 * lcGanttTimelineW();
                const fromY = predRow * LC_GANTT_ROW_H + LC_GANTT_ROW_H / 2;
                const toY = succRow * LC_GANTT_ROW_H + LC_GANTT_ROW_H / 2;
                paths.push(`<path d="M ${fromX},${fromY} C ${fromX + 24},${fromY} ${toX - 24},${toY} ${toX},${toY}" fill="none" stroke="#7dd3fc" stroke-width="1.25" stroke-opacity="0.55" marker-end="url(#lcGanttArrow)"/>`);
            });
            if (!paths.length) return '';
            const bodyH = rows.length * LC_GANTT_ROW_H;
            return `<svg class="absolute inset-0 pointer-events-none" width="${lcGanttTimelineW()}" height="${bodyH}" style="overflow:visible;">
                <defs><marker id="lcGanttArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#7dd3fc" opacity="0.7"/></marker></defs>
                ${paths.join('')}
            </svg>`;
        }

        // The actual label+timeline grid — shared by the whole-project Master
        // Plan tab and each phase detail page's own scoped timeline section,
        // so improvements to one (editing, validation, ...) land in both.
        function lcGanttGridHtml(rows, range) {
            // Stashed so the drag handlers (bound after this HTML lands in
            // the DOM, from lcBindEvents -> lcBindGanttDragEvents) can map
            // a mouse delta back to a date using the exact same range/rows
            // that were actually rendered, without recomputing them.
            lcState._ganttRange = range;
            lcState._ganttRows = rows;
            if (!range) {
                const soloPhase = (rows.length === 1 && rows[0].isPhase) ? rows[0] : null;
                return `<div class="text-center py-6">
                    <p class="text-sm mb-3" style="color:#93c5fd;">هنوز هیچ تاریخ برنامه‌ای برای این بخش ثبت نشده — با ثبت شروع/پایان برنامه‌ای فاز یا افزودن فعالیت، برنامه زمان‌بندی این‌جا نمایش داده می‌شود.</p>
                    ${soloPhase && lcState.canEdit ? `<div data-lc-open-schedule-editor data-kind="phase" data-phase="${esc(soloPhase.phaseCode)}" data-item-id="" class="inline-block cursor-pointer text-[11px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 hover:bg-white/5">+ افزودن اولین زیرفاز/فعالیت</div>` : ''}
                </div>${lcScheduleEditorHtml()}`;
            }
            const ticks = lcJalaliMonthTicks(range);
            const todayIso = new Date().toISOString().slice(0, 10);
            const todayPct = (todayIso >= range.minIso && todayIso <= range.maxIso) ? lcPctForDate(todayIso, range) : null;
            const bodyH = rows.length * LC_GANTT_ROW_H;

            return `
            <div class="flex items-center justify-between gap-2 mb-3">
                <p class="text-[10px]" style="color:#93c5fd;">از ${formatJalali(range.minIso)} تا ${formatJalali(range.maxIso)}</p>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" data-lc-action="gantt-zoom-out" title="کوچک‌نمایی" class="text-[11px] font-bold w-6 h-6 rounded border text-slate-200 hover:bg-white/10" style="border-color:rgba(255,255,255,.2);">−</button>
                    <span class="text-[10px] w-9 text-center" style="color:#94a3b8;">×${toPersianDigits(String(lcState.ganttZoom || 1))}</span>
                    <button type="button" data-lc-action="gantt-zoom-in" title="بزرگ‌نمایی" class="text-[11px] font-bold w-6 h-6 rounded border text-slate-200 hover:bg-white/10" style="border-color:rgba(255,255,255,.2);">+</button>
                    ${(lcState.ganttZoom || 1) !== 1 ? `<button type="button" data-lc-action="gantt-zoom-reset" title="بازنشانی زوم" class="text-[10px] font-bold px-1.5 h-6 rounded border text-slate-300 hover:bg-white/10" style="border-color:rgba(255,255,255,.2);">۱۰۰٪</button>` : ''}
                </div>
            </div>
            ${lcCoverageSummaryHtml(rows)}
            <div class="overflow-x-auto scroll-thin">
                <div style="width:${LC_GANTT_LABEL_W + lcGanttTimelineW()}px;">
                    <div class="flex items-end" style="height:${LC_GANTT_HEADER_H}px;">
                        <div style="width:${LC_GANTT_LABEL_W}px; flex-shrink:0;"></div>
                        <div class="relative" style="width:${lcGanttTimelineW()}px; height:${LC_GANTT_HEADER_H}px; border-bottom:1px solid rgba(255,255,255,.1);">
                            ${ticks.map(t => `<div class="absolute flex flex-col items-start whitespace-nowrap" style="left:${lcPctForDate(t.iso, range)}%; bottom:2px; padding-left:4px; border-left:1px solid rgba(255,255,255,.15); line-height:1.25;">
                                <span class="text-[8.5px]" style="color:#94a3b8; opacity:.6;">${t.yearLabel}</span>
                                <span class="text-[9.5px] font-bold" style="color:#e2e8f0;">${t.monthLabel}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                    <div class="flex">
                        <div style="width:${LC_GANTT_LABEL_W}px; flex-shrink:0;">
                            ${rows.map(row => `<div class="flex items-center border-b" style="height:${LC_GANTT_ROW_H}px; border-color:rgba(255,255,255,.05);">${lcGanttLabelHtml(row)}</div>`).join('')}
                        </div>
                        <div class="relative" id="lcGanttTimeline" style="width:${lcGanttTimelineW()}px; height:${bodyH}px;">
                            ${lcWeekBandsHtml(range)}
                            ${rows.map((row, i) => `<div class="absolute w-full border-b" style="top:${i * LC_GANTT_ROW_H}px; height:${LC_GANTT_ROW_H}px; border-color:rgba(255,255,255,.05);"></div>`).join('')}
                            ${todayPct != null ? `<div class="absolute top-0 bottom-0" style="left:${todayPct}%; width:1px; background:#fbbf24; opacity:.7;"></div>` : ''}
                            ${rows.map((row, i) => lcGanttBarHtml(row, i, range)).join('')}
                            ${lcDependencyConnectorsSvg(rows, range)}
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 text-[10px]" style="border-top:1px solid rgba(255,255,255,.08); color:#94a3b8;">
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-1.5 rounded-sm" style="background:${LC_PLANNED_COLOR}55; border:1px solid ${LC_PLANNED_COLOR};"></span>بازه برنامه‌ای</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-1.5 rounded-sm" style="background:${LC_NEON_GREEN};"></span>پیشرفت واقعی</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5" style="background:#fbbf24;"></span>امروز</span>
                <span class="inline-flex items-center gap-1">${Object.values(LC_ITEM_STATUS_META).map(m => `<span title="${esc(m.label)}">${m.icon}</span>`).join('')}<span style="color:#64748b;">وضعیت (زمانی/فیزیکی)</span></span>
                ${lcState.baselines.length ? `<span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-0.5 rounded-sm" style="background:#94a3b8;"></span>خط مبنا</span>` : ''}
                ${lcState.canEdit ? `<span class="text-[9px] mr-auto" style="color:#64748b;">برای ویرایش روی ردیف کلیک کنید؛ برای جابه‌جایی/تغییر بازه، نوار را بکشید.</span>` : ''}
            </div>
            ${lcScheduleEditorHtml()}`;
        }

        // Shows the drift between the latest baseline's overall end date and
        // the CURRENT plan's overall end date — the whole reason a baseline
        // is worth taking in the first place. Only the project's own
        // schedule-item tree feeds this (not phase-level dates), matching
        // Phases 3/4's own scoping of everything else in this grid.
        function lcBaselineVarianceSummaryHtml() {
            const baseline = lcLatestBaseline();
            if (!baseline || !baseline.lifecycle_schedule_baseline_items?.length) return '';
            const baselineFinishes = baseline.lifecycle_schedule_baseline_items.map(bi => bi.planned_finish).filter(Boolean);
            const currentFinishes = lcState.scheduleItems.map(si => si.planned_finish).filter(Boolean);
            if (!baselineFinishes.length || !currentFinishes.length) return '';
            const baselineEnd = baselineFinishes.reduce((a, b) => b > a ? b : a);
            const currentEnd = currentFinishes.reduce((a, b) => b > a ? b : a);
            const varianceDays = lcDaysBetween(baselineEnd, currentEnd);
            const varianceColor = varianceDays > 5 ? '#f87171' : varianceDays < -2 ? '#34d399' : '#93c5fd';
            return `<p class="text-[10px] mb-2" style="color:#93c5fd;">
                خط مبنا: «${esc(baseline.label)}» (${formatJalali(baseline.created_at)}) —
                <span style="color:${varianceColor}; font-weight:700;">${varianceDays > 0 ? '+' : ''}${toPersianDigits(varianceDays)} روز</span>
                نسبت به پایان برنامه‌ای آن (${formatJalali(baselineEnd)} ← ${formatJalali(currentEnd)})
            </p>`;
        }

        async function lcCreateBaseline() {
            const existing = lcLatestBaseline();
            const label = prompt('نامی برای این خط مبنا وارد کنید:', existing ? 'بازتنظیم خط مبنا' : 'خط مبنای اولیه');
            if (!label) return;
            if (existing) {
                const ok = confirm(`این پروژه از قبل یک خط مبنا دارد («${existing.label}»، ${formatJalali(existing.created_at)}). خط مبنای قبلی حذف نمی‌شود — هر دو در سامانه می‌مانند و مقایسه همیشه با آخرین خط مبنا انجام می‌شود.\n\nخط مبنای جدید «${label}» ثبت شود؟`);
                if (!ok) return;
            }
            if (!lcState.scheduleItems.length) { alert('هیچ فعالیت/زیرفازی برای ثبت در خط مبنا وجود ندارد.'); return; }
            const { data: baseline, error: bErr } = await _supabase.from('sg_lifecycle_schedule_baselines')
                .insert({ project_name: lcState.projectName, label, created_by: currentUser.email })
                .select().single();
            if (bErr) { alert('خطا در ایجاد خط مبنا: ' + bErr.message); return; }
            const rows = lcState.scheduleItems.map(si => ({
                baseline_id: baseline.id, schedule_item_id: si.id, title: si.title,
                planned_start: si.planned_start, planned_finish: si.planned_finish, weight_pct: si.weight_pct,
            }));
            const { data: baselineItems, error: iErr } = await _supabase.from('sg_lifecycle_schedule_baseline_items').insert(rows).select();
            if (iErr) { alert('خطا در ثبت جزئیات خط مبنا: ' + iErr.message); return; }
            baseline.lifecycle_schedule_baseline_items = baselineItems;
            lcState.baselines.unshift(baseline);
            lcRenderAll();
        }

        // ---------------- Master Project Lifecycle & Schedule — Execution Strategy engine ----------------
        // ADDITIVE on top of the unchanged G1..G9 lifecycle: this only ever
        // computes planned_start/planned_finish for the existing 9 phases
        // and writes them onto project_lifecycle_phases, so the Master Plan
        // Gantt below (lcGanttGridHtml, already built) needs no structural
        // change to display it. Gate count, each gate's sub-items/pass
        // criteria and the orbit view itself are completely untouched.
        const LC_STRATEGIES = [
            { key: 'sequential', label: 'ترتیبی (Sequential)', desc: 'محافظه‌کارانه، عمدتاً متوالی' },
            { key: 'overlapping', label: 'همپوشان (Overlapping)', desc: 'همپوشانی کنترل‌شده بین فازها' },
            { key: 'fast_track', label: 'تسریع‌شده (Fast-Track)', desc: 'همپوشانی تهاجمی از طریق SS/FF/FS+Lag' },
            { key: 'emergency_fast_track', label: 'تسریع اضطراری (Emergency)', desc: 'حداکثر همپوشانی کنترل‌شده برای شرایط فوریتی/فورس‌ماژور' },
        ];
        const LC_STRATEGY_LABELS = Object.fromEntries(LC_STRATEGIES.map(s => [s.key, s.label]));
        const LC_GOVERNANCE_FLOW = ['draft', 'proposed', 'reviewed', 'approved', 'baseline', 'in_execution', 'revised', 'completed'];
        const LC_GOVERNANCE_LABELS = {
            draft: 'پیش‌نویس', proposed: 'پیشنهادی', reviewed: 'بازبینی‌شده', approved: 'تاییدشده',
            baseline: 'خط مبنا', in_execution: 'در حال اجرا', revised: 'بازنگری‌شده', completed: 'تکمیل‌شده',
        };

        function lcMasterScheduleStrategy() {
            return (lcState.strategyDraft && lcState.strategyDraft.execution_strategy) || lcState.masterSchedule?.execution_strategy || 'sequential';
        }
        function lcMasterScheduleStartIso() {
            return (lcState.strategyDraft && lcState.strategyDraft.project_start_date) || lcState.masterSchedule?.project_start_date || null;
        }
        function lcMasterScheduleIsDraft() {
            const ms = lcState.masterSchedule;
            if (!ms) return true;
            return ms.execution_strategy !== lcMasterScheduleStrategy() || ms.project_start_date !== lcMasterScheduleStartIso();
        }

        function lcPhaseDependencyFor(strategy, succCode) {
            return (lcState.strategyDeps[strategy] || []).find(d => d.succ_phase_code === succCode) || null;
        }

        // Forward-pass CPM over the 9 phases in lifecycle_phases.sort_order —
        // same FS/SS/FF/SF + Lag/Lead semantics as lcRequiredSuccessorDate
        // below, walked once in fixed phase order rather than a general
        // graph (every strategy's dependencies only ever point from an
        // earlier phase to a later one — a deliberate authoring rule for
        // lifecycle_strategy_phase_dependencies, not merely convenient).
        function lcComputeMasterSchedule(strategy, startIso) {
            const order = lcState.phases.map(p => p.code);
            if (!order.length || !startIso) return null;
            const start = {}, finish = {};
            order.forEach((code, i) => {
                const dur = lcState.phaseDurations[code];
                if (dur == null) { start[code] = null; finish[code] = null; return; }
                if (i === 0) { start[code] = startIso; finish[code] = lcAddDays(startIso, dur); return; }
                const dep = lcPhaseDependencyFor(strategy, code);
                let s;
                if (dep && start[dep.pred_phase_code] != null) {
                    const anchor = (dep.dep_type === 'SS' || dep.dep_type === 'SF') ? start[dep.pred_phase_code] : finish[dep.pred_phase_code];
                    const raw = lcAddDays(anchor, dep.lag_days || 0);
                    s = dep.dep_type === 'SF' ? lcAddDays(raw, -dur) : raw;
                } else {
                    s = finish[order[i - 1]];
                }
                start[code] = s;
                finish[code] = lcAddDays(s, dur);
            });
            const lastCode = order[order.length - 1];
            return {
                order, start, finish,
                startupDate: finish['G7'] ?? null,
                completionDate: finish[lastCode] ?? null,
                totalDays: finish[lastCode] ? lcDaysBetween(startIso, finish[lastCode]) : null,
            };
        }

        // Standard backward-pass CPM: the last phase's late finish pins to
        // its own early finish (no externally-imposed deadline), then walks
        // phases in reverse deriving each one's late start/finish from every
        // phase whose start/finish depends on it — the same dependency
        // semantics as the forward pass above, solved in the other
        // direction. A phase with zero float (its early and late dates
        // coincide) is on the Critical Path.
        function lcComputeMasterCriticalPath(strategy, startIso) {
            const sched = lcComputeMasterSchedule(strategy, startIso);
            if (!sched) return null;
            const { order } = sched;
            const dur = code => lcState.phaseDurations[code];
            const successorsOf = code => order.filter((c, i) => {
                if (i === 0) return false;
                const dep = lcPhaseDependencyFor(strategy, c);
                return dep ? dep.pred_phase_code === code : order[i - 1] === code;
            });
            const lateStart = {}, lateFinish = {};
            const lastCode = order[order.length - 1];
            lateFinish[lastCode] = sched.finish[lastCode];
            lateStart[lastCode] = lcAddDays(lateFinish[lastCode], -dur(lastCode));
            for (let i = order.length - 2; i >= 0; i--) {
                const code = order[i];
                if (sched.start[code] == null) continue;
                const succs = successorsOf(code);
                const candidates = succs.map(succCode => {
                    const dep = lcPhaseDependencyFor(strategy, succCode);
                    const lag = dep && dep.pred_phase_code === code ? (dep.lag_days || 0) : 0;
                    const depType = dep && dep.pred_phase_code === code ? dep.dep_type : 'FS';
                    if (depType === 'SS') return lcAddDays(lateStart[succCode], dur(code) - lag);
                    if (depType === 'FF') return lcAddDays(lateFinish[succCode], -lag);
                    if (depType === 'SF') return lcAddDays(lateFinish[succCode], dur(code) - lag);
                    return lcAddDays(lateStart[succCode], -lag);
                }).filter(Boolean);
                lateFinish[code] = candidates.length ? candidates.reduce((a, b) => (b < a ? b : a)) : sched.finish[code];
                lateStart[code] = lcAddDays(lateFinish[code], -dur(code));
            }
            const result = {};
            order.forEach(code => {
                if (sched.start[code] == null) { result[code] = null; return; }
                const floatDays = lcDaysBetween(sched.start[code], lateStart[code]);
                result[code] = { earlyStart: sched.start[code], earlyFinish: sched.finish[code], lateStart: lateStart[code], lateFinish: lateFinish[code], floatDays, critical: floatDays <= 0 };
            });
            return result;
        }

        function lcCriticalSetForCurrentSchedule() {
            if (!lcState.masterSchedule?.execution_strategy || !lcState.masterSchedule?.project_start_date) return null;
            return lcComputeMasterCriticalPath(lcState.masterSchedule.execution_strategy, lcState.masterSchedule.project_start_date);
        }

        function lcSetStrategyDraft(key) {
            lcState.strategyDraft = { execution_strategy: key, project_start_date: lcMasterScheduleStartIso() || new Date().toISOString().slice(0, 10) };
            lcRenderAll();
        }
        function lcSetStrategyDraftStart(jalaliStr) {
            const iso = jalaliInputToIso(jalaliStr);
            if (!iso) { alert('تاریخ نامعتبر است.'); return; }
            lcState.strategyDraft = { execution_strategy: lcMasterScheduleStrategy(), project_start_date: iso };
            lcRenderAll();
        }

        async function lcApplyMasterSchedule() {
            const strategy = lcMasterScheduleStrategy();
            const startIso = lcMasterScheduleStartIso();
            if (!startIso) { alert('لطفاً تاریخ شروع پروژه را وارد کنید.'); return; }
            const sched = lcComputeMasterSchedule(strategy, startIso);
            if (!sched) { alert('محاسبه برنامه ممکن نشد — مدت زمان همه فازها را بررسی کنید.'); return; }
            const rows = sched.order.map(code => ({
                project_name: lcState.projectName, phase_code: code,
                planned_start: sched.start[code], planned_finish: sched.finish[code],
            }));
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert(rows, { onConflict: 'project_name,phase_code' })
                .select();
            if (error) { alert('خطا در اعمال برنامه: ' + error.message); return; }
            data.forEach(row => { lcState.projectPhases[row.phase_code] = row; });
            const wasBaselined = ['baseline', 'in_execution', 'revised', 'completed'].includes(lcState.masterSchedule?.governance_status);
            const nextStatus = wasBaselined ? 'revised' : (!lcState.masterSchedule || lcState.masterSchedule.governance_status === 'draft' ? 'proposed' : lcState.masterSchedule.governance_status);
            const { data: msRow, error: msErr } = await _supabase.from('sg_lifecycle_master_schedule')
                .upsert({ project_name: lcState.projectName, execution_strategy: strategy, project_start_date: startIso, governance_status: nextStatus, updated_at: new Date().toISOString(), updated_by: currentUser.email }, { onConflict: 'project_name' })
                .select().single();
            if (msErr) { alert('خطا در ثبت وضعیت زمان‌بندی: ' + msErr.message); return; }
            lcState.masterSchedule = msRow;
            lcState.strategyDraft = null;
            await _supabase.from('sg_lifecycle_audit_log').insert({
                project_name: lcState.projectName, action: 'apply_master_schedule', field: 'execution_strategy',
                old_value: null, new_value: strategy, changed_by: currentUser.email,
            });
            lcRenderAll();
        }

        async function lcCreateMasterBaseline() {
            if (!lcState.masterSchedule) { alert('ابتدا برنامه زمان‌بندی را اعمال کنید («اعمال به برنامه فازها»).'); return; }
            const existingVersions = lcState.scheduleVersions;
            const isFirst = !existingVersions.length;
            let versionLabel = 'V1.0', changeReason = null;
            if (!isFirst) {
                changeReason = prompt('دلیل بازنگری زمان‌بندی را وارد کنید (اختیاری):') || null;
                const lastMajor = existingVersions.reduce((max, v) => Math.max(max, Math.floor(Number(v.version_label.replace('V', '')) || 0)), 1);
                versionLabel = 'V' + (lastMajor + 1) + '.0';
            }
            if (!confirm(`ثبت «${versionLabel}» به عنوان خط مبنای جدید؟ این نسخه پس از ثبت غیرقابل ویرایش خواهد بود.`)) return;
            const strategy = lcState.masterSchedule.execution_strategy;
            const startIso = lcState.masterSchedule.project_start_date;
            const sched = lcComputeMasterSchedule(strategy, startIso);
            const { data: version, error } = await _supabase.from('sg_lifecycle_master_schedule_versions').insert({
                project_name: lcState.projectName, version_label: versionLabel, is_baseline: true, execution_strategy: strategy,
                project_start_date: startIso, startup_date: sched?.startupDate || null, completion_date: sched?.completionDate || null,
                total_duration_days: sched?.totalDays || null, change_reason: changeReason, created_by: currentUser.email,
            }).select().single();
            if (error) { alert('خطا در ثبت خط مبنا: ' + error.message); return; }
            lcState.scheduleVersions.unshift(version);
            const { data: msRow, error: msErr } = await _supabase.from('sg_lifecycle_master_schedule')
                .update({ governance_status: 'baseline', active_baseline_version_id: version.id, updated_at: new Date().toISOString(), updated_by: currentUser.email })
                .eq('project_name', lcState.projectName).select().single();
            if (msErr) { alert('خطا در به‌روزرسانی وضعیت: ' + msErr.message); return; }
            lcState.masterSchedule = msRow;
            lcRenderAll();
        }

        // «اگر برنامه زمانبندی مطلوبی کاربران درست کردند ... بشه اونو به
        // عنوان یک نمونه موفق ذخیره کرد و یک نام مناسب هم بهش داد» —
        // snapshots this project's CURRENT schedule (whichever Execution
        // Strategy it ended up on, every phase's real planned window, and
        // its own schedule-item tree) into an organization-wide, named
        // library entry. Everything is captured as RELATIVE day offsets
        // from the project's own start date (never absolute dates), since
        // the whole point is reuse on a future project with a different
        // start date.
        async function lcSaveAsSuccessTemplate() {
            if (!lcState.masterSchedule?.project_start_date) { alert('ابتدا باید یک برنامه زمان‌بندی برای این پروژه اعمال شده باشد.'); return; }
            const name = (prompt('یک نام مناسب برای این نمونه موفق وارد کنید (مثلاً «خط لوله ۴۲ اینچ — نمونه موفق»):') || '').trim();
            if (!name) return;
            const projectStartIso = lcState.masterSchedule.project_start_date;
            const phaseRows = lcState.phases
                .map(phase => {
                    const pp = lcState.projectPhases[phase.code];
                    if (!pp?.planned_start || !pp?.planned_finish) return null;
                    return {
                        phase_code: phase.code,
                        day_offset_start: lcDaysBetween(projectStartIso, pp.planned_start),
                        duration_days: Math.max(1, lcDaysBetween(pp.planned_start, pp.planned_finish)),
                        seq: phase.sort_order,
                    };
                })
                .filter(Boolean);
            if (!phaseRows.length) { alert('هیچ فازی با بازه زمانی برنامه‌ای یافت نشد.'); return; }

            const lastPhase = lcState.phases[lcState.phases.length - 1];
            const lastPp = lastPhase ? lcState.projectPhases[lastPhase.code] : null;
            const totalDurationDays = lastPp?.planned_finish ? lcDaysBetween(projectStartIso, lastPp.planned_finish) : null;

            const { data: template, error: tErr } = await _supabase.from('sg_lifecycle_schedule_success_templates').insert({
                name, source_project_name: lcState.projectName, execution_strategy: lcState.masterSchedule.execution_strategy,
                total_duration_days: totalDurationDays, created_by: currentUser.email,
            }).select().single();
            if (tErr) { alert('خطا در ذخیره نمونه: ' + tErr.message); return; }

            const { error: pErr } = await _supabase.from('sg_lifecycle_schedule_success_template_phases')
                .insert(phaseRows.map(r => Object.assign({ template_id: template.id }, r)));
            if (pErr) { alert('خطا در ذخیره فازهای نمونه: ' + pErr.message); return; }

            const itemRows = lcState.scheduleItems
                .filter(si => si.planned_start && si.planned_finish)
                .map(si => {
                    const pp = lcState.projectPhases[si.phase_code];
                    return {
                        template_id: template.id, phase_code: si.phase_code, source_item_id: si.id, source_parent_id: si.parent_id,
                        title: si.title,
                        day_offset_from_phase_start: pp?.planned_start ? lcDaysBetween(pp.planned_start, si.planned_start) : 0,
                        duration_days: Math.max(1, lcDaysBetween(si.planned_start, si.planned_finish)),
                        weight_pct: si.weight_pct, seq: si.seq,
                    };
                });
            if (itemRows.length) {
                const { error: iErr } = await _supabase.from('sg_lifecycle_schedule_success_template_items').insert(itemRows);
                if (iErr) { alert('خطا در ذخیره فعالیت‌های نمونه: ' + iErr.message); return; }
            }
            lcState.successTemplates.unshift(template);
            alert(`نمونه موفق «${name}» با موفقیت ذخیره شد.`);
            lcRenderAll();
        }

        function lcSuccessTemplatesListHtml() {
            if (!lcState.successTemplates.length) return '';
            return `<div class="mb-3">
                <p class="text-white font-extrabold text-[10.5px] mb-2">📚 نمونه‌های موفق ذخیره‌شده</p>
                <div class="flex flex-wrap gap-2">
                    ${lcState.successTemplates.map(t => {
                        const months = t.total_duration_days != null ? Math.round(t.total_duration_days / 30 * 10) / 10 : null;
                        const tooltip = `پروژه مبدا: ${t.source_project_name} — استراتژی: ${LC_STRATEGY_LABELS[t.execution_strategy] || t.execution_strategy || '—'}${months != null ? ' — ' + months + ' ماه' : ''}`;
                        return `<span class="text-[10px] px-2.5 py-1 rounded-lg" style="background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#93c5fd;" title="${esc(tooltip)}">${esc(t.name)}</span>`;
                    }).join('')}
                </div>
            </div>`;
        }

        function lcMasterScheduleKpiHtml() {
            const strategy = lcMasterScheduleStrategy();
            const startIso = lcMasterScheduleStartIso();
            const sched = startIso ? lcComputeMasterSchedule(strategy, startIso) : null;
            const isDraft = lcMasterScheduleIsDraft();
            const g9 = lcState.phases[lcState.phases.length - 1];
            const appliedStartup = lcState.projectPhases['G7']?.planned_finish || null;
            const appliedCompletion = g9 ? (lcState.projectPhases[g9.code]?.planned_finish || null) : null;
            const startupIso = isDraft ? (sched?.startupDate || null) : (appliedStartup || sched?.startupDate || null);
            const completionIso = isDraft ? (sched?.completionDate || null) : (appliedCompletion || sched?.completionDate || null);
            const totalMonths = startIso && completionIso ? Math.round(lcDaysBetween(startIso, completionIso) / 30 * 10) / 10 : null;
            const cells = [
                ['🚀 راه‌اندازی برنامه‌ای (Start-up)', startupIso ? formatJalali(startupIso) : '—'],
                ['🏁 تکمیل قراردادی (FAC)', completionIso ? formatJalali(completionIso) : '—'],
                ['مدت کل پروژه', totalMonths != null ? toPersianDigits(totalMonths) + ' ماه' : '—'],
                ['وضعیت زمان‌بندی', LC_GOVERNANCE_LABELS[lcState.masterSchedule?.governance_status || 'draft']],
            ];
            return `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                ${cells.map(([label, value]) => `<div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);">
                    <p class="text-[9.5px] mb-1" style="color:#93c5fd;">${esc(label)}</p>
                    <p class="text-white font-extrabold text-sm">${value}</p>
                </div>`).join('')}
                ${isDraft && lcState.canEdit ? `<p class="col-span-2 md:col-span-4 text-[10px]" style="color:#fbbf24;">⚠ این اعداد بر اساس استراتژی/تاریخ شروعِ درحال‌بررسی محاسبه شده و هنوز به برنامه فازها اعمال نشده — برای ثبت، «اعمال به برنامه فازها» را بزنید.</p>` : ''}
            </div>`;
        }

        function lcStrategyComparisonTableHtml(startIso) {
            if (!startIso) return '';
            const current = lcMasterScheduleStrategy();
            const rows = LC_STRATEGIES.map(s => {
                const sched = lcComputeMasterSchedule(s.key, startIso);
                const startupM = sched?.startupDate ? Math.round(lcDaysBetween(startIso, sched.startupDate) / 30 * 10) / 10 : null;
                const finalM = sched?.completionDate ? Math.round(lcDaysBetween(startIso, sched.completionDate) / 30 * 10) / 10 : null;
                return `<tr style="color:${current === s.key ? '#ffffff' : '#93c5fd'}; font-weight:${current === s.key ? '800' : '400'};">
                    <td class="py-1 pl-2">${esc(s.label)}</td>
                    <td class="py-1 text-center">${startupM != null ? toPersianDigits(startupM) + ' ماه' : '—'}</td>
                    <td class="py-1 text-center">${finalM != null ? toPersianDigits(finalM) + ' ماه' : '—'}</td>
                </tr>`;
            }).join('');
            return `<table class="w-full text-[10.5px] mt-1 mb-2">
                <thead><tr style="color:#64748b;"><th class="text-right pb-1 font-normal">استراتژی اجرا</th><th class="pb-1 font-normal">Start-up</th><th class="pb-1 font-normal">تکمیل نهایی</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        function lcMasterScheduleStrategyRowHtml() {
            const current = lcMasterScheduleStrategy();
            const startIso = lcMasterScheduleStartIso() || new Date().toISOString().slice(0, 10);
            return `<div class="mb-3">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    ${LC_STRATEGIES.map(s => `<button type="button" data-lc-set-strategy="${s.key}" title="${esc(s.desc)}" class="text-[10.5px] font-bold px-3 py-1.5 rounded-lg border transition ${current === s.key ? 'bg-blue-900 text-white border-blue-900' : 'text-slate-200 hover:bg-white/5'}">${esc(s.label)}</button>`).join('')}
                    <span class="mr-auto flex items-center gap-1.5 text-[10.5px]" style="color:#93c5fd;">
                        تاریخ شروع پروژه:
                        <input type="text" data-lc-strategy-start value="${startIso ? formatJalali(startIso) : ''}" placeholder="۱۴۰۴/۰۱/۰۱" class="text-[10.5px] border rounded-lg px-2 py-1" style="width:100px;">
                    </span>
                    <button type="button" data-lc-action="apply-master-schedule" class="text-[10.5px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white">اعمال به برنامه فازها ↻</button>
                </div>
                ${lcStrategyComparisonTableHtml(startIso)}
                ${current !== 'sequential' ? `<p class="text-[10px] px-3 py-2 rounded-lg" style="background:rgba(251,191,36,.1); color:#fbbf24; border:1px solid rgba(251,191,36,.3);">⚠️ افزایش ریسک تسریع (Fast-Track Exposure) — همپوشانی فعالیت‌ها می‌تواند ریسک هماهنگی، تغییرات و دوباره‌کاری را افزایش دهد.</p>` : ''}
            </div>`;
        }

        function lcExecutiveSummaryCardHtml() {
            const applied = lcState.masterSchedule;
            const strategy = lcMasterScheduleStrategy();
            const startIso = lcMasterScheduleStartIso();
            if (!startIso) return '';
            const sched = lcComputeMasterSchedule(strategy, startIso);
            const g9 = lcState.phases[lcState.phases.length - 1];
            const appliedCompletion = g9 ? (lcState.projectPhases[g9.code]?.planned_finish || null) : null;
            const forecastIso = appliedCompletion || sched?.completionDate || null;
            const baseline = applied?.active_baseline_version_id ? lcState.scheduleVersions.find(v => v.id === applied.active_baseline_version_id) : null;
            const varianceDays = baseline?.completion_date && forecastIso ? lcDaysBetween(baseline.completion_date, forecastIso) : null;
            const cp = lcComputeMasterCriticalPath(strategy, startIso);
            const criticalTitles = cp ? Object.entries(cp).filter(([, v]) => v?.critical).map(([code]) => lcState.phases.find(p => p.code === code)?.title || code) : [];
            const rows = [
                ['شروع پروژه', startIso ? formatJalali(startIso) : '—'],
                ['استراتژی اجرا', LC_STRATEGY_LABELS[strategy]],
                ['مدت کل', sched?.totalDays != null ? toPersianDigits(Math.round(sched.totalDays / 30 * 10) / 10) + ' ماه' : '—'],
                ['راه‌اندازی برنامه‌ای', sched?.startupDate ? formatJalali(sched.startupDate) : '—'],
                ['تکمیل قراردادی', sched?.completionDate ? formatJalali(sched.completionDate) : '—'],
                ['پیش‌بینی جاری', forecastIso ? formatJalali(forecastIso) : '—'],
                ['انحراف زمان‌بندی', varianceDays != null ? `${varianceDays > 0 ? '+' : ''}${toPersianDigits(varianceDays)} روز نسبت به خط مبنا` : '—'],
                ['وضعیت خط مبنا', baseline ? `تاییدشده (${esc(baseline.version_label)})` : 'تاییدنشده'],
            ];
            return `<div class="rounded-xl p-4 mb-3" style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);">
                <p class="text-white font-extrabold text-[11px] mb-2">خلاصه اجرایی چرخه عمر پروژه</p>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                    ${rows.map(([label, value]) => `<div><p class="text-[9px]" style="color:#64748b;">${esc(label)}</p><p class="text-[10.5px] font-bold text-slate-200">${value}</p></div>`).join('')}
                </div>
                ${criticalTitles.length ? `<p class="text-[9.5px] mt-2 pt-2" style="border-top:1px solid rgba(255,255,255,.08); color:#f87171;">مسیر بحرانی (Critical Path): ${criticalTitles.map(esc).join(' ← ')}</p>` : ''}
            </div>`;
        }

        function lcGovernanceStepperHtml() {
            const current = lcState.masterSchedule?.governance_status || 'draft';
            const idx = LC_GOVERNANCE_FLOW.indexOf(current);
            return `<div class="flex flex-wrap items-center gap-1 mb-3 text-[9.5px]">
                ${LC_GOVERNANCE_FLOW.map((st, i) => `<span class="px-2 py-1 rounded-full ${i <= idx ? 'bg-blue-900 text-white' : 'border text-slate-500'}">${esc(LC_GOVERNANCE_LABELS[st])}</span>${i < LC_GOVERNANCE_FLOW.length - 1 ? '<span style="color:#475569;">←</span>' : ''}`).join('')}
            </div>`;
        }

        function lcMasterScheduleHistoryHtml() {
            if (!lcState.scheduleVersions.length) return '';
            return `<div class="mb-3">
                <p class="text-white font-extrabold text-[10.5px] mb-2">تاریخچه نسخه‌های زمان‌بندی</p>
                <table class="w-full text-[10px]">
                    <thead><tr style="color:#64748b;"><th class="text-right pb-1 font-normal">نسخه</th><th class="pb-1 font-normal">استراتژی</th><th class="pb-1 font-normal">Start-up</th><th class="pb-1 font-normal">تکمیل</th><th class="pb-1 font-normal">تاریخ ثبت</th></tr></thead>
                    <tbody>
                        ${lcState.scheduleVersions.map(v => `<tr style="color:${v.is_baseline ? '#ffffff' : '#93c5fd'};">
                            <td class="py-1">${esc(v.version_label)}${v.is_baseline ? ' 📌' : ''}</td>
                            <td class="py-1">${esc(LC_STRATEGY_LABELS[v.execution_strategy] || v.execution_strategy)}</td>
                            <td class="py-1">${v.startup_date ? formatJalali(v.startup_date) : '—'}</td>
                            <td class="py-1">${v.completion_date ? formatJalali(v.completion_date) : '—'}</td>
                            <td class="py-1">${formatJalali(v.created_at)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        function lcMasterPlanHtml() {
            const rows = lcBuildScheduleRows();
            const range = lcScheduleDateRange();
            return `
            <div class="lc-dark-panel rounded-2xl p-4 md:p-6" style="background: radial-gradient(ellipse 90% 70% at 50% 10%, #123159 0%, #04070f 78%); border: 1px solid rgba(255,255,255,.07); min-height: 60vh;">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 class="text-white font-extrabold text-sm">چرخه عمر پروژه | برنامه زمان‌بندی اصلی (Master Schedule)</h3>
                    <div class="flex flex-wrap items-center gap-2">
                        ${lcState.canEdit ? `<button type="button" data-lc-action="save-success-template" class="no-print text-[10.5px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 hover:bg-white/5">💾 ذخیره به عنوان نمونه موفق</button>` : ''}
                        ${lcState.canEdit ? `<button type="button" data-lc-action="create-master-baseline" class="no-print text-[10.5px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 hover:bg-white/5">📌 تایید و تبدیل به Baseline</button>` : ''}
                    </div>
                </div>
                ${lcGovernanceStepperHtml()}
                ${lcMasterScheduleKpiHtml()}
                ${lcState.canEdit ? lcMasterScheduleStrategyRowHtml() : lcStrategyComparisonTableHtml(lcMasterScheduleStartIso())}
                ${lcExecutiveSummaryCardHtml()}
                ${lcMasterScheduleHistoryHtml()}
                ${lcSuccessTemplatesListHtml()}
                <div class="mt-4 pt-4" style="border-top:1px solid rgba(255,255,255,.08);">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <h4 class="text-white font-extrabold text-xs">برنامه زمان‌بندی تفصیلی (Gantt)</h4>
                        <div class="flex flex-wrap items-center gap-2">
                            ${lcState.canEdit ? `<button type="button" data-lc-action="auto-generate-all-objectives" class="no-print text-[10.5px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 hover:bg-white/5">🧩 ایجاد خودکار زیرفعالیت‌های همه فازها از اهداف مرحله</button>` : ''}
                            ${lcState.canEdit ? `<button type="button" data-lc-action="create-baseline" class="no-print text-[10.5px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 hover:bg-white/5">📌 ثبت خط مبنا فعالیت‌ها (Baseline)</button>` : ''}
                        </div>
                    </div>
                    ${lcBaselineVarianceSummaryHtml()}
                    ${lcGanttGridHtml(rows, range)}
                </div>
            </div>`;
        }

        function lcToggleScheduleRow(rowId) {
            if (lcState.collapsedScheduleRows.has(rowId)) lcState.collapsedScheduleRows.delete(rowId);
            else lcState.collapsedScheduleRows.add(rowId);
            lcRenderAll();
        }

        // ---------------- Master Plan editing (add/edit/delete + dependencies) ----------------
        // A single drawer below the grid handles every add/edit — simpler
        // than inline per-row forms given how narrow the label column is,
        // and it doubles as the dependency editor for whichever item is
        // currently open.
        function lcOpenScheduleEditor(kind, phaseCode, itemId) {
            lcState.scheduleEditor = kind === 'phase'
                ? { mode: 'new', phaseCode, parentId: null }
                : { mode: 'edit', id: Number(itemId) };
            lcRenderAll();
        }

        function lcAddScheduleChild(parentId, phaseCode) {
            lcState.scheduleEditor = { mode: 'new', phaseCode, parentId: Number(parentId) };
            lcRenderAll();
        }

        function lcScheduleEditorHtml() {
            const ed = lcState.scheduleEditor;
            if (!ed || !lcState.canEdit) return '';
            const isEdit = ed.mode === 'edit';
            const item = isEdit ? lcState.scheduleItems.find(si => si.id === ed.id) : null;
            if (isEdit && !item) return '';
            const phaseCode = isEdit ? item.phase_code : ed.phaseCode;
            const parentId = isEdit ? item.parent_id : ed.parentId;
            const parentTitle = parentId
                ? (lcState.scheduleItems.find(si => si.id === parentId)?.title || '')
                : (lcState.phases.find(p => p.code === phaseCode)?.title || '');
            const hasChildren = isEdit && lcState.scheduleItems.some(si => si.parent_id === item.id);
            const existingDeps = isEdit ? lcState.scheduleDeps.filter(d => d.predecessor_id === item.id || d.successor_id === item.id) : [];
            const depCandidates = isEdit ? lcState.scheduleItems.filter(si => si.phase_code === phaseCode && si.id !== item.id) : [];
            const depTypeLabels = { FS: 'FS (پایان ← شروع)', SS: 'SS (شروع ← شروع)', FF: 'FF (پایان ← پایان)', SF: 'SF (شروع ← پایان)' };

            return `
            <div class="mt-4 pt-4 rounded-xl p-4" style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1);">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-white font-extrabold text-xs">${isEdit ? 'ویرایش' : 'افزودن زیرمجموعه به'} «${esc(parentTitle)}»</h4>
                    <button type="button" data-lc-action="close-schedule-editor" class="text-slate-400 hover:text-white text-lg leading-none">×</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-5 gap-2 mb-1">
                    <input type="text" data-lc-sf="title" value="${isEdit ? esc(item.title) : ''}" placeholder="عنوان" class="text-[11px] border rounded-lg px-2 py-1.5 md:col-span-2">
                    <input type="text" data-lc-sf="start" value="${isEdit ? formatJalali(item.planned_start) : ''}" placeholder="شروع (۱۴۰۴/۰۱/۰۱)" class="text-[11px] border rounded-lg px-2 py-1.5">
                    <input type="text" data-lc-sf="finish" value="${isEdit ? formatJalali(item.planned_finish) : ''}" placeholder="پایان (۱۴۰۴/۰۱/۰۱)" class="text-[11px] border rounded-lg px-2 py-1.5">
                    <input type="number" min="0" step="1" data-lc-sf="duration" value="${isEdit && item.planned_start && item.planned_finish ? lcDaysBetween(item.planned_start, item.planned_finish) : ''}" placeholder="تعداد روز" class="text-[11px] border rounded-lg px-2 py-1.5">
                </div>
                <p class="text-[9.5px] mb-2" style="color:#64748b;">هر ۲ مورد از «شروع/پایان/تعداد روز» را وارد کنید، مورد سوم خودکار محاسبه می‌شود.</p>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                    <input type="number" min="0" max="100" step="0.1" data-lc-sf="weight" value="${isEdit && item.weight_pct != null ? item.weight_pct : ''}" placeholder="وزن در بین هم‌سطح‌ها (٪)" class="text-[11px] border rounded-lg px-2 py-1.5">
                    ${isEdit && !hasChildren ? `<input type="number" min="0" max="100" step="1" data-lc-sf="actual" value="${item.manual_actual_pct != null ? item.manual_actual_pct : ''}" placeholder="٪ پیشرفت واقعی" class="text-[11px] border rounded-lg px-2 py-1.5 md:col-span-2">` : ''}
                </div>
                <div class="flex flex-wrap items-center gap-2 mb-1">
                    <button type="button" data-lc-action="save-schedule-item" class="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-900 text-white">ذخیره</button>
                    ${isEdit ? `
                    <button type="button" data-lc-action="add-schedule-child" data-parent-id="${item.id}" data-phase="${esc(phaseCode)}" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border text-slate-200">+ افزودن زیرفعالیت</button>
                    <button type="button" data-lc-action="delete-schedule-item" data-id="${item.id}" class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-red-400 text-red-400 mr-auto">حذف</button>` : ''}
                </div>
                ${isEdit ? `
                <div class="pt-3 mt-2" style="border-top:1px solid rgba(255,255,255,.08);">
                    <p class="text-[11px] font-bold text-white mb-2">وابستگی‌ها</p>
                    ${existingDeps.length ? existingDeps.map(d => {
                        const isPred = d.predecessor_id === item.id;
                        const other = lcState.scheduleItems.find(si => si.id === (isPred ? d.successor_id : d.predecessor_id));
                        if (ed.editingDepId === d.id) {
                            return `<div class="text-[10.5px] py-1.5 px-2 rounded-lg mb-1" style="background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12);">
                                <p class="mb-1.5" style="color:#cbd5e1;">${isPred ? 'قبل از' : 'بعد از'} «${esc(other?.title || '—')}»</p>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <select data-lc-edit-dep-type="${d.id}" class="text-[10px] border rounded-lg px-1.5 py-1">
                                        ${Object.entries(depTypeLabels).map(([k, l]) => `<option value="${k}" ${d.dep_type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                                    </select>
                                    <input type="number" data-lc-edit-dep-lag="${d.id}" value="${d.lag_days || 0}" placeholder="تاخیر(+)/همپوشانی(-)" class="text-[10px] border rounded-lg px-1.5 py-1 w-28">
                                    <button type="button" data-lc-action="save-dependency-edit" data-id="${d.id}" class="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-900 text-white">ذخیره</button>
                                    <button type="button" data-lc-action="cancel-dependency-edit" class="text-[10px] text-slate-400 hover:underline">انصراف</button>
                                </div>
                            </div>`;
                        }
                        const lagLabel = d.lag_days ? ` — ${d.lag_days > 0 ? 'تاخیر' : 'همپوشانی'} ${toPersianDigits(Math.abs(d.lag_days))} روز` : '';
                        return `<div class="flex items-center justify-between text-[10.5px] py-1" style="color:#cbd5e1;">
                            <span>${isPred ? 'قبل از' : 'بعد از'} «${esc(other?.title || '—')}» — ${esc(depTypeLabels[d.dep_type] || d.dep_type)}${lagLabel}</span>
                            <span class="flex items-center gap-2 shrink-0">
                                <button type="button" data-lc-action="edit-dependency" data-id="${d.id}" class="text-blue-400 hover:underline">ویرایش</button>
                                <button type="button" data-lc-action="delete-dependency" data-id="${d.id}" class="text-red-400 hover:underline">حذف</button>
                            </span>
                        </div>`;
                    }).join('') : `<p class="text-[10px] text-slate-500 mb-2">وابستگی‌ای ثبت نشده.</p>`}
                    <p class="text-[10px] mt-2 mb-1" style="color:#93c5fd;">این فعالیت به فعالیت زیر وابسته است:</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <select data-lc-sf="dep-other" class="text-[10.5px] border rounded-lg px-2 py-1.5 md:col-span-2">
                            <option value="">-- گزینش فعالیت --</option>
                            ${depCandidates.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}
                        </select>
                        <select data-lc-sf="dep-type" class="text-[10.5px] border rounded-lg px-2 py-1.5">
                            ${Object.entries(depTypeLabels).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('')}
                        </select>
                        <input type="number" data-lc-sf="dep-lag" placeholder="تاخیر(+)/همپوشانی(-) روز" class="text-[10.5px] border rounded-lg px-2 py-1.5">
                    </div>
                    <button type="button" data-lc-action="add-dependency" data-id="${item.id}" class="text-[10.5px] font-bold px-3 py-1.5 rounded-lg border text-slate-200 mt-2">+ افزودن وابستگی</button>
                </div>` : ''}
            </div>`;
        }

        // «هر ۲ مورد از شروع/پایان/تعداد روز را وارد کنید، مورد سوم خودکار
        // محاسبه می‌شود» — remembers which 2 of the 3 date fields were most
        // recently touched (in this editor session) and fills the
        // remaining one from them; edits the DOM inputs directly rather
        // than re-rendering, so it doesn't fight the user's typing/focus.
        function lcHandleScheduleDateTriad(root, changedField) {
            const startEl = root.querySelector('[data-lc-sf="start"]');
            const finishEl = root.querySelector('[data-lc-sf="finish"]');
            const durationEl = root.querySelector('[data-lc-sf="duration"]');
            const ed = lcState.scheduleEditor;
            if (!startEl || !finishEl || !durationEl || !ed) return;
            ed._dateTouch = (ed._dateTouch || []).filter(f => f !== changedField);
            ed._dateTouch.push(changedField);
            if (ed._dateTouch.length > 2) ed._dateTouch.shift();
            if (ed._dateTouch.length < 2) return;
            const startIso = jalaliInputToIso(startEl.value.trim());
            const finishIso = jalaliInputToIso(finishEl.value.trim());
            const durationRaw = durationEl.value.trim();
            const durationDays = durationRaw === '' ? null : Number(durationRaw);
            const has = { start: !!startIso, finish: !!finishIso, duration: durationDays != null && !isNaN(durationDays) && durationDays >= 0 };
            const [a, b] = ed._dateTouch;
            if (!has[a] || !has[b]) return;
            const target = ['start', 'finish', 'duration'].find(f => f !== a && f !== b);
            if (target === 'duration') durationEl.value = Math.max(0, lcDaysBetween(startIso, finishIso));
            else if (target === 'finish') finishEl.value = formatJalali(lcAddDays(startIso, durationDays));
            else if (target === 'start') startEl.value = formatJalali(lcAddDays(finishIso, -durationDays));
        }

        async function lcSaveScheduleItem() {
            const ed = lcState.scheduleEditor;
            if (!ed) return;
            const root = document.getElementById('lcBody');
            const title = root.querySelector('[data-lc-sf="title"]')?.value.trim();
            const startJalali = root.querySelector('[data-lc-sf="start"]')?.value.trim();
            const finishJalali = root.querySelector('[data-lc-sf="finish"]')?.value.trim();
            const weightRaw = root.querySelector('[data-lc-sf="weight"]')?.value;
            const actualInput = root.querySelector('[data-lc-sf="actual"]');
            if (!title) { alert('عنوان الزامی است.'); return; }
            const planned_start = startJalali ? jalaliInputToIso(startJalali) : null;
            const planned_finish = finishJalali ? jalaliInputToIso(finishJalali) : null;
            if (startJalali && !planned_start) { alert('تاریخ شروع نامعتبر است.'); return; }
            if (finishJalali && !planned_finish) { alert('تاریخ پایان نامعتبر است.'); return; }
            if (planned_start && planned_finish && planned_finish < planned_start) { alert('تاریخ پایان نمی‌تواند قبل از شروع باشد.'); return; }
            const patch = {
                project_name: lcState.projectName, title, planned_start, planned_finish,
                weight_pct: weightRaw ? Number(weightRaw) : null,
                updated_at: new Date().toISOString(), updated_by: currentUser.email,
            };
            if (actualInput) patch.manual_actual_pct = actualInput.value === '' ? null : Number(actualInput.value);
            if (ed.mode === 'new') {
                const { data, error } = await _supabase.from('sg_lifecycle_schedule_items')
                    .insert(Object.assign({ phase_code: ed.phaseCode, parent_id: ed.parentId }, patch))
                    .select().single();
                if (error) { alert('خطا در ثبت: ' + error.message); return; }
                lcState.scheduleItems.push(data);
            } else {
                const { data, error } = await _supabase.from('sg_lifecycle_schedule_items').update(patch).eq('id', ed.id).select().single();
                if (error) { alert('خطا در ذخیره: ' + error.message); return; }
                const idx = lcState.scheduleItems.findIndex(si => si.id === ed.id);
                if (idx >= 0) lcState.scheduleItems[idx] = data;
            }
            lcState.scheduleEditor = null;
            lcRenderAll();
        }

        async function lcDeleteScheduleItem(id) {
            const idNum = Number(id);
            if (!confirm('این مورد و همه زیرمجموعه‌های آن حذف شود؟')) return;
            const { error } = await _supabase.from('sg_lifecycle_schedule_items').delete().eq('id', idNum);
            if (error) { alert('خطا در حذف: ' + error.message); return; }
            // The DB already cascades the delete via its FK, but lcState
            // needs to drop the whole removed subtree too, not just this row.
            const toRemove = new Set([idNum]);
            let grew = true;
            while (grew) {
                grew = false;
                lcState.scheduleItems.forEach(si => {
                    if (si.parent_id != null && toRemove.has(si.parent_id) && !toRemove.has(si.id)) { toRemove.add(si.id); grew = true; }
                });
            }
            lcState.scheduleItems = lcState.scheduleItems.filter(si => !toRemove.has(si.id));
            lcState.scheduleDeps = lcState.scheduleDeps.filter(d => !toRemove.has(d.predecessor_id) && !toRemove.has(d.successor_id));
            lcState.scheduleEditor = null;
            lcRenderAll();
        }

        // «علیرغم تعریف وابستگی‌ها ... تاخیر رو هم صفر ثبت کرده‌ام» — two
        // items can be positioned before a dependency between them exists
        // (or before its Lag/Lead is edited), so whatever gap/overlap they
        // already had would otherwise survive even though the just-typed
        // lag says otherwise. Unlike a drag (where the moved position is
        // authoritative and lag is DERIVED from it — see
        // lcActualLagForDep), here the typed lag is authoritative, so snap
        // the successor onto it now, in either direction, then cascade
        // like any other commit. Shared by both creating and editing a
        // dependency. Returns true if a commit (and re-render) happened.
        async function lcSnapDependencyIfNeeded(dep) {
            const predItem = lcState.scheduleItems.find(si => si.id === dep.predecessor_id);
            const succItem = lcState.scheduleItems.find(si => si.id === dep.successor_id);
            if (!predItem || !succItem || !succItem.planned_start || !succItem.planned_finish) return false;
            const required = lcRequiredSuccessorDate(dep, predItem);
            const constrainsStart = (dep.dep_type === 'FS' || dep.dep_type === 'SS');
            const current = constrainsStart ? succItem.planned_start : succItem.planned_finish;
            if (!required || !current || required === current) return false;
            const shiftDays = Math.round((new Date(required) - new Date(current)) / 86400000);
            await lcCommitScheduleItemDates(succItem.id, lcAddDays(succItem.planned_start, shiftDays), lcAddDays(succItem.planned_finish, shiftDays));
            return true;
        }

        async function lcAddDependency(successorId) {
            const root = document.getElementById('lcBody');
            const predecessorId = Number(root.querySelector('[data-lc-sf="dep-other"]')?.value);
            const dep_type = root.querySelector('[data-lc-sf="dep-type"]')?.value || 'FS';
            const lagRaw = root.querySelector('[data-lc-sf="dep-lag"]')?.value;
            if (!predecessorId) { alert('یک فعالیت را برای وابستگی انتخاب کنید.'); return; }
            const { data, error } = await _supabase.from('sg_lifecycle_schedule_dependencies')
                .insert({ project_name: lcState.projectName, predecessor_id: predecessorId, successor_id: successorId, dep_type, lag_days: lagRaw ? Number(lagRaw) : 0 })
                .select().single();
            if (error) { alert('خطا در ثبت وابستگی: ' + error.message); return; }
            lcState.scheduleDeps.push(data);
            if (await lcSnapDependencyIfNeeded(data)) return;
            lcRenderAll();
        }

        async function lcUpdateDependency(id) {
            const idNum = Number(id);
            const root = document.getElementById('lcBody');
            const dep_type = root.querySelector(`[data-lc-edit-dep-type="${idNum}"]`)?.value || 'FS';
            const lagRaw = root.querySelector(`[data-lc-edit-dep-lag="${idNum}"]`)?.value;
            const { data, error } = await _supabase.from('sg_lifecycle_schedule_dependencies')
                .update({ dep_type, lag_days: lagRaw ? Number(lagRaw) : 0 }).eq('id', idNum).select().single();
            if (error) { alert('خطا در ویرایش وابستگی: ' + error.message); return; }
            const idx = lcState.scheduleDeps.findIndex(d => d.id === idNum);
            if (idx >= 0) lcState.scheduleDeps[idx] = data;
            if (lcState.scheduleEditor) lcState.scheduleEditor.editingDepId = null;
            if (await lcSnapDependencyIfNeeded(data)) return;
            lcRenderAll();
        }

        async function lcDeleteDependency(id) {
            const idNum = Number(id);
            const { error } = await _supabase.from('sg_lifecycle_schedule_dependencies').delete().eq('id', idNum);
            if (error) { alert('خطا در حذف وابستگی: ' + error.message); return; }
            lcState.scheduleDeps = lcState.scheduleDeps.filter(d => d.id !== idNum);
            lcRenderAll();
        }

        // ---------------- Drag-to-move / drag-to-resize with real-time recalculation ----------------
        function lcAddDays(iso, days) {
            if (!iso) return iso;
            const d = new Date(iso);
            d.setDate(d.getDate() + days);
            return d.toISOString().slice(0, 10);
        }

        // What date does this dependency's Lag/Lead require the successor's
        // constrained endpoint to sit on, given the predecessor's CURRENT
        // (possibly just-moved) dates?
        function lcRequiredSuccessorDate(dep, predItem) {
            const predDate = (dep.dep_type === 'SS' || dep.dep_type === 'SF') ? predItem.planned_start : predItem.planned_finish;
            return predDate ? lcAddDays(predDate, Math.round(dep.lag_days || 0)) : null;
        }

        // «در صورت جابجایی بهتر است مقدار تاخیر یا همپوشانی آن هم در جدول
        // ثبت شود» — a drag only ever CASCADES a move onto a successor
        // when its dependency would otherwise be violated (see
        // lcApplyDependencyConstraint above); it never corrects the
        // dragged item's own INCOMING dependency, and never touches
        // lag_days at all — so after any drag, whichever end moved, the
        // stored lag can silently stop matching the two items' real
        // positions. This re-derives the actual gap/overlap (negative =
        // overlap) between a dependency's two ends exactly as they ended
        // up, using the same predDate/succDate anchors as
        // lcRequiredSuccessorDate/lcApplyDependencyConstraint.
        function lcActualLagForDep(dep, predItem, succItem) {
            const predDate = (dep.dep_type === 'SS' || dep.dep_type === 'SF') ? predItem.planned_start : predItem.planned_finish;
            const succDate = (dep.dep_type === 'FS' || dep.dep_type === 'SS') ? succItem.planned_start : succItem.planned_finish;
            if (!predDate || !succDate) return null;
            return lcDaysBetween(predDate, succDate);
        }

        // Only ever pushes a successor LATER to satisfy its dependency, and
        // only when it's actually violated — matches standard forward-pass
        // CPM behavior (moving a predecessor earlier never pulls a
        // successor back with it; that's a deliberate, separate decision
        // the user makes, not an automatic side effect of this one).
        function lcApplyDependencyConstraint(dep, predItem, succItem) {
            if (!succItem.planned_start || !succItem.planned_finish) return null;
            const required = lcRequiredSuccessorDate(dep, predItem);
            if (!required) return null;
            const constrainsStart = (dep.dep_type === 'FS' || dep.dep_type === 'SS');
            const current = constrainsStart ? succItem.planned_start : succItem.planned_finish;
            if (current >= required) return null;
            const shiftDays = Math.round((new Date(required) - new Date(current)) / 86400000);
            if (shiftDays <= 0) return null;
            return { planned_start: lcAddDays(succItem.planned_start, shiftDays), planned_finish: lcAddDays(succItem.planned_finish, shiftDays) };
        }

        // Breadth-first walk outward from the moved item along "is
        // predecessor of" edges, shifting every violated successor and then
        // continuing from IT — a diamond-shaped dependency graph can validly
        // revisit a node once its OTHER predecessor also shifts, so this
        // counts revisits rather than using a plain visited-once set, with a
        // generous cap as the only defense against a genuine cycle.
        function lcCascadeShifts(movedId, movedPatch) {
            const updates = new Map();
            const getEffective = (id) => updates.has(id) ? updates.get(id) : lcState.scheduleItems.find(si => si.id === id);
            updates.set(movedId, Object.assign({}, getEffective(movedId), movedPatch));
            const queue = [movedId];
            const visitCount = new Map();
            while (queue.length) {
                const curId = queue.shift();
                const n = (visitCount.get(curId) || 0) + 1;
                visitCount.set(curId, n);
                if (n > 50) continue;
                const curItem = getEffective(curId);
                if (!curItem) continue;
                lcState.scheduleDeps.filter(d => d.predecessor_id === curId).forEach(dep => {
                    const succ = getEffective(dep.successor_id);
                    if (!succ) return;
                    const patch = lcApplyDependencyConstraint(dep, curItem, succ);
                    if (patch) {
                        updates.set(succ.id, Object.assign({}, succ, patch));
                        queue.push(succ.id);
                    }
                });
            }
            return updates;
        }

        async function lcCommitScheduleItemDates(itemId, newStart, newFinish) {
            const updates = lcCascadeShifts(itemId, { planned_start: newStart, planned_finish: newFinish });
            const results = await Promise.all([...updates.entries()].map(([id, patch]) =>
                _supabase.from('sg_lifecycle_schedule_items')
                    .update({ planned_start: patch.planned_start, planned_finish: patch.planned_finish, updated_at: new Date().toISOString(), updated_by: currentUser.email })
                    .eq('id', id).select().single()
            ));
            const failed = results.find(r => r.error);
            if (failed) alert('خطا در ذخیره تغییرات زمان‌بندی: ' + failed.error.message);
            results.forEach(({ data }) => {
                if (!data) return;
                const idx = lcState.scheduleItems.findIndex(si => si.id === data.id);
                if (idx >= 0) lcState.scheduleItems[idx] = data;
            });

            // Re-derive lag_days for every dependency touching anything
            // that just moved (as predecessor OR successor) from wherever
            // the two items actually ended up, and persist whichever ones
            // changed — see lcActualLagForDep above for why this can't
            // just be left at whatever it was typed in as.
            const movedIds = new Set(updates.keys());
            const lagChanges = [];
            lcState.scheduleDeps.forEach(dep => {
                if (!movedIds.has(dep.predecessor_id) && !movedIds.has(dep.successor_id)) return;
                const predItem = lcState.scheduleItems.find(si => si.id === dep.predecessor_id);
                const succItem = lcState.scheduleItems.find(si => si.id === dep.successor_id);
                if (!predItem || !succItem) return;
                const actualLag = lcActualLagForDep(dep, predItem, succItem);
                if (actualLag != null && actualLag !== dep.lag_days) lagChanges.push({ dep, actualLag });
            });
            if (lagChanges.length) {
                const lagResults = await Promise.all(lagChanges.map(({ dep, actualLag }) =>
                    _supabase.from('sg_lifecycle_schedule_dependencies').update({ lag_days: actualLag }).eq('id', dep.id).select().single()
                ));
                lagResults.forEach(({ data, error }) => {
                    if (error || !data) return;
                    const idx = lcState.scheduleDeps.findIndex(d => d.id === data.id);
                    if (idx >= 0) lcState.scheduleDeps[idx] = data;
                });
            }
            lcRenderAll();
        }

        function lcBindGanttDragEvents() {
            const container = document.getElementById('lcGanttTimeline');
            if (!container) return;
            container.addEventListener('mousedown', (e) => {
                const barEl = e.target.closest('[data-lc-drag-item]');
                if (!barEl) return;
                const range = lcState._ganttRange;
                if (!range) return;
                e.preventDefault();
                const itemId = Number(barEl.dataset.lcDragItem);
                const item = lcState.scheduleItems.find(si => si.id === itemId);
                if (!item) return;
                const resizeHandle = e.target.closest('[data-lc-resize]');
                const mode = resizeHandle ? resizeHandle.dataset.lcResize : 'move';
                const pxPerDay = container.getBoundingClientRect().width / range.totalDays;
                const startX = e.clientX;
                const origStart = item.planned_start, origFinish = item.planned_finish;
                let pendingStart = origStart, pendingFinish = origFinish;

                const onMove = (ev) => {
                    const deltaDays = Math.round((ev.clientX - startX) / pxPerDay);
                    if (mode === 'move') {
                        pendingStart = lcAddDays(origStart, deltaDays);
                        pendingFinish = lcAddDays(origFinish, deltaDays);
                    } else if (mode === 'start') {
                        const candidate = lcAddDays(origStart, deltaDays);
                        pendingStart = candidate < origFinish ? candidate : origFinish;
                    } else {
                        const candidate = lcAddDays(origFinish, deltaDays);
                        pendingFinish = candidate > origStart ? candidate : origStart;
                    }
                    const leftPct = lcPctForDate(pendingStart, range), rightPct = lcPctForDate(pendingFinish, range);
                    barEl.style.left = Math.min(leftPct, rightPct) + '%';
                    barEl.style.width = Math.max(0.8, Math.abs(rightPct - leftPct)) + '%';
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (pendingStart !== origStart || pendingFinish !== origFinish) {
                        lcCommitScheduleItemDates(itemId, pendingStart, pendingFinish);
                    }
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }

        // ---------------- Auto-Fit / Fit-to-Phase ----------------
        // Reconstructs the same {isPhase, phaseCode, item, title, start,
        // finish} shape lcBuildScheduleRows() produces, from just the data
        // attributes a button carries — the fit buttons live in the label
        // row rather than the (row-object-scoped) editor drawer, so they
        // only have those attributes to go on when clicked.
        function lcRowFromRef(kind, phaseCode, itemId) {
            if (kind === 'phase') {
                const phase = lcState.phases.find(p => p.code === phaseCode);
                const pp = lcState.projectPhases[phaseCode] || {};
                return { isPhase: true, phaseCode, title: phase?.title || phaseCode, start: pp.planned_start, finish: pp.planned_finish };
            }
            const item = lcState.scheduleItems.find(si => si.id === Number(itemId));
            return { isPhase: false, phaseCode, item, title: item?.title, start: item?.planned_start, finish: item?.planned_finish };
        }

        // Pulls the parent's own dates in to exactly match the merged span
        // of its children — the fix for both a gap and an overflow at once,
        // since afterward the parent's range IS its children's range.
        async function lcAutoFitToChildren(row) {
            const children = row.isPhase ? lcScheduleChildren(row.phaseCode, null) : lcScheduleChildren(row.phaseCode, row.item.id);
            const dated = children.filter(c => c.planned_start && c.planned_finish);
            if (!dated.length) { alert('هیچ زیرمجموعه‌ای با تاریخ ثبت‌شده وجود ندارد.'); return; }
            const newStart = dated.reduce((min, c) => c.planned_start < min ? c.planned_start : min, dated[0].planned_start);
            const newFinish = dated.reduce((max, c) => c.planned_finish > max ? c.planned_finish : max, dated[0].planned_finish);
            if (newStart === row.start && newFinish === row.finish) { alert('بازه این ردیف از قبل دقیقاً با زیرمجموعه‌هایش هم‌پوشان است.'); return; }
            const ok = confirm(`تنظیم خودکار بازه «${row.title}»:\nاز: ${row.start ? formatJalali(row.start) : '—'} تا ${row.finish ? formatJalali(row.finish) : '—'}\nبه: ${formatJalali(newStart)} تا ${formatJalali(newFinish)}\n\nاعمال شود؟`);
            if (!ok) return;
            if (row.isPhase) {
                const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                    .upsert({ project_name: lcState.projectName, phase_code: row.phaseCode, planned_start: newStart, planned_finish: newFinish }, { onConflict: 'project_name,phase_code' })
                    .select().single();
                if (error) { alert('خطا: ' + error.message); return; }
                lcState.projectPhases[row.phaseCode] = data;
            } else {
                const { data, error } = await _supabase.from('sg_lifecycle_schedule_items')
                    .update({ planned_start: newStart, planned_finish: newFinish, updated_at: new Date().toISOString(), updated_by: currentUser.email })
                    .eq('id', row.item.id).select().single();
                if (error) { alert('خطا: ' + error.message); return; }
                const idx = lcState.scheduleItems.findIndex(si => si.id === row.item.id);
                if (idx >= 0) lcState.scheduleItems[idx] = data;
            }
            lcRenderAll();
        }

        // The reverse direction: proportionally rescales every dated child
        // so the merged span of all of them exactly matches the parent's
        // OWN declared range — each child keeps its relative position and
        // share of the sequence, just stretched or compressed to fit.
        async function lcFitChildrenToPhase(row) {
            if (!row.start || !row.finish) { alert('ابتدا باید بازه خود این ردیف ثبت شده باشد.'); return; }
            const children = row.isPhase ? lcScheduleChildren(row.phaseCode, null) : lcScheduleChildren(row.phaseCode, row.item.id);
            const dated = children.filter(c => c.planned_start && c.planned_finish);
            if (!dated.length) { alert('هیچ زیرمجموعه‌ای با تاریخ ثبت‌شده وجود ندارد.'); return; }
            const oldMin = dated.reduce((min, c) => c.planned_start < min ? c.planned_start : min, dated[0].planned_start);
            const oldMax = dated.reduce((max, c) => c.planned_finish > max ? c.planned_finish : max, dated[0].planned_finish);
            const oldSpanDays = Math.max(1, lcDaysBetween(oldMin, oldMax));
            const newSpanDays = Math.max(1, lcDaysBetween(row.start, row.finish));
            const scale = newSpanDays / oldSpanDays;
            const rescale = (iso) => lcAddDays(row.start, Math.round(lcDaysBetween(oldMin, iso) * scale));
            const preview = dated.map(c => ({ id: c.id, title: c.title, newStart: rescale(c.planned_start), newFinish: rescale(c.planned_finish) }));
            if (preview.every(p => p.newStart === dated.find(c => c.id === p.id).planned_start && p.newFinish === dated.find(c => c.id === p.id).planned_finish)) {
                alert('زیرمجموعه‌ها از قبل دقیقاً با بازه این ردیف هم‌پوشان‌اند.'); return;
            }
            const previewText = preview.map(p => `${p.title}: ${formatJalali(p.newStart)} تا ${formatJalali(p.newFinish)}`).join('\n');
            const ok = confirm(`بازه همه زیرمجموعه‌های «${row.title}» متناسب با بازه خودش (${formatJalali(row.start)} تا ${formatJalali(row.finish)}) بازتنظیم می‌شود:\n\n${previewText}\n\nاعمال شود؟`);
            if (!ok) return;
            const results = await Promise.all(preview.map(p =>
                _supabase.from('sg_lifecycle_schedule_items')
                    .update({ planned_start: p.newStart, planned_finish: p.newFinish, updated_at: new Date().toISOString(), updated_by: currentUser.email })
                    .eq('id', p.id).select().single()
            ));
            const failed = results.find(r => r.error);
            if (failed) alert('خطا در ذخیره: ' + failed.error.message);
            results.forEach(({ data }) => {
                if (!data) return;
                const idx = lcState.scheduleItems.findIndex(si => si.id === data.id);
                if (idx >= 0) lcState.scheduleItems[idx] = data;
            });
            lcRenderAll();
        }

        // ---------------- Mutations ----------------
        async function lcSaveItemFromRow(rowEl) {
            if (!rowEl) return;
            const kind = rowEl.dataset.kind, itemId = Number(rowEl.dataset.itemId), phaseCode = rowEl.dataset.phase;
            const status = rowEl.querySelector('[data-lc-action="set-status"]').value;
            const evidence = rowEl.querySelector('[data-lc-field="evidence"]').value.trim();
            const patch = {
                project_name: lcState.projectName, phase_code: phaseCode, kind, item_id: itemId,
                status, evidence: evidence || null, updated_at: new Date().toISOString(), updated_by: currentUser.email,
            };
            // «امکان ضمیمه نمودن فایل» — same public-bucket-plus-folder-check
            // Storage pattern already used for signature uploads, scoped by
            // project name so lifecycle_evidence's RLS can check it.
            const fileInput = rowEl.querySelector('[data-lc-field="evidence-file"]');
            const file = fileInput?.files?.[0];
            if (file) {
                const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
                const path = `${lcState.projectName}/${phaseCode}/${kind}/${itemId}/${Date.now()}.${ext}`;
                const { error: uploadError } = await _supabase.storage.from('lifecycle-evidence').upload(path, file, { upsert: true });
                if (uploadError) { alert('خطا در بارگذاری فایل: ' + uploadError.message); return; }
                const { data: urlData } = _supabase.storage.from('lifecycle-evidence').getPublicUrl(path);
                patch.evidence_file_url = urlData.publicUrl;
            }
            const todayIso = new Date().toISOString().slice(0, 10);
            if (status === 'submitted' && kind === 'output') patch.submitted_by = currentUser.email;
            if (status === 'verified') { patch.verified_by = currentUser.email; patch.verification_date = todayIso; }
            const { data, error } = await _supabase.from('sg_project_phase_items')
                .upsert(patch, { onConflict: 'project_name,phase_code,kind,item_id' })
                .select().single();
            if (error) { alert('خطا در ذخیره: ' + error.message); return; }
            lcState.items[phaseCode] = lcState.items[phaseCode] || { objective: {}, output: {}, criterion: {} };
            lcState.items[phaseCode][kind][itemId] = data;
            lcRenderAll();
        }

        async function lcRequestGateReview(phaseCode) {
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert({ project_name: lcState.projectName, phase_code: phaseCode, gate_status: 'ready_for_review', gate_requested_at: new Date().toISOString(), gate_requested_by: currentUser.email }, { onConflict: 'project_name,phase_code' })
                .select().single();
            if (error) { alert('خطا: ' + error.message); return; }
            lcState.projectPhases[phaseCode] = data;
            lcRenderAll();
        }

        async function lcDecideGate(phaseCode, decision) {
            let reason = null, condition_text = null, condition_owner = null, condition_due_date = null;
            if (decision === 'return') {
                reason = prompt('دلیل بازگشت جهت اقدام را وارد کنید:');
                if (!reason) return;
            } else if (decision === 'conditional') {
                condition_text = prompt('شرط عبور را وارد کنید:');
                if (!condition_text) return;
                condition_owner = prompt('مسئول پیگیری شرط:') || null;
                const dueJalali = prompt('مهلت پیگیری شرط (YYYY/MM/DD شمسی، اختیاری):');
                condition_due_date = dueJalali ? jalaliInputToIso(dueJalali) : null;
            }
            const { error: decErr } = await _supabase.from('sg_lifecycle_gate_decisions').insert({
                project_name: lcState.projectName, phase_code: phaseCode, decision, reason, condition_text, condition_owner, condition_due_date, decided_by: currentUser.email,
            });
            if (decErr) { alert('خطا در ثبت تصمیم: ' + decErr.message); return; }
            const newStatus = decision === 'pass' ? 'passed' : decision === 'conditional' ? 'conditional' : 'not_ready';
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert({ project_name: lcState.projectName, phase_code: phaseCode, gate_status: newStatus }, { onConflict: 'project_name,phase_code' })
                .select().single();
            if (error) { alert('خطا در به‌روزرسانی وضعیت گیت: ' + error.message); return; }
            lcState.projectPhases[phaseCode] = data;
            lcState.gateDecisions[phaseCode] = lcState.gateDecisions[phaseCode] || [];
            lcState.gateDecisions[phaseCode].unshift({ project_name: lcState.projectName, phase_code: phaseCode, decision, reason, condition_text, condition_owner, condition_due_date, decided_by: currentUser.email, decided_at: new Date().toISOString() });
            lcRenderAll();
        }

        // «اگر گیتی به اشتباه تایید نهایی شده بود ادمین قابلیت کنسل کردن
        // آن را داشته باشد» — resets gate_status back to 'not_ready' rather
        // than guessing a replacement status: lcGateReadiness already
        // re-derives 'ready_for_review' vs 'not_ready' from the phase's
        // real checklist state whenever stored is 'not_ready', so this
        // naturally lands wherever the phase actually is right now.
        async function lcCancelGatePass(phaseCode) {
            if (!isAdminUser()) return;
            const reason = prompt('دلیل لغو تایید نهایی این گیت را وارد کنید:');
            if (!reason) return;
            const { error: decErr } = await _supabase.from('sg_lifecycle_gate_decisions').insert({
                project_name: lcState.projectName, phase_code: phaseCode, decision: 'cancelled', reason, decided_by: currentUser.email,
            });
            if (decErr) { alert('خطا در ثبت لغو: ' + decErr.message); return; }
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert({ project_name: lcState.projectName, phase_code: phaseCode, gate_status: 'not_ready' }, { onConflict: 'project_name,phase_code' })
                .select().single();
            if (error) { alert('خطا در به‌روزرسانی وضعیت گیت: ' + error.message); return; }
            lcState.projectPhases[phaseCode] = data;
            lcState.gateDecisions[phaseCode] = lcState.gateDecisions[phaseCode] || [];
            lcState.gateDecisions[phaseCode].unshift({ project_name: lcState.projectName, phase_code: phaseCode, decision: 'cancelled', reason, decided_by: currentUser.email, decided_at: new Date().toISOString() });
            lcRenderAll();
        }

        async function lcRecordBasicDesignProgress(phaseCode) {
            const period = document.querySelector('[data-lc-field="bd-period"]')?.value.trim() || null;
            const pctRaw = document.querySelector('[data-lc-field="bd-pct"]')?.value;
            const pct = Number(pctRaw);
            if (pctRaw === '' || pctRaw == null || isNaN(pct) || pct < 0 || pct > 100) { alert('درصد پیشرفت باید عددی بین ۰ تا ۱۰۰ باشد.'); return; }
            const previous = lcState.projectPhases[phaseCode]?.manual_actual_pct ?? null;
            const { error: histErr } = await _supabase.from('sg_lifecycle_progress_history').insert({
                project_name: lcState.projectName, phase_code: phaseCode, period_label: period, previous_pct: previous, new_pct: pct, recorded_by: currentUser.email,
            });
            if (histErr) { alert('خطا در ثبت تاریخچه: ' + histErr.message); return; }
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert({ project_name: lcState.projectName, phase_code: phaseCode, manual_actual_pct: pct, updated_at: new Date().toISOString(), updated_by: currentUser.email }, { onConflict: 'project_name,phase_code' })
                .select().single();
            if (error) { alert('خطا در به‌روزرسانی پیشرفت: ' + error.message); return; }
            lcState.projectPhases[phaseCode] = data;
            lcState.progressHistory[phaseCode] = lcState.progressHistory[phaseCode] || [];
            lcState.progressHistory[phaseCode].push({ project_name: lcState.projectName, phase_code: phaseCode, period_label: period, previous_pct: previous, new_pct: pct, recorded_by: currentUser.email, recorded_at: new Date().toISOString() });
            lcRenderAll();
        }

        async function lcSavePhaseWeight(phaseCode, valueStr) {
            const value = Number(valueStr);
            if (valueStr === '' || valueStr == null || isNaN(value) || value < 0 || value > 100) { alert('وزن باید عددی بین ۰ تا ۱۰۰ باشد.'); return; }
            const before = lcState.projectPhases[phaseCode]?.weight_pct ?? null;
            const { data, error } = await _supabase.from('sg_project_lifecycle_phases')
                .upsert({ project_name: lcState.projectName, phase_code: phaseCode, weight_pct: value }, { onConflict: 'project_name,phase_code' })
                .select().single();
            if (error) { alert('خطا: ' + error.message); return; }
            lcState.projectPhases[phaseCode] = data;
            await _supabase.from('sg_lifecycle_audit_log').insert({
                project_name: lcState.projectName, phase_code: phaseCode, action: 'update_weight', field: 'weight_pct',
                old_value: before != null ? String(before) : null, new_value: String(value), changed_by: currentUser.email,
            });
            lcRenderAll();
        }

        function lcSelectPhase(code) {
            lcState.selectedPhase = code;
            lcRenderAll();
            // Land where the user actually needs to act — the checklist/
            // gate-action body at the bottom of the phase page — rather than
            // jumping to the top of the whole لایف‌سایکل view (hero + its
            // own timeline), which just makes them scroll down again anyway.
            const target = document.getElementById('lcPhaseDetailBody') || document.getElementById('lifecycleView');
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function lcBindEvents() {
            const root = document.getElementById('lcBody');
            root.querySelectorAll('[data-lc-tab]').forEach(btn => btn.addEventListener('click', () => { lcState.activeTab = btn.dataset.lcTab; lcRenderAll(); }));
            root.querySelectorAll('[data-lc-toggle-row]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); lcToggleScheduleRow(btn.dataset.lcToggleRow); }));
            root.querySelectorAll('[data-lc-open-schedule-editor]').forEach(el => el.addEventListener('click', () => lcOpenScheduleEditor(el.dataset.kind, el.dataset.phase, el.dataset.itemId)));
            root.querySelectorAll('[data-lc-action="close-schedule-editor"]').forEach(btn => btn.addEventListener('click', () => { lcState.scheduleEditor = null; lcRenderAll(); }));
            root.querySelectorAll('[data-lc-action="save-schedule-item"]').forEach(btn => btn.addEventListener('click', lcSaveScheduleItem));
            root.querySelectorAll('[data-lc-action="add-schedule-child"]').forEach(btn => btn.addEventListener('click', () => lcAddScheduleChild(btn.dataset.parentId, btn.dataset.phase)));
            root.querySelectorAll('[data-lc-action="delete-schedule-item"]').forEach(btn => btn.addEventListener('click', () => lcDeleteScheduleItem(btn.dataset.id)));
            root.querySelectorAll('[data-lc-action="add-dependency"]').forEach(btn => btn.addEventListener('click', () => lcAddDependency(Number(btn.dataset.id))));
            root.querySelectorAll('[data-lc-action="delete-dependency"]').forEach(btn => btn.addEventListener('click', () => lcDeleteDependency(btn.dataset.id)));
            root.querySelectorAll('[data-lc-action="edit-dependency"]').forEach(btn => btn.addEventListener('click', () => { if (lcState.scheduleEditor) lcState.scheduleEditor.editingDepId = Number(btn.dataset.id); lcRenderAll(); }));
            root.querySelectorAll('[data-lc-action="cancel-dependency-edit"]').forEach(btn => btn.addEventListener('click', () => { if (lcState.scheduleEditor) lcState.scheduleEditor.editingDepId = null; lcRenderAll(); }));
            root.querySelectorAll('[data-lc-action="save-dependency-edit"]').forEach(btn => btn.addEventListener('click', () => lcUpdateDependency(btn.dataset.id)));
            // 'change' covers typing-then-blur; 'input' also covers a
            // calendar-picker pick (openJalaliPicker's selectDay only
            // dispatches 'input', not 'change').
            root.querySelectorAll('[data-lc-sf="start"], [data-lc-sf="finish"], [data-lc-sf="duration"]').forEach(el => ['change', 'input'].forEach(evt => el.addEventListener(evt, () => lcHandleScheduleDateTriad(root, el.dataset.lcSf))));
            root.querySelectorAll('[data-lc-sf="start"], [data-lc-sf="finish"]').forEach(el => attachJalaliDatePickerKeyboardOk(el));
            root.querySelectorAll('[data-lc-action="auto-fit"]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); lcAutoFitToChildren(lcRowFromRef(btn.dataset.rowKind, btn.dataset.phase, btn.dataset.itemId)); }));
            root.querySelectorAll('[data-lc-action="fit-children"]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); lcFitChildrenToPhase(lcRowFromRef(btn.dataset.rowKind, btn.dataset.phase, btn.dataset.itemId)); }));
            root.querySelectorAll('[data-lc-action="auto-generate-objectives"]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); lcAutoGenerateScheduleFromObjectives(btn.dataset.phase); }));
            root.querySelectorAll('[data-lc-action="auto-generate-all-objectives"]').forEach(btn => btn.addEventListener('click', lcAutoGenerateAllPhasesFromObjectives));
            root.querySelectorAll('[data-lc-action="replan-from-delay"]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); lcReplanFromDelay(btn.dataset.phase); }));
            root.querySelectorAll('[data-lc-action="create-baseline"]').forEach(btn => btn.addEventListener('click', lcCreateBaseline));
            root.querySelectorAll('[data-lc-set-strategy]').forEach(btn => btn.addEventListener('click', () => lcSetStrategyDraft(btn.dataset.lcSetStrategy)));
            root.querySelectorAll('[data-lc-strategy-start]').forEach(input => input.addEventListener('change', () => lcSetStrategyDraftStart(input.value.trim())));
            root.querySelectorAll('[data-lc-action="apply-master-schedule"]').forEach(btn => btn.addEventListener('click', lcApplyMasterSchedule));
            root.querySelectorAll('[data-lc-action="create-master-baseline"]').forEach(btn => btn.addEventListener('click', lcCreateMasterBaseline));
            root.querySelectorAll('[data-lc-action="save-success-template"]').forEach(btn => btn.addEventListener('click', lcSaveAsSuccessTemplate));
            root.querySelectorAll('[data-lc-action="gantt-zoom-in"]').forEach(btn => btn.addEventListener('click', () => lcGanttZoomStep(1)));
            root.querySelectorAll('[data-lc-action="gantt-zoom-out"]').forEach(btn => btn.addEventListener('click', () => lcGanttZoomStep(-1)));
            root.querySelectorAll('[data-lc-action="gantt-zoom-reset"]').forEach(btn => btn.addEventListener('click', () => { lcState.ganttZoom = 1; lcRenderAll(); }));
            lcBindGanttDragEvents();
            root.querySelectorAll('[data-lc-phase]').forEach(el => el.addEventListener('click', () => lcSelectPhase(el.dataset.lcPhase)));
            const backBtn = root.querySelector('[data-lc-back-to-orbit]');
            if (backBtn) backBtn.addEventListener('click', () => { lcState.selectedPhase = null; lcRenderAll(); });
            root.querySelectorAll('[data-lc-action="save-item"]').forEach(btn => btn.addEventListener('click', () => lcSaveItemFromRow(btn.closest('[data-lc-item-row]'))));
            root.querySelectorAll('[data-lc-action="request-gate"]').forEach(btn => btn.addEventListener('click', () => lcRequestGateReview(btn.dataset.phase)));
            root.querySelectorAll('[data-lc-action="gate-pass"]').forEach(btn => btn.addEventListener('click', () => lcDecideGate(btn.dataset.phase, 'pass')));
            root.querySelectorAll('[data-lc-action="gate-conditional"]').forEach(btn => btn.addEventListener('click', () => lcDecideGate(btn.dataset.phase, 'conditional')));
            root.querySelectorAll('[data-lc-action="gate-return"]').forEach(btn => btn.addEventListener('click', () => lcDecideGate(btn.dataset.phase, 'return')));
            root.querySelectorAll('[data-lc-action="cancel-gate-pass"]').forEach(btn => btn.addEventListener('click', () => lcCancelGatePass(btn.dataset.phase)));
            root.querySelectorAll('[data-lc-action="record-bd-progress"]').forEach(btn => btn.addEventListener('click', () => lcRecordBasicDesignProgress(btn.dataset.phase)));
            root.querySelectorAll('[data-lc-action="save-phase-weight"]').forEach(btn => btn.addEventListener('click', () => lcSavePhaseWeight(btn.dataset.phase, btn.previousElementSibling.value)));
            root.querySelectorAll('[data-lc-action="goto-client-report"]').forEach(btn => btn.addEventListener('click', () => switchView('clientReport')));
        }

  return { openLifecyclePreview, lcState: () => lcState }
}
