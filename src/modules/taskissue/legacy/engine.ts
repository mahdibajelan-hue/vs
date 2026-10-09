// @ts-nocheck
/* eslint-disable */
import Chart from 'chart.js/auto'
// Task control tower (پایش اقدامات) + project issue tracking (پیگیری موانع پروژه‌ها) — a faithful port of the two
// modules in 30-Day_Quick_Win_Challenge/index.html. Logic and rendering are kept as in the source; only the data layer
// (tm_* tables) is adapted and the host-page globals are injected through `env`.
export function createTaskIssueEngine(env) {
  const { _supabase, currentUser, currentProfile, myProjectAccess } = env
  const switchView = (v) => { if (env.switchView) env.switchView(v) }
  const printPage = () => window.print()
        function lcAddDays(iso, days) {
            if (!iso) return iso;
            const d = new Date(iso);
            d.setDate(d.getDate() + days);
            return d.toISOString().slice(0, 10);
        }
        function formatJalali(isoDateStr) {
            if (!isoDateStr) return '';
            const datePart = String(isoDateStr).slice(0, 10);
            const [gy, gm, gd] = datePart.split('-').map(Number);
            if (!gy || !gm || !gd) return '';
            const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
            return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
        }
        async function rejectQuickWinTask(taskId) {
            if (!confirm('این تسک به «در حال انجام» بازگردانده شود تا مسئول دوباره اقدام کند؟')) return;
            const { error } = await _supabase.from('tm_case_updates')
                .update({ task_status: 'در حال انجام', submitted_at: null, submitted_note: null })
                .eq('id', taskId);
            if (error) { alert('خطا در بازگشت تسک: ' + error.message); return; }
            refreshTasksView();
        }
        function toPersianDigits(str) {
            return String(str).replace(/[0-9]/g, d => PERSIAN_DIGITS[d]);
        }
        const AI_SEVERITY_STYLE = {
            'بحرانی': { text: 'text-red-700', bg: 'bg-red-100', hex: '#ef4444' },
            'زیاد': { text: 'text-amber-700', bg: 'bg-amber-100', hex: '#f59e0b' },
            'متوسط': { text: 'text-blue-900', bg: 'bg-blue-100', hex: '#3b82f6' },
            'کم': { text: 'text-emerald-700', bg: 'bg-emerald-100', hex: '#22c55e' },
        };
        const DECIDED_STATUSES = ['انتخاب‌شده', 'در حال اجرا', 'بسته‌شده'];
        function renderStatusDonut(canvasId, centerId, legendId, segments) {
            const total = segments.reduce((a, s) => a + s.value, 0);
            document.getElementById(centerId).textContent = toPersianDigits(total);
            if (overviewCharts[canvasId]) overviewCharts[canvasId].destroy();
            const ctx = document.getElementById(canvasId).getContext('2d');
            overviewCharts[canvasId] = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: segments.map(s => s.label), datasets: [{ data: segments.map(s => s.value), backgroundColor: segments.map(s => s.color), borderWidth: 0 }] },
                options: { cutout: '72%', plugins: { legend: { display: false } } }
            });
            document.getElementById(legendId).innerHTML = segments.map(s => {
                const pct = total ? Math.round((s.value / total) * 100) : 0;
                return `<div class="flex items-center justify-between">
                    <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full inline-block shrink-0" style="background:${s.color}"></span>${esc(s.label)}</span>
                    <span class="text-slate-500 shrink-0">${toPersianDigits(s.value)} (${toPersianDigits(pct)}%)</span>
                </div>`;
            }).join('');
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
        function iconSvg(name, cls) {
            return `<svg class="${cls || 'w-5 h-5'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
        }
        function attachJalaliDatePickerKeyboardOk(input) {
            input.classList.add('cursor-pointer');
            input.addEventListener('click', (e) => { e.stopPropagation(); openJalaliPicker(input); });
        }
        function todayJalali() {
            const now = new Date();
            return formatJalali(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
        }
        function aiSevBadge(level) {
            const s = AI_SEVERITY_STYLE[level] || { text: 'text-slate-600', bg: 'bg-slate-100' };
            const icon = { 'بحرانی': '🛑', 'زیاد': '⚠️', 'متوسط': '🔶', 'کم': '🟢' }[level] || '';
            return `<span class="${s.bg} ${s.text} px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap">${icon} ${esc(level || '-')}</span>`;
        }
        function personDisplayName(u) {
            return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email;
        }
        async function saveActualValue(caseId, actualResult, daysSaved, costAvoided) {
            const { error } = await _supabase.from('tm_cases').update({
                actual_result: actualResult || null,
                actual_value_json: {
                    days_saved: daysSaved !== '' ? Number(daysSaved) : null,
                    cost_avoided_rial: costAvoided !== '' ? Number(costAvoided) : null,
                },
            }).eq('id', caseId);
            if (error) { alert('خطا در ثبت نتیجه نهایی: ' + error.message); return; }
            alert('نتیجه نهایی ثبت شد.');
            refreshTasksView();
        }
        const JALALI_WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
        async function reopenQuickWinTask(taskId) {
            if (!confirm('این تسک به حالت «انجام‌نشده» بازگردانده شود؟')) return;
            const { error } = await _supabase.from('tm_case_updates')
                .update({ task_status: 'باز', completed_at: null })
                .eq('id', taskId);
            if (error) { alert('خطا در بازگردانی تسک: ' + error.message); return; }
            refreshTasksView();
        }
        function daysInJalaliMonth(jy, jm) {
            if (jm <= 6) return 31;
            if (jm <= 11) return 30;
            // Esfand: round-trip day 30 through Gregorian to see if this
            // Jalali year is leap, using the exact same conversion the
            // rest of the app relies on (instead of a separate leap-year
            // formula that could disagree with it).
            const [gy, gm, gd] = jalaliToGregorian(jy, 12, 30);
            const [jy2, jm2, jd2] = gregorianToJalali(gy, gm, gd);
            return (jy2 === jy && jm2 === 12 && jd2 === 30) ? 30 : 29;
        }
        function toLatinDigits(str) {
            return String(str).replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)));
        }
        const JALALI_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        function lcEmptyStateHtml(msg) {
            return `<div class="bg-white rounded-2xl shadow-sm border p-10 text-center text-slate-400 text-sm">${esc(msg)}</div>`;
        }
        async function syncCaseStatusesFromTasks(cases, tasks) {
            const patches = [];
            cases.forEach(dec => {
                if (!['انتخاب‌شده', 'در حال اجرا', 'بسته‌شده'].includes(dec.status)) return;
                const rollup = computeCaseRollupFromTasks(dec.id, tasks);
                if (!rollup.hasTasks) return;
                const newStatus = rollup.percent >= 100 ? 'بسته‌شده' : 'در حال اجرا';
                if (newStatus === dec.status) return;
                const patch = newStatus === 'بسته‌شده' ? { status: 'بسته‌شده', closed_at: new Date().toISOString() } : { status: 'در حال اجرا', closed_at: null };
                dec.status = patch.status; dec.closed_at = patch.closed_at;
                patches.push(_supabase.from('tm_cases').update(patch).eq('id', dec.id));
            });
            if (patches.length) await Promise.all(patches);
        }
        function computeCaseRollupFromTasks(caseId, tasks) {
            const caseTasks = tasks.filter(t => t.case_id === caseId);
            if (!caseTasks.length) return { hasTasks: false, percent: 0, doneCount: 0, totalCount: 0, minStart: null, maxDue: null, tasks: [] };
            let weightedTotal = 0, weightedDone = 0, doneCount = 0, minStart = null, maxDue = null;
            caseTasks.forEach(t => {
                const start = t.start_date || t.due_date || null;
                const due = t.due_date || t.start_date || null;
                let weight = 1;
                if (start && due) weight = Math.max(1, Math.round((new Date(due) - new Date(start)) / 86400000));
                weightedTotal += weight;
                if (t.task_status === 'انجام‌شده') { weightedDone += weight; doneCount++; }
                if (start && (!minStart || start < minStart)) minStart = start;
                if (due && (!maxDue || due > maxDue)) maxDue = due;
            });
            return {
                hasTasks: true,
                percent: weightedTotal ? Math.round((weightedDone / weightedTotal) * 100) : 0,
                doneCount, totalCount: caseTasks.length, minStart, maxDue,
                tasks: caseTasks.slice().sort((a, b) => (a.start_date || '') < (b.start_date || '') ? -1 : 1),
            };
        }
        function esc(str) {
            const d = document.createElement('div');
            d.textContent = str ?? '';
            return d.innerHTML;
        }
        async function addQuickWinTask(caseId, projectName, title, responsibleName, responsibleEmail, startDateJalali, dueDateJalali, extra) {
            const startDateIso = jalaliInputToIso(startDateJalali);
            const dueDateIso = jalaliInputToIso(dueDateJalali);
            if (!title || !responsibleName || !responsibleEmail || !startDateIso || !dueDateIso) {
                alert('عنوان، مسئول، ایمیل مسئول، تاریخ شروع و پایان (به‌صورت ۱۴۰۵/۰۶/۳۰) الزامی است.');
                return;
            }
            if (startDateIso > dueDateIso) { alert('تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.'); return; }
            const { error } = await _supabase.from('tm_case_updates').insert([{
                case_id: caseId, project_name: projectName, kind: 'task', title, responsible_name: responsibleName, responsible_email: responsibleEmail,
                start_date: startDateIso, due_date: dueDateIso, task_status: 'باز', created_by: currentUser.email,
                severity: (extra && extra.severity) || 'متوسط', responsible_unit: (extra && extra.responsibleUnit) || null,
            }]);
            if (error) { alert('خطا در ثبت تسک: ' + error.message); return; }
            refreshTasksView();
        }
        function isTaskOverdue(task) {
            return task.task_status !== 'انجام‌شده' && task.due_date < new Date().toISOString().slice(0, 10);
        }
        function jalaliInputToIso(jalaliStr) {
            const parts = parseJalaliDateParts(jalaliStr);
            if (!parts) return null;
            const [gy, gm, gd] = jalaliToGregorian(parts[0], parts[1], parts[2]);
            return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
        }
        async function deleteQuickWinTask(taskId) {
            const { error } = await _supabase.from('tm_case_updates').delete().eq('id', taskId);
            if (error) { alert('خطا در حذف تسک: ' + error.message); return; }
            refreshTasksView();
        }
        async function submitQuickWinTask(taskId) {
            const note = prompt('توضیح اقدام انجام‌شده (اختیاری):', '');
            if (note === null) return;
            const { error } = await _supabase.from('tm_case_updates')
                .update({ task_status: 'در انتظار تایید', submitted_at: new Date().toISOString(), submitted_note: note || null })
                .eq('id', taskId);
            if (error) { alert('خطا در ثبت اقدام: ' + error.message); return; }
            refreshTasksView();
        }
        function attachJalaliDatePicker(input) {
            input.readOnly = true;
            input.classList.add('cursor-pointer', 'bg-white');
            input.addEventListener('click', (e) => { e.stopPropagation(); openJalaliPicker(input); });
        }
        async function completeQuickWinTask(taskId) {
            const { error } = await _supabase.from('tm_case_updates')
                .update({ task_status: 'انجام‌شده', completed_at: new Date().toISOString() })
                .eq('id', taskId);
            if (error) { alert('خطا در ثبت اتمام تسک: ' + error.message); return; }
            refreshTasksView();
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
        function refreshTasksView() {
            loadTasksView();
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
        const overviewCharts = {};
        const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        function parseJalaliDateParts(jalaliStr) {
            const normalized = toLatinDigits(jalaliStr || '').trim();
            const parts = normalized.split(/[\/\-]/).map(Number);
            if (parts.length !== 3 || parts.some(n => isNaN(n))) return null;
            const [jy, jm, jd] = parts;
            if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
            return [jy, jm, jd];
        }
        let activeJalaliPickerInput = null;
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
        let activeJalaliPicker = null;
        let activeJalaliPickerOutsideHandler = null;
        // ============================================================
        // پایش اقدامات (TASK CONTROL TOWER)
        // ============================================================
        // Points at the EXISTING execution-task model (case_updates where
        // kind='task') rather than a separate entity — this dashboard used
        // to be an "Issue Control Tower" writing to its own new issues/
        // issue_updates tables, but that duplicated the task tracking this
        // app already had (with its own tested submit/approve workflow —
        // isTaskOverdue, quickWinTaskItemHtml, wireTasksList,
        // completeQuickWinTask, submitQuickWinTask, rejectQuickWinTask,
        // deleteQuickWinTask, updateQuickWinTask, addQuickWinTask, all
        // defined earlier in this file and reused here unchanged). This
        // dashboard is a new lens on that same data (filters/KPIs/charts/
        // aging/overdue-radar/responsibility/trend/action-center/drawer),
        // not a second task system — the previously-inline per-case task
        // checklist on پیگیری اجرای اقدامات زودبازده now lives only here.
        //
        // Deliberately scoped down from the original brief in the same way
        // as before: one severity scale reused as both "priority" and
        // "severity" (matches AI_SEVERITY_STYLE elsewhere in this app), no
        // Portfolio/Plan hierarchy (only projects exist), no PDF/Excel/PPT
        // generator beyond print-card + window.print() plus a CSV export,
        // no Saved Views/role-based dashboard variants, no attachments (no
        // file-storage infra exists anywhere in this app). There's also no
        // separate comment/timeline table for tasks — description is a
        // plain editable field on the task row itself, and "escalate" logs
        // into it rather than a routed notification or a new table.
        const TASK_UNITS = ['مهندسی', 'تأمین', 'اجرا', 'برنامه‌ریزی', 'قرارداد', 'کنترل کیفیت', 'HSE', 'سایر'];
        const TASK_SEVERITIES = ['بحرانی', 'زیاد', 'متوسط', 'کم'];
        const TASK_STATUSES = ['باز', 'در حال انجام', 'در انتظار تایید', 'انجام‌شده'];
        const TASK_STATUS_COLOR = { 'باز': '#3b82f6', 'در حال انجام': '#f59e0b', 'در انتظار تایید': '#a855f7', 'انجام‌شده': '#22c55e' };
        const TASK_DUE_SOON_DAYS = 5;
        const TASK_NOT_STARTED_DAYS = 7;

        let taskCharts = {};
        let allTasksRaw = [];
        let taskProjectsCache = [];
        let taskCasesCache = [];
        let taskUsersByProject = {};
        let taskFilters = { projects: [], units: [], severities: [], statuses: [], people: [], overdueOnly: false, dueSoonOnly: false, dateFrom: null, dateTo: null, search: '' };
        let taskActionTab = 'overdue';
        let taskTrendGranularity = 'monthly';
        let taskStatsTab = 'status';
        let currentDrawerTaskId = null;
        let taskStaticControlsWired = false;
        let pendingTaskFilterCaseId = null;

        function isTaskDueSoon(task) {
            if (task.task_status === 'انجام‌شده' || !task.due_date || isTaskOverdue(task)) return false;
            const days = Math.round((new Date(task.due_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
            return days >= 0 && days <= TASK_DUE_SOON_DAYS;
        }
        function taskAgeDays(task) {
            const end = task.completed_at || new Date().toISOString();
            return Math.max(0, Math.round((new Date(end) - new Date(task.created_at)) / 86400000));
        }
        function taskOverdueDays(task) {
            return isTaskOverdue(task) ? Math.round((new Date(new Date().toISOString().slice(0, 10)) - new Date(task.due_date)) / 86400000) : 0;
        }
        function taskIsEscalated(task) {
            if (task.task_status === 'انجام‌شده') return false;
            if (task.severity === 'بحرانی' && isTaskOverdue(task)) return true;
            return taskOverdueDays(task) > 14;
        }

        // Set right before switchView('tasks') so loadTasksView() can land
        // pre-filtered to the case that was jumped from (e.g. the "تعریف
        // تسک" offer out of saveEvaluation(), or the tracking-page card's
        // own jump link) — mirrors the pre-existing pendingTrackingScrollToCaseId
        // pattern, just aimed at a filter instead of a scroll target.
        function jumpToTaskTower(caseId) {
            pendingTaskFilterCaseId = caseId;
            switchView('tasks');
        }

        async function loadTasksView() {
            const isAdmin = currentProfile.role === 'admin';
            document.getElementById('tasksNewBtn').classList.toggle('hidden', !isAdmin);
            const { data: projects } = await _supabase.from('tm_projects').select('*').order('name');
            taskProjectsCache = (projects || []).filter(p => p.is_guide || isAdmin || myProjectAccess.some(a => a.project_name === p.name));

            const [{ data: casesData }, { data: updatesData }] = await Promise.all([
                _supabase.from('tm_cases').select('*').in('status', [...DECIDED_STATUSES, 'اقدام میان‌مدت']).order('proposed_at', { ascending: false }),
                _supabase.from('tm_case_updates').select('*').eq('kind', 'task').order('created_at', { ascending: false }),
            ]);
            taskCasesCache = casesData || [];
            const caseById = {};
            taskCasesCache.forEach(c => { caseById[c.id] = c; });
            // A task's own project_name column (migration 035) is now the
            // source of truth — it's set directly for a caseless "تسک عمومی
            // پروژه" and mirrored from the case otherwise; the case lookup
            // only ever still supplies case_title.
            allTasksRaw = (updatesData || []).map(t => ({ ...t, project_name: t.project_name || (caseById[t.case_id] || {}).project_name, case_title: (caseById[t.case_id] || {}).title || null }));
            // Auto-sync cases.status from each case's rolled-up task
            // progress (see syncCaseStatusesFromTasks) — the write path
            // that used to be the manual progress-update form. Admin-only
            // since RLS scopes case writes the same way the old form's UI
            // did; every role still reads the up-to-date rollup below.
            if (isAdmin) await syncCaseStatusesFromTasks(taskCasesCache, allTasksRaw);

            const uniqueProjectNames = [...new Set(taskProjectsCache.map(p => p.name))];
            const entries = await Promise.all(uniqueProjectNames.map(async pn => {
                const { data } = await _supabase.rpc('tm_list_project_users', { p_project_name: pn });
                return [pn, data || []];
            }));
            taskUsersByProject = {};
            entries.forEach(([pn, users]) => { taskUsersByProject[pn] = users; });

            renderTaskFilterOptions();
            renderNewTaskFormOptions();
            wireTaskStaticControls();

            if (pendingTaskFilterCaseId != null) {
                const targetCase = caseById[pendingTaskFilterCaseId];
                pendingTaskFilterCaseId = null;
                if (targetCase) { taskFilters.projects = [targetCase.project_name]; syncTaskFilterSelectsFromState(); }
            }
            renderAllTaskSections();
        }

        // Free-text fallback alongside the structured dropdown filters — a
        // native <select multiple> is easy to misuse (a plain click on a
        // second option silently replaces the first instead of adding to
        // it, unless the user holds Ctrl/Cmd), so this gives a reliable way
        // to find a task by typing regardless of whether a dropdown ended
        // up in a state the user didn't intend. Matches across every field
        // a person might search by, with Persian/Latin digits normalized.
        function taskMatchesSearch(t, query) {
            if (!query) return true;
            const haystack = [t.title, t.project_name, t.case_title, t.responsible_name, t.responsible_unit, t.severity, t.task_status].filter(Boolean).join(' ');
            return toLatinDigits(haystack).toLowerCase().includes(toLatinDigits(query).toLowerCase());
        }

        function computeFilteredTasks() {
            return allTasksRaw.filter(t => {
                if (taskFilters.projects.length && !taskFilters.projects.includes(t.project_name)) return false;
                if (taskFilters.units.length && !taskFilters.units.includes(t.responsible_unit)) return false;
                if (taskFilters.severities.length && !taskFilters.severities.includes(t.severity)) return false;
                if (taskFilters.statuses.length && !taskFilters.statuses.includes(t.task_status)) return false;
                if (taskFilters.people.length && !taskFilters.people.includes(t.responsible_name)) return false;
                if (taskFilters.overdueOnly && !isTaskOverdue(t)) return false;
                if (taskFilters.dueSoonOnly && !isTaskDueSoon(t)) return false;
                if (taskFilters.dateFrom && t.created_at < taskFilters.dateFrom) return false;
                if (taskFilters.dateTo && t.created_at > taskFilters.dateTo + 'T23:59:59') return false;
                if (!taskMatchesSearch(t, taskFilters.search.trim())) return false;
                return true;
            });
        }

        function renderTaskFilterOptions() {
            document.getElementById('taskFilterProject').innerHTML = taskProjectsCache.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
            document.getElementById('taskFilterUnit').innerHTML = TASK_UNITS.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
            document.getElementById('taskFilterSeverity').innerHTML = TASK_SEVERITIES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
            document.getElementById('taskFilterStatus').innerHTML = TASK_STATUSES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
            const people = [...new Set(allTasksRaw.map(t => t.responsible_name).filter(Boolean))].sort();
            document.getElementById('taskFilterPerson').innerHTML = people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
            syncTaskFilterSelectsFromState();
        }

        function syncTaskFilterSelectsFromState() {
            const sync = (id, values) => { [...document.getElementById(id).options].forEach(o => { o.selected = values.includes(o.value); }); };
            sync('taskFilterProject', taskFilters.projects);
            sync('taskFilterUnit', taskFilters.units);
            sync('taskFilterSeverity', taskFilters.severities);
            sync('taskFilterStatus', taskFilters.statuses);
            sync('taskFilterPerson', taskFilters.people);
            document.getElementById('taskFilterOverdueOnly').checked = taskFilters.overdueOnly;
            document.getElementById('taskFilterDueSoonOnly').checked = taskFilters.dueSoonOnly;
            document.getElementById('taskFilterSearch').value = taskFilters.search;
        }

        function readTaskFiltersFromForm() {
            const vals = id => [...document.getElementById(id).selectedOptions].map(o => o.value);
            taskFilters.projects = vals('taskFilterProject');
            taskFilters.units = vals('taskFilterUnit');
            taskFilters.severities = vals('taskFilterSeverity');
            taskFilters.statuses = vals('taskFilterStatus');
            taskFilters.people = vals('taskFilterPerson');
            taskFilters.overdueOnly = document.getElementById('taskFilterOverdueOnly').checked;
            taskFilters.dueSoonOnly = document.getElementById('taskFilterDueSoonOnly').checked;
            taskFilters.dateFrom = jalaliInputToIso(document.getElementById('taskFilterDateFrom').value) || null;
            taskFilters.dateTo = jalaliInputToIso(document.getElementById('taskFilterDateTo').value) || null;
            taskFilters.search = document.getElementById('taskFilterSearch').value;
        }

        function clearAllTaskFilters() {
            taskFilters = { projects: [], units: [], severities: [], statuses: [], people: [], overdueOnly: false, dueSoonOnly: false, dateFrom: null, dateTo: null, search: '' };
            document.getElementById('taskFilterDateFrom').value = '';
            document.getElementById('taskFilterDateTo').value = '';
            syncTaskFilterSelectsFromState();
            renderAllTaskSections();
        }

        function renderActiveTaskFilterChips() {
            const el = document.getElementById('taskActiveFilterChips');
            const chips = [];
            taskFilters.projects.forEach(v => chips.push({ text: '📁 ' + v, remove: () => { taskFilters.projects = taskFilters.projects.filter(x => x !== v); } }));
            taskFilters.units.forEach(v => chips.push({ text: '🏷 ' + v, remove: () => { taskFilters.units = taskFilters.units.filter(x => x !== v); } }));
            taskFilters.severities.forEach(v => chips.push({ text: '⚡ ' + v, remove: () => { taskFilters.severities = taskFilters.severities.filter(x => x !== v); } }));
            taskFilters.statuses.forEach(v => chips.push({ text: '● ' + v, remove: () => { taskFilters.statuses = taskFilters.statuses.filter(x => x !== v); } }));
            taskFilters.people.forEach(v => chips.push({ text: '👤 ' + v, remove: () => { taskFilters.people = taskFilters.people.filter(x => x !== v); } }));
            if (taskFilters.overdueOnly) chips.push({ text: 'فقط معوق', remove: () => { taskFilters.overdueOnly = false; } });
            if (taskFilters.dueSoonOnly) chips.push({ text: 'فقط نزدیک سررسید', remove: () => { taskFilters.dueSoonOnly = false; } });
            if (taskFilters.dateFrom) chips.push({ text: 'از ' + formatJalali(taskFilters.dateFrom), remove: () => { taskFilters.dateFrom = null; document.getElementById('taskFilterDateFrom').value = ''; } });
            if (taskFilters.dateTo) chips.push({ text: 'تا ' + formatJalali(taskFilters.dateTo), remove: () => { taskFilters.dateTo = null; document.getElementById('taskFilterDateTo').value = ''; } });
            if (taskFilters.search.trim()) chips.push({ text: '🔍 ' + taskFilters.search.trim(), remove: () => { taskFilters.search = ''; document.getElementById('taskFilterSearch').value = ''; } });

            if (!chips.length) { el.innerHTML = '<span class="text-slate-400">فیلتری فعال نیست.</span>'; return; }
            el.innerHTML = chips.map((c, idx) => `<span class="bg-slate-100 text-slate-700 px-2 py-1 rounded-full flex items-center gap-1">${esc(c.text)}<button type="button" data-idx="${idx}" class="task-chip-remove font-bold text-slate-400 hover:text-red-600">×</button></span>`).join('');
            el.querySelectorAll('.task-chip-remove').forEach((btn, idx) => btn.addEventListener('click', () => { chips[idx].remove(); syncTaskFilterSelectsFromState(); renderAllTaskSections(); }));
        }

        // Per-case Quick Win / اقدام میان‌مدت progress — ported from the
        // now-retired پیگیری اجرای اقدامات زودبازده page, but no longer a
        // manual-entry form: progress and status are rolled up from the
        // case's own tasks (computeCaseRollupFromTasks/
        // syncCaseStatusesFromTasks, run in loadTasksView), so this only
        // ever reads the result. It's still the only place a case's
        // actual realized value gets recorded once closed. Scoped to the
        // project filter only — a case's own progress isn't something a
        // task-attribute filter should hide. The task list itself lives
        // in the single flat table below (renderAllTasksTable) instead of
        // a nested table per case, and the full rolled-up schedule
        // timeline lives on Overview (renderActionTimelines).
        function renderCaseProgressCards() {
            const container = document.getElementById('taskProjectCardsBody');
            const isAdmin = currentProfile.role === 'admin';

            let cases = taskCasesCache;
            if (taskFilters.projects.length) cases = cases.filter(c => taskFilters.projects.includes(c.project_name));

            if (!cases.length) {
                container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">اقدام زودبازده یا میان‌مدتی برای نمایش نیست.</p>';
                return;
            }

            const today = new Date(); today.setHours(0, 0, 0, 0);

            container.innerHTML = cases.map(dec => {
                const rollup = computeCaseRollupFromTasks(dec.id, allTasksRaw);
                const percent = rollup.percent;
                const responsible = dec.plan_responsible || dec.organization;

                const target = new Date(dec.execution_target_date || dec.plan_target_date);
                const daysLeft = Math.round((target - today) / 86400000);
                const isDone = dec.status === 'بسته‌شده';
                const isOverdue = !isDone && daysLeft < 0;

                const badge = isDone
                    ? '<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-xs font-bold">✅ تکمیل شده</span>'
                    : isOverdue
                        ? `<span class="bg-red-100 text-red-800 px-2 py-1 rounded-lg text-xs font-bold">⏰ ${toPersianDigits(Math.abs(daysLeft))} روز تأخیر</span>`
                        : `<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded-lg text-xs font-bold">${toPersianDigits(daysLeft)} روز باقی‌مانده</span>`;
                const barColor = isDone ? 'bg-emerald-500' : isOverdue ? 'bg-red-500' : 'bg-blue-900';
                const kindTag = dec.status === 'اقدام میان‌مدت'
                    ? '<span class="bg-blue-100 text-blue-900 text-[10px] font-bold px-2 py-0.5 rounded-full">🕒 اقدام میان‌مدت</span>'
                    : '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">🏆 اقدام زودبازده منتخب</span>';

                const taskSummary = rollup.hasTasks
                    ? `${toPersianDigits(rollup.doneCount)} از ${toPersianDigits(rollup.totalCount)} تسک انجام‌شده`
                    : 'هنوز تسکی برای این اقدام ثبت نشده';

                return `<div class="border rounded-2xl border-slate-200 p-4 space-y-3" data-case-id="${dec.id}">
                    <div class="flex justify-between items-center flex-wrap gap-2">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-bold text-blue-900">📁 ${esc(dec.project_name)}</h4>
                                ${kindTag}
                            </div>
                            <p class="text-xs text-slate-500">${esc(dec.title)} (${esc(dec.organization)})</p>
                        </div>
                        ${badge}
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2.5">
                        <div class="${barColor} h-2.5 rounded-full" style="width:${Math.min(percent, 100)}%"></div>
                    </div>
                    <p class="text-xs text-slate-500">پیشرفت (برآمده از زمان‌بندی تسک‌ها): <b>${toPersianDigits(percent)}٪</b> — ${taskSummary} — 👤 مسئول: <b>${esc(responsible)}</b> — مهلت: ${formatJalali(dec.execution_target_date || dec.plan_target_date)}</p>

                    ${isAdmin && isDone ? `
                    <div class="no-print pt-3 border-t space-y-2 bg-emerald-50 -mx-4 px-4 pb-4 rounded-b-2xl">
                        <p class="text-xs font-bold text-emerald-800">🏁 نتیجه نهایی و ارزش محقق‌شده</p>
                        <textarea class="actual-result-input w-full border rounded-lg p-2 text-xs" rows="2" placeholder="نتیجه واقعی این اقدام زودبازده چه بود؟">${esc(dec.actual_result || '')}</textarea>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-0.5">صرفه‌جویی زمانی واقعی (روز)</label>
                                <input class="actual-days-input w-full border rounded-lg p-2 text-xs" type="number" step="any" value="${dec.actual_value_json?.days_saved ?? dec.impact_delay_days ?? ''}">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-500 mb-0.5">صرفه‌جویی مالی واقعی (ریال)</label>
                                <input class="actual-cost-input w-full border rounded-lg p-2 text-xs" type="number" step="any" value="${dec.actual_value_json?.cost_avoided_rial ?? dec.impact_cost_avoided ?? ''}">
                            </div>
                        </div>
                        <button type="button" class="save-actual-value-btn w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 font-bold text-xs">ثبت نتیجه نهایی</button>
                    </div>` : ''}
                </div>`;
            }).join('');

            container.querySelectorAll('[data-case-id]').forEach(cardEl => {
                const caseId = Number(cardEl.dataset.caseId);
                if (isAdmin) {
                    const saveActualBtn = cardEl.querySelector('.save-actual-value-btn');
                    if (saveActualBtn) {
                        saveActualBtn.addEventListener('click', () => {
                            saveActualValue(
                                caseId,
                                cardEl.querySelector('.actual-result-input').value.trim(),
                                cardEl.querySelector('.actual-days-input').value,
                                cardEl.querySelector('.actual-cost-input').value,
                            );
                        });
                    }
                }
            });
        }

        // One flat, searchable table of every filtered task — replaces the
        // old nested per-case tables so "find a task" doesn't depend on
        // first finding the right project's card. The title (struck
        // through once done) is the primary line; everything else that
        // used to need its own column — project, related Quick Win,
        // responsible person, unit — sits as a single muted line under it,
        // since only status and due date need to be independently
        // scannable at a glance.
        function renderAllTasksTable(filtered) {
            const container = document.getElementById('allTasksTableBody');
            document.getElementById('allTasksTableCount').textContent = `${toPersianDigits(filtered.length)} تسک`;

            if (!filtered.length) {
                container.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">هیچ تسکی مطابق فیلتر فعلی یافت نشد.</td></tr>';
                return;
            }

            const sorted = filtered.slice().sort((a, b) => {
                const pa = a.project_name || '', pb = b.project_name || '';
                if (pa !== pb) return pa < pb ? -1 : 1;
                return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1;
            });
            container.innerHTML = sorted.map((t, idx) => {
                const isDone = t.task_status === 'انجام‌شده';
                const overdue = isTaskOverdue(t);
                const statusCls = isDone ? 'bg-emerald-100 text-emerald-800' : overdue ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700';
                const statusText = isDone ? '✅ انجام‌شده' : overdue ? `⏰ ${toPersianDigits(taskOverdueDays(t))} روز تأخیر` : esc(t.task_status);
                const metaParts = [
                    t.project_name ? `📁 ${esc(t.project_name)}` : '',
                    t.case_title ? `🎯 ${esc(t.case_title)}` : '',
                    t.responsible_name ? `👤 ${esc(t.responsible_name)}` : '',
                    t.responsible_unit ? `🏷 ${esc(t.responsible_unit)}` : '',
                ].filter(Boolean).join('  ·  ');
                const newGroup = idx > 0 && sorted[idx - 1].project_name !== t.project_name;
                return `<tr class="task-table-row cursor-pointer hover:bg-slate-50 border-b border-slate-100 ${newGroup ? 'border-t-2 border-t-slate-300' : ''}" data-task-id="${t.id}">
                    <td class="p-2.5">
                        <p class="font-bold text-slate-800 ${isDone ? 'line-through text-slate-400' : ''}">${esc(t.title)}</p>
                        ${metaParts ? `<p class="text-[10px] text-slate-400 mt-0.5">${metaParts}</p>` : ''}
                    </td>
                    <td class="p-2.5 whitespace-nowrap">${aiSevBadge(t.severity)}</td>
                    <td class="p-2.5 text-xs text-slate-600 whitespace-nowrap">${t.due_date ? formatJalali(t.due_date) : '-'}</td>
                    <td class="p-2.5 whitespace-nowrap"><span class="px-1.5 py-0.5 rounded-md font-bold text-[11px] ${statusCls}">${statusText}</span></td>
                </tr>`;
            }).join('');
            container.querySelectorAll('.task-table-row').forEach(tr => tr.addEventListener('click', () => openTaskDrawer(Number(tr.dataset.taskId))));
        }

        function renderTaskKpis(filtered) {
            const total = filtered.length;
            const openTasks = filtered.filter(t => t.task_status !== 'انجام‌شده');
            const overdue = filtered.filter(isTaskOverdue);
            const critical = filtered.filter(t => t.severity === 'بحرانی' && t.task_status !== 'انجام‌شده');
            const dueSoon = filtered.filter(isTaskDueSoon);
            const avgAging = openTasks.length ? Math.round(openTasks.reduce((a, t) => a + taskAgeDays(t), 0) / openTasks.length) : 0;
            const doneCount = filtered.filter(t => t.task_status === 'انجام‌شده').length;
            const closureRate = total ? Math.round((doneCount / total) * 100) : 0;

            const cards = [
                { label: 'Total Tasks — کل تسک‌ها', value: toPersianDigits(total), icon: 'checklist', color: 'bg-slate-100 text-slate-700', onClick: () => document.getElementById('taskStatusDonut').scrollIntoView({ behavior: 'smooth' }) },
                { label: 'Open Tasks — تسک‌های باز', value: toPersianDigits(openTasks.length), icon: 'activity', color: 'bg-blue-100 text-blue-900', onClick: () => document.getElementById('taskStatusDonut').scrollIntoView({ behavior: 'smooth' }) },
                { label: 'Overdue Tasks — معوق', value: toPersianDigits(overdue.length), icon: 'alertTriangle', color: overdue.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700', onClick: () => { taskFilters.overdueOnly = true; taskActionTab = 'overdue'; syncTaskFilterSelectsFromState(); renderAllTaskSections(); document.getElementById('taskActionCenterBody').scrollIntoView({ behavior: 'smooth' }); } },
                { label: 'Critical Tasks — بحرانی', value: toPersianDigits(critical.length), icon: 'shield', color: critical.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700', onClick: () => { if (!taskFilters.severities.includes('بحرانی')) taskFilters.severities.push('بحرانی'); syncTaskFilterSelectsFromState(); renderAllTaskSections(); } },
                { label: 'Due Soon — نزدیک سررسید', value: toPersianDigits(dueSoon.length), icon: 'clock', color: 'bg-amber-100 text-amber-700', onClick: () => { taskFilters.dueSoonOnly = true; taskActionTab = 'dueSoon'; syncTaskFilterSelectsFromState(); renderAllTaskSections(); document.getElementById('taskActionCenterBody').scrollIntoView({ behavior: 'smooth' }); } },
                { label: 'Average Aging — میانگین سن', value: toPersianDigits(avgAging) + ' روز', icon: 'gauge', color: 'bg-slate-100 text-slate-700', onClick: () => document.getElementById('taskAgingChart').scrollIntoView({ behavior: 'smooth' }) },
                { label: 'Closure Rate — نرخ بسته‌شدن', value: toPersianDigits(closureRate) + '٪', icon: 'checkCircle', color: 'bg-emerald-100 text-emerald-700', onClick: () => document.getElementById('taskTrendChart').scrollIntoView({ behavior: 'smooth' }) },
            ];

            const row = document.getElementById('taskKpiRow');
            row.innerHTML = cards.map((c, idx) => `
                <button type="button" class="task-kpi-card text-right bg-white rounded-2xl shadow-sm border p-3 space-y-1.5 hover:shadow-md hover:-translate-y-0.5 transition" data-idx="${idx}" title="${esc(c.label)}">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center ${c.color}">${iconSvg(c.icon, 'w-4 h-4')}</div>
                    <p class="text-lg font-extrabold text-slate-800 leading-tight">${c.value}</p>
                    <p class="text-[10px] text-slate-500 leading-snug">${esc(c.label)}</p>
                </button>`).join('');
            row.querySelectorAll('.task-kpi-card').forEach((btn, idx) => btn.addEventListener('click', cards[idx].onClick));
        }

        // Every click-to-filter row/bar on this page (status, project, person,
        // severity, unit) should toggle: click once to add the filter, click
        // the same one again to remove it. A single shared helper keeps that
        // behavior consistent instead of each chart re-implementing its own
        // (previously inconsistent — some push-only, one outright replaced
        // the whole array) add logic.
        function toggleTaskFilter(dim, value) {
            const arr = taskFilters[dim];
            const idx = arr.indexOf(value);
            if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
            syncTaskFilterSelectsFromState();
            renderAllTaskSections();
        }

        function renderTaskStatsPanel(filtered) {
            const tabs = [['status', 'وضعیت'], ['project', 'پروژه'], ['person', 'نفر']];
            const tabBtnsEl = document.getElementById('taskStatsTabBtns');
            tabBtnsEl.innerHTML = tabs.map(([key, label]) => `<button type="button" data-tab="${key}" class="px-2.5 py-1 rounded-lg border ${taskStatsTab === key ? 'bg-slate-800 text-white' : 'text-slate-500'}">${label}</button>`).join('');
            tabBtnsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { taskStatsTab = b.dataset.tab; renderTaskStatsPanel(computeFilteredTasks()); }));

            const table = document.getElementById('taskStatsTable');
            const total = filtered.length;

            if (taskStatsTab === 'status') {
                const totalOverdue = filtered.filter(isTaskOverdue).length;
                const rows = TASK_STATUSES.map(s => {
                    const rows = filtered.filter(t => t.task_status === s);
                    const pct = total ? Math.round(rows.length / total * 100) : 0;
                    const overdue = rows.filter(isTaskOverdue).length;
                    const active = taskFilters.statuses.includes(s);
                    return `<tr class="border-b last:border-0 hover:bg-slate-50 cursor-pointer task-stats-row ${active ? 'bg-blue-50' : ''}" data-dim="statuses" data-value="${esc(s)}">
                        <td class="p-2.5"><span class="inline-block w-2 h-2 rounded-full ml-1.5" style="background:${TASK_STATUS_COLOR[s]}"></span>${esc(s)}${active ? ' ✓' : ''}</td>
                        <td class="p-2.5 font-bold">${toPersianDigits(rows.length)}</td>
                        <td class="p-2.5">${toPersianDigits(pct)}٪</td>
                        <td class="p-2.5 ${overdue ? 'text-red-600 font-bold' : 'text-slate-400'}">${toPersianDigits(overdue)}</td>
                    </tr>`;
                }).join('');
                table.innerHTML = `
                    <thead class="bg-slate-100 text-slate-600"><tr><th class="p-2.5">وضعیت</th><th class="p-2.5">تعداد</th><th class="p-2.5">درصد</th><th class="p-2.5">معوق</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr class="bg-slate-50 font-bold border-t"><td class="p-2.5">جمع کل</td><td class="p-2.5">${toPersianDigits(total)}</td><td class="p-2.5">۱۰۰٪</td><td class="p-2.5">${toPersianDigits(totalOverdue)}</td></tr></tfoot>`;
            } else {
                const isProject = taskStatsTab === 'project';
                const field = isProject ? 'project_name' : 'responsible_name';
                const filterDim = isProject ? 'projects' : 'people';
                const label = isProject ? 'پروژه' : 'مسئول';
                const groups = {};
                filtered.forEach(t => { const k = t[field] || (isProject ? '-' : 'تخصیص‌نشده'); (groups[k] = groups[k] || []).push(t); });
                const groupRows = Object.entries(groups).map(([name, rows]) => {
                    const open = rows.filter(t => t.task_status !== 'انجام‌شده').length;
                    const overdue = rows.filter(isTaskOverdue).length;
                    const critical = rows.filter(t => t.severity === 'بحرانی' && t.task_status !== 'انجام‌شده').length;
                    const done = rows.filter(t => t.task_status === 'انجام‌شده').length;
                    const closureRate = rows.length ? Math.round(done / rows.length * 100) : 0;
                    return { name, total: rows.length, open, overdue, critical, closureRate };
                }).sort((a, b) => b.total - a.total);
                const totOpen = filtered.filter(t => t.task_status !== 'انجام‌شده').length;
                const totOverdue = filtered.filter(isTaskOverdue).length;
                const totCritical = filtered.filter(t => t.severity === 'بحرانی' && t.task_status !== 'انجام‌شده').length;
                const totDone = filtered.filter(t => t.task_status === 'انجام‌شده').length;
                const totClosure = total ? Math.round(totDone / total * 100) : 0;
                const rows = groupRows.map(r => {
                    const active = taskFilters[filterDim].includes(r.name);
                    return `<tr class="border-b last:border-0 hover:bg-slate-50 cursor-pointer task-stats-row ${active ? 'bg-blue-50' : ''}" data-dim="${filterDim}" data-value="${esc(r.name)}">
                        <td class="p-2.5 font-bold">${esc(r.name)}${active ? ' ✓' : ''}</td>
                        <td class="p-2.5">${toPersianDigits(r.total)}</td>
                        <td class="p-2.5">${toPersianDigits(r.open)}</td>
                        <td class="p-2.5 ${r.overdue ? 'text-red-600 font-bold' : 'text-slate-400'}">${toPersianDigits(r.overdue)}</td>
                        <td class="p-2.5 ${r.critical ? 'text-red-600 font-bold' : 'text-slate-400'}">${toPersianDigits(r.critical)}</td>
                        <td class="p-2.5">${toPersianDigits(r.closureRate)}٪</td>
                    </tr>`;
                }).join('');
                table.innerHTML = `
                    <thead class="bg-slate-100 text-slate-600"><tr><th class="p-2.5">${label}</th><th class="p-2.5">کل</th><th class="p-2.5">باز</th><th class="p-2.5">معوق</th><th class="p-2.5">بحرانی</th><th class="p-2.5">نرخ بسته‌شدن</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr class="bg-slate-50 font-bold border-t"><td class="p-2.5">جمع کل</td><td class="p-2.5">${toPersianDigits(total)}</td><td class="p-2.5">${toPersianDigits(totOpen)}</td><td class="p-2.5">${toPersianDigits(totOverdue)}</td><td class="p-2.5">${toPersianDigits(totCritical)}</td><td class="p-2.5">${toPersianDigits(totClosure)}٪</td></tr></tfoot>`;
            }
            table.querySelectorAll('.task-stats-row').forEach(row => row.addEventListener('click', () => toggleTaskFilter(row.dataset.dim, row.dataset.value)));
        }

        function renderTaskSeverityChart(filtered) {
            const counts = TASK_SEVERITIES.map(s => filtered.filter(t => t.severity === s).length);
            if (taskCharts.taskSeverityChart) taskCharts.taskSeverityChart.destroy();
            taskCharts.taskSeverityChart = new Chart(document.getElementById('taskSeverityChart').getContext('2d'), {
                type: 'bar',
                data: { labels: TASK_SEVERITIES, datasets: [{ data: counts, backgroundColor: TASK_SEVERITIES.map(s => AI_SEVERITY_STYLE[s].hex) }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    onClick: (evt, els) => { if (els.length) toggleTaskFilter('severities', TASK_SEVERITIES[els[0].index]); },
                    scales: { x: { min: 0, ticks: { stepSize: 1, precision: 0, callback: v => toPersianDigits(v) }, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } },
                    plugins: { legend: { display: false } },
                },
            });
        }

        function renderTaskAgingChart(filtered) {
            const open = filtered.filter(t => t.task_status !== 'انجام‌شده');
            const buckets = [
                { label: '۰-۷ روز', test: d => d <= 7 },
                { label: '۸-۱۴ روز', test: d => d >= 8 && d <= 14 },
                { label: '۱۵-۳۰ روز', test: d => d >= 15 && d <= 30 },
                { label: '۳۱-۶۰ روز', test: d => d >= 31 && d <= 60 },
                { label: '۶۱-۹۰ روز', test: d => d >= 61 && d <= 90 },
                { label: '+۹۰ روز', test: d => d > 90 },
            ];
            const ages = open.map(taskAgeDays);
            const counts = buckets.map(b => ages.filter(b.test).length);
            document.getElementById('taskOldestOpen').textContent = ages.length ? toPersianDigits(Math.max(...ages)) + ' روز' : '-';
            if (taskCharts.taskAgingChart) taskCharts.taskAgingChart.destroy();
            taskCharts.taskAgingChart = new Chart(document.getElementById('taskAgingChart').getContext('2d'), {
                type: 'bar',
                data: { labels: buckets.map(b => b.label), datasets: [{ data: counts, backgroundColor: buckets.map((b, i) => i >= 4 ? '#dc2626' : i >= 2 ? '#f59e0b' : '#3b82f6') }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, ticks: { stepSize: 1, precision: 0, callback: v => toPersianDigits(v) } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } },
            });
        }

        function renderTaskOverdueRadar(filtered) {
            const overdue = filtered.filter(isTaskOverdue).slice().sort((a, b) => taskOverdueDays(b) - taskOverdueDays(a));
            const el = document.getElementById('taskOverdueRadarList');
            if (!overdue.length) { el.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">هیچ تسک معوقی وجود ندارد. 🎉</p>'; return; }
            const dot = { 'بحرانی': '🔴', 'زیاد': '🟠', 'متوسط': '🟡', 'کم': '🟢' };
            el.innerHTML = overdue.map(t => `
                <div class="task-radar-row flex items-center justify-between gap-2 border rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer" data-task-id="${t.id}" title="${esc(t.title)} — ${esc(t.responsible_unit || '-')} / ${esc(t.responsible_name || '-')}">
                    <span class="flex items-center gap-1.5 min-w-0 text-xs"><span>${dot[t.severity] || '⚪'}</span><span class="font-bold truncate">${esc(t.title)}</span></span>
                    <span class="shrink-0 flex items-center gap-2 text-[10px] text-slate-500">
                        <span class="hidden sm:inline">${esc(t.responsible_unit || '-')}</span><span class="hidden sm:inline">${esc(t.responsible_name || '-')}</span>
                        <span class="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">${toPersianDigits(taskOverdueDays(t))} روز تأخیر</span>
                    </span>
                </div>`).join('');
            el.querySelectorAll('.task-radar-row').forEach(row => row.addEventListener('click', () => openTaskDrawer(Number(row.dataset.taskId))));
        }

        function renderTaskResponsibilityCharts(filtered) {
            const byUnit = {};
            filtered.forEach(t => { const u = t.responsible_unit || 'نامشخص'; byUnit[u] = (byUnit[u] || 0) + 1; });
            const unitEntries = Object.entries(byUnit).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (taskCharts.taskByUnitChart) taskCharts.taskByUnitChart.destroy();
            taskCharts.taskByUnitChart = new Chart(document.getElementById('taskByUnitChart').getContext('2d'), {
                type: 'bar',
                data: { labels: unitEntries.map(e => e[0]), datasets: [{ data: unitEntries.map(e => e[1]), backgroundColor: '#1e3a8a' }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    onClick: (evt, els) => { if (els.length) toggleTaskFilter('units', unitEntries[els[0].index][0]); },
                    scales: { x: { min: 0, ticks: { stepSize: 1, precision: 0, callback: v => toPersianDigits(v) }, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } },
                    plugins: { legend: { display: false } },
                },
            });

            const byPerson = {};
            filtered.forEach(t => { const p = t.responsible_name || 'تخصیص‌نشده'; byPerson[p] = (byPerson[p] || 0) + 1; });
            const personEntries = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (taskCharts.taskByPersonChart) taskCharts.taskByPersonChart.destroy();
            taskCharts.taskByPersonChart = new Chart(document.getElementById('taskByPersonChart').getContext('2d'), {
                type: 'bar',
                data: { labels: personEntries.map(e => e[0]), datasets: [{ data: personEntries.map(e => e[1]), backgroundColor: '#7c3aed' }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    scales: { x: { min: 0, ticks: { stepSize: 1, precision: 0, callback: v => toPersianDigits(v) }, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } },
                    plugins: { legend: { display: false } },
                },
            });
        }

        function taskTrendBucketKey(iso, granularity) {
            const day = iso.slice(0, 10);
            if (granularity === 'daily') return { key: day, label: formatJalali(day) };
            if (granularity === 'weekly') {
                const d = new Date(day + 'T00:00:00Z');
                const dayOfWeek = d.getUTCDay();
                const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
                const mondayIso = monday.toISOString().slice(0, 10);
                return { key: mondayIso, label: formatJalali(mondayIso) };
            }
            const [y, m, dd] = day.split('-').map(Number);
            const [jy, jm] = gregorianToJalali(y, m, dd);
            if (granularity === 'quarterly') {
                const q = Math.ceil(jm / 3);
                return { key: `${jy}-Q${q}`, label: `فصل ${toPersianDigits(q)} - ${toPersianDigits(jy)}` };
            }
            return { key: `${jy}-${String(jm).padStart(2, '0')}`, label: `${toPersianDigits(jm)}/${toPersianDigits(jy)}` };
        }

        function renderTaskTrend(filtered) {
            const g = taskTrendGranularity;
            const bucketMap = {};
            const touch = (iso) => { const { key, label } = taskTrendBucketKey(iso, g); if (!bucketMap[key]) bucketMap[key] = { key, label, created: 0, closed: 0 }; return bucketMap[key]; };
            filtered.forEach(t => {
                touch(t.created_at).created++;
                if (t.completed_at) touch(t.completed_at).closed++;
            });
            const buckets = Object.values(bucketMap).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
            let running = 0;
            const netOpen = buckets.map(b => { running += b.created - b.closed; return running; });
            if (taskCharts.taskTrendChart) taskCharts.taskTrendChart.destroy();
            taskCharts.taskTrendChart = new Chart(document.getElementById('taskTrendChart').getContext('2d'), {
                type: 'line',
                data: {
                    labels: buckets.map(b => b.label),
                    datasets: [
                        { label: 'ایجادشده (Created)', data: buckets.map(b => b.created), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.1)', tension: .3 },
                        { label: 'بسته‌شده (Closed)', data: buckets.map(b => b.closed), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', tension: .3 },
                        { label: 'خالص باز (Net Open)', data: netOpen, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.08)', fill: true, tension: .3 },
                    ],
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, ticks: { precision: 0, callback: v => toPersianDigits(v) } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } },
            });
        }

        function renderTaskActionCenter(filtered) {
            const tabsEl = document.getElementById('taskActionTabs');
            const tabs = [['overdue', 'معوق'], ['dueSoon', 'نزدیک سررسید'], ['notStarted', 'شروع‌نشده']];
            tabsEl.innerHTML = tabs.map(([key, label]) => `<button type="button" data-tab="${key}" class="px-3 py-1.5 rounded-lg font-bold transition ${taskActionTab === key ? 'bg-white text-red-700' : 'hover:bg-white/10'}" ${taskActionTab === key ? '' : 'style="color:#fecaca;"'}>${label}</button>`).join('');
            tabsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { taskActionTab = b.dataset.tab; renderTaskActionCenter(computeFilteredTasks()); }));

            let rows;
            if (taskActionTab === 'overdue') rows = filtered.filter(isTaskOverdue).sort((a, b) => taskOverdueDays(b) - taskOverdueDays(a));
            else if (taskActionTab === 'dueSoon') rows = filtered.filter(isTaskDueSoon).sort((a, b) => (a.due_date || '') < (b.due_date || '') ? -1 : 1);
            else {
                const cutoff = new Date(Date.now() - TASK_NOT_STARTED_DAYS * 86400000).toISOString();
                rows = filtered.filter(t => t.task_status === 'باز' && t.created_at < cutoff);
            }

            const body = document.getElementById('taskActionCenterBody');
            if (!rows.length) { body.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">موردی برای نمایش نیست.</p>'; return; }
            body.innerHTML = rows.slice(0, 30).map(t => `
                <div class="flex items-center justify-between gap-2 border-b py-1.5 text-xs flex-wrap">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-slate-400 shrink-0">#${toPersianDigits(t.id)}</span>
                        <span class="font-bold truncate">${esc(t.title)}</span>
                        ${taskIsEscalated(t) ? '<span class="bg-red-600 text-[#ffffff] text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0">ESCALATED</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                        <span>${esc(t.project_name || '-')}</span>${aiSevBadge(t.severity)}<span>${esc(t.responsible_name || '-')}</span>
                        <span>${t.due_date ? formatJalali(t.due_date) : '-'}</span>
                        <span class="task-action-view-btn text-blue-900 font-bold cursor-pointer" data-task-id="${t.id}">مشاهده →</span>
                    </div>
                </div>`).join('');
            body.querySelectorAll('.task-action-view-btn').forEach(b => b.addEventListener('click', () => openTaskDrawer(Number(b.dataset.taskId))));
        }

        function renderTaskAiInsight(filtered) {
            const el = document.getElementById('taskAiInsightList');
            if (!filtered.length) { el.innerHTML = '<p class="text-xs" style="color:#bfdbfe;">داده کافی برای تحلیل وجود ندارد.</p>'; return; }
            const insights = [];
            const byUnit = {};
            filtered.forEach(t => { const u = t.responsible_unit || 'نامشخص'; byUnit[u] = (byUnit[u] || 0) + 1; });
            const topUnit = Object.entries(byUnit).sort((a, b) => b[1] - a[1])[0];
            if (topUnit) {
                const pct = toPersianDigits(Math.round(topUnit[1] / filtered.length * 100));
                insights.push(topUnit[0] === 'نامشخص'
                    ? `📌 ${pct}٪ از تسک‌ها فاقد «واحد مسئول» ثبت‌شده‌اند («نامشخص» یعنی این فیلد هنگام ثبت تسک خالی مانده، نه یک واحد واقعی). برای رفع: در جدول «کل تسک‌ها» روی تسک موردنظر کلیک کنید، از پنل جزئیات فیلد «واحد مسئول» را تکمیل کنید و «ذخیره تغییرات» را بزنید.`
                    : `📌 ${pct}٪ از تسک‌های ثبت‌شده مربوط به واحد «${esc(topUnit[0])}» است.`);
            }

            const criticalOverdue = filtered.filter(t => t.severity === 'بحرانی' && isTaskOverdue(t));
            if (criticalOverdue.length) insights.push(`🚨 ${toPersianDigits(criticalOverdue.length)} تسک بحرانی از موعد خود عبور کرده‌اند (حداکثر ${toPersianDigits(Math.max(...criticalOverdue.map(taskOverdueDays)))} روز تأخیر).`);

            const byProject = {};
            filtered.forEach(t => { (byProject[t.project_name] = byProject[t.project_name] || []).push(t); });
            const projectRates = Object.entries(byProject).map(([pn, rows]) => ({ pn, rate: rows.length ? rows.filter(r => r.task_status === 'انجام‌شده').length / rows.length : 0 }));
            if (projectRates.length > 1) {
                const worst = projectRates.slice().sort((a, b) => a.rate - b.rate)[0];
                insights.push(`📉 پروژه «${esc(worst.pn)}» با نرخ بسته‌شدن ${toPersianDigits(Math.round(worst.rate * 100))}٪ پایین‌ترین Closure Rate را در این مجموعه دارد.`);
            }

            const chronic = filtered.filter(t => t.task_status !== 'انجام‌شده' && taskAgeDays(t) > 30);
            if (chronic.length) insights.push(`⏳ ${toPersianDigits(chronic.length)} تسک بیش از ۳۰ روز است که باز مانده‌اند و نیاز به پیگیری جدی دارند.`);

            const escalatedCount = filtered.filter(taskIsEscalated).length;
            if (escalatedCount) insights.push(`⚠️ ${toPersianDigits(escalatedCount)} تسک شرایط Escalation را دارند و باید به سطح مدیریتی بالاتر ارجاع شوند.`);

            el.innerHTML = insights.length
                ? insights.slice(0, 5).map(t => `<div class="bg-white/10 rounded-lg px-3 py-2 text-xs text-[#ffffff]">${t}</div>`).join('')
                : '<p class="text-xs" style="color:#bfdbfe;">در وضعیت فعلی نکته قابل توجهی شناسایی نشد.</p>';
        }

        function renderAllTaskSections() {
            const filtered = computeFilteredTasks();
            renderActiveTaskFilterChips();
            renderTaskKpis(filtered);
            renderTaskActionCenter(filtered);
            renderAllTasksTable(filtered);
            renderCaseProgressCards();
            renderTaskStatsPanel(filtered);
            renderStatusDonut('taskStatusDonut', 'taskStatusDonutCenter', 'taskStatusLegend', TASK_STATUSES.map(s => ({ label: s, value: filtered.filter(t => t.task_status === s).length, color: TASK_STATUS_COLOR[s] })));
            renderTaskSeverityChart(filtered);
            renderTaskAgingChart(filtered);
            renderTaskOverdueRadar(filtered);
            renderTaskResponsibilityCharts(filtered);
            renderTaskTrend(filtered);
            renderTaskAiInsight(filtered);
        }

        function wireTaskStaticControls() {
            if (taskStaticControlsWired) return;
            taskStaticControlsWired = true;
            document.getElementById('tasksApplyFiltersBtn').addEventListener('click', () => { readTaskFiltersFromForm(); renderAllTaskSections(); });
            document.getElementById('tasksClearFiltersBtn').addEventListener('click', clearAllTaskFilters);
            document.getElementById('tasksRefreshBtn').addEventListener('click', loadTasksView);
            document.getElementById('tasksFilterToggleBtn').addEventListener('click', () => document.getElementById('taskFilterBox').classList.toggle('hidden'));
            document.getElementById('tasksPrintBtn').addEventListener('click', () => printPage());
            document.getElementById('tasksExportCsvBtn').addEventListener('click', () => exportTasksCsv(computeFilteredTasks()));
            document.getElementById('tasksNewBtn').addEventListener('click', () => openNewTaskModal());
            document.getElementById('newTaskCloseBtn').addEventListener('click', closeNewTaskModal);
            document.getElementById('newTaskModal').addEventListener('click', (e) => { if (e.target.id === 'newTaskModal') closeNewTaskModal(); });
            document.getElementById('newTaskSubmitBtn').addEventListener('click', submitNewTask);
            document.getElementById('newTaskProject').addEventListener('change', onNewTaskProjectChange);
            document.getElementById('taskDrawerOverlay').addEventListener('click', closeTaskDrawer);
            // Search applies live as the user types — unlike the dropdown
            // filters, which need an explicit "اعمال فیلتر" click.
            document.getElementById('taskFilterSearch').addEventListener('input', (e) => {
                taskFilters.search = e.target.value;
                renderAllTaskSections();
            });

            const granBtnsEl = document.getElementById('taskTrendGranularityBtns');
            const granOptions = [['daily', 'روزانه'], ['weekly', 'هفتگی'], ['monthly', 'ماهانه'], ['quarterly', 'فصلی']];
            granBtnsEl.innerHTML = granOptions.map(([key, label]) => `<button type="button" data-gran="${key}" class="px-2 py-1 rounded-lg border ${key === taskTrendGranularity ? 'bg-slate-800 text-white' : 'text-slate-500'}">${label}</button>`).join('');
            granBtnsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                taskTrendGranularity = b.dataset.gran;
                granBtnsEl.querySelectorAll('button').forEach(x => { x.className = 'px-2 py-1 rounded-lg border ' + (x.dataset.gran === taskTrendGranularity ? 'bg-slate-800 text-white' : 'text-slate-500'); });
                renderTaskTrend(computeFilteredTasks());
            }));
        }

        function renderNewTaskFormOptions() {
            document.getElementById('newTaskProject').innerHTML = '<option value="">-- انتخاب پروژه --</option>' + taskProjectsCache.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
            document.getElementById('newTaskUnit').innerHTML = '<option value="">-- انتخاب --</option>' + TASK_UNITS.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
            document.getElementById('newTaskSeverity').innerHTML = TASK_SEVERITIES.map(s => `<option value="${esc(s)}" ${s === 'متوسط' ? 'selected' : ''}>${esc(s)}</option>`).join('');
        }

        function onNewTaskProjectChange() {
            const pn = document.getElementById('newTaskProject').value;
            const respSel = document.getElementById('newTaskResponsible');
            const users = taskUsersByProject[pn] || [];
            respSel.innerHTML = '<option value="">-- انتخاب مسئول --</option>' + users.map(u => `<option value="${esc(personDisplayName(u))}|||${esc(u.email)}">${esc(personDisplayName(u))} — ${esc(u.organization)}</option>`).join('');
            // Attaching to an اقدام زودبازده/میان‌مدت is optional — a project
            // with none yet (or a task that just isn't part of one) still
            // gets a real تسک عمومی پروژه instead of being blocked entirely.
            const caseSel = document.getElementById('newTaskCase');
            const cases = taskCasesCache.filter(c => c.project_name === pn);
            caseSel.innerHTML = '<option value="">-- بدون اقدام مشخص (تسک عمومی پروژه) --</option>' + cases.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
        }

        function openNewTaskModal(prefillProjectName, prefillCaseId) {
            document.getElementById('newTaskTitle').value = '';
            document.getElementById('newTaskUnit').value = '';
            document.getElementById('newTaskStartDate').value = '';
            document.getElementById('newTaskDueDate').value = '';
            document.getElementById('newTaskProject').value = prefillProjectName || '';
            onNewTaskProjectChange();
            if (prefillCaseId) document.getElementById('newTaskCase').value = String(prefillCaseId);
            document.getElementById('newTaskModal').classList.remove('hidden');
        }
        function closeNewTaskModal() { document.getElementById('newTaskModal').classList.add('hidden'); }

        async function submitNewTask() {
            const caseIdRaw = document.getElementById('newTaskCase').value;
            const projectName = document.getElementById('newTaskProject').value;
            const title = document.getElementById('newTaskTitle').value.trim();
            const unit = document.getElementById('newTaskUnit').value;
            if (!projectName || !title) { alert('انتخاب پروژه و عنوان تسک الزامی است.'); return; }
            if (!unit) { alert('انتخاب «واحد مسئول» الزامی است تا تسک‌ها همیشه قابل دسته‌بندی باشند.'); return; }
            const [respName, respEmail] = (document.getElementById('newTaskResponsible').value || '').split('|||');
            await addQuickWinTask(
                caseIdRaw ? Number(caseIdRaw) : null, projectName, title, respName || '', respEmail || '',
                document.getElementById('newTaskStartDate').value.trim(),
                document.getElementById('newTaskDueDate').value.trim(),
                { severity: document.getElementById('newTaskSeverity').value, responsibleUnit: unit },
            );
            closeNewTaskModal();
        }

        function exportTasksCsv(filtered) {
            const headers = ['ID', 'Project', 'Case', 'Title', 'Unit', 'Severity', 'Status', 'Responsible', 'CreatedAt', 'StartDate', 'DueDate', 'CompletedAt'];
            const rows = filtered.map(t => [t.id, t.project_name || '', t.case_title || '', t.title, t.responsible_unit || '', t.severity || '', t.task_status, t.responsible_name || '', t.created_at || '', t.start_date || '', t.due_date || '', t.completed_at || '']);
            const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'tasks_export.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function openTaskDrawer(taskId) {
            currentDrawerTaskId = taskId;
            const task = allTasksRaw.find(t => t.id === taskId);
            if (!task) return;
            document.getElementById('taskDrawerOverlay').classList.remove('hidden');
            document.getElementById('taskDrawer').style.transform = 'translateX(0)';
            renderTaskDrawerContent(task);
        }

        function closeTaskDrawer() {
            document.getElementById('taskDrawer').style.transform = 'translateX(100%)';
            document.getElementById('taskDrawerOverlay').classList.add('hidden');
            currentDrawerTaskId = null;
        }

        function renderTaskDrawerContent(task) {
            const isAdmin = currentProfile.role === 'admin';
            const isOwner = !isAdmin && task.responsible_email === currentUser.email;
            const canEditCapa = isAdmin || isOwner;
            const overdue = isTaskOverdue(task);
            const isDone = task.task_status === 'انجام‌شده';
            const isPending = task.task_status === 'در انتظار تایید';

            // Admin-only responsible-person options for this task's project;
            // a task whose current مسئول no longer has project access still
            // keeps its own value selectable instead of silently losing it.
            const respCurrentValue = `${task.responsible_name}|||${task.responsible_email}`;
            const respOptions = (isAdmin ? (taskUsersByProject[task.project_name] || []) : [])
                .map(u => ({ value: `${personDisplayName(u)}|||${u.email}`, label: `${esc(personDisplayName(u))} — ${esc(u.organization)}` }));
            if (isAdmin && !respOptions.some(o => o.value === respCurrentValue)) {
                respOptions.push({ value: respCurrentValue, label: `${esc(task.responsible_name)} (مقدار قبلی)` });
            }

            const actionButtons = [];
            if (isOwner && !isDone && !isPending) actionButtons.push(['drawerSubmitBtn', 'bg-blue-900 hover:bg-blue-800', '📤 ثبت اقدام']);
            if (isAdmin && isPending) { actionButtons.push(['drawerApproveBtn', 'bg-emerald-600 hover:bg-emerald-500', '✅ تایید نهایی']); actionButtons.push(['drawerRejectBtn', 'bg-amber-600 hover:bg-amber-500', '↩️ بازگشت']); }
            if (isAdmin && !isDone && !isPending) actionButtons.push(['drawerDoneBtn', 'bg-emerald-600 hover:bg-emerald-500', 'انجام شد']);
            if (isAdmin && isDone) actionButtons.push(['drawerReopenBtn', 'bg-amber-600 hover:bg-amber-500', '↩️ بازگشت به انجام‌نشده']);
            if (isAdmin) actionButtons.push(['drawerDeleteBtn', 'bg-red-100 hover:bg-red-200 text-red-700', '🗑 حذف تسک']);

            document.getElementById('taskDrawerContent').innerHTML = `
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <p class="text-[10px] text-slate-400">#${toPersianDigits(task.id)} — ${esc(task.project_name || '-')}${task.case_title ? ` — ${esc(task.case_title)}` : ''}</p>
                        <h3 class="font-extrabold text-slate-800 leading-snug">${esc(task.title)}</h3>
                    </div>
                    <button type="button" id="taskDrawerCloseBtn" class="text-slate-400 hover:text-slate-700 text-xl leading-none shrink-0">&times;</button>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${task.severity ? aiSevBadge(task.severity) : ''}
                    <span class="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-lg">${esc(task.task_status)}</span>
                    ${overdue ? `<span class="bg-red-600 text-[#ffffff] text-[10px] font-bold px-2 py-0.5 rounded-lg">⏰ ${toPersianDigits(taskOverdueDays(task))} روز تأخیر</span>` : ''}
                    ${taskIsEscalated(task) ? '<span class="bg-red-100 text-red-700 text-[10px] font-extrabold px-2 py-0.5 rounded-lg">🚩 ESCALATED</span>' : ''}
                </div>

                <div class="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 rounded-xl p-3">
                    <p><b>واحد مسئول:</b> ${esc(task.responsible_unit || '-')}</p>
                    <p><b>مسئول پیگیری:</b> ${esc(task.responsible_name || '-')}</p>
                    <p><b>تاریخ ثبت:</b> ${formatJalali(task.created_at)}</p>
                    <p><b>سن تسک:</b> ${toPersianDigits(taskAgeDays(task))} روز</p>
                    <p><b>شروع:</b> ${task.start_date ? formatJalali(task.start_date) : '-'}</p>
                    <p><b>مهلت انجام:</b> ${task.due_date ? formatJalali(task.due_date) : '-'}</p>
                    <p><b>تاریخ انجام:</b> ${task.completed_at ? formatJalali(task.completed_at) : '-'}</p>
                </div>

                ${task.submitted_note ? `<div><p class="text-[10px] font-bold text-slate-500 mb-1">توضیح ثبت‌شده هنگام «ثبت اقدام»</p><p class="text-xs text-slate-700 leading-relaxed italic">📝 ${esc(task.submitted_note)}</p></div>` : ''}

                ${isAdmin ? `
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1">واحد مسئول</label><select id="drawerTaskUnit" class="w-full border rounded-lg p-2 bg-white"><option value="">-- انتخاب --</option>${TASK_UNITS.map(u => `<option value="${esc(u)}" ${u === task.responsible_unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1">شدت</label><select id="drawerTaskSeverity" class="w-full border rounded-lg p-2 bg-white">${TASK_SEVERITIES.map(s => `<option value="${esc(s)}" ${s === task.severity ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
                    <div class="col-span-2"><label class="block text-[10px] font-bold text-slate-500 mb-1">مسئول پیگیری</label><select id="drawerTaskResponsible" class="w-full border rounded-lg p-2 bg-white">${respOptions.map(o => `<option value="${esc(o.value)}" ${o.value === respCurrentValue ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1">شروع</label><input id="drawerTaskStartDate" data-jalali-picker type="text" dir="ltr" value="${esc(task.start_date ? formatJalali(task.start_date) : '')}" placeholder="۱۴۰۵/۰۶/۰۱" class="w-full border rounded-lg p-2 text-center"></div>
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1">مهلت انجام</label><input id="drawerTaskDueDate" data-jalali-picker type="text" dir="ltr" value="${esc(task.due_date ? formatJalali(task.due_date) : '')}" placeholder="۱۴۰۵/۰۶/۳۰" class="w-full border rounded-lg p-2 text-center"></div>
                </div>` : ''}

                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">توضیحات</label>
                    <textarea id="drawerDescription" rows="4" class="w-full border rounded-lg p-2 text-xs" ${canEditCapa ? '' : 'readonly'}>${esc(task.description || '')}</textarea>
                </div>

                ${(canEditCapa || isAdmin) ? `
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <button type="button" id="drawerSaveFieldsBtn" class="bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg py-2">ذخیره تغییرات</button>
                    <button type="button" id="drawerEscalateBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg py-2">ثبت ارجاع (Escalate)</button>
                </div>` : '<p class="text-[11px] text-slate-400 text-center">فقط مسئول پیگیری یا ادمین می‌تواند این فیلدها را ویرایش کند.</p>'}

                ${actionButtons.length ? `<div class="grid grid-cols-2 gap-2 text-xs pt-2 border-t">${actionButtons.map(([id, cls, label]) => `<button type="button" id="${id}" class="${cls} text-white font-bold rounded-lg py-2">${label}</button>`).join('')}</div>` : ''}
            `;

            document.querySelectorAll('#taskDrawerContent [data-jalali-picker]').forEach(el => attachJalaliDatePicker(el));
            document.getElementById('taskDrawerCloseBtn').addEventListener('click', closeTaskDrawer);
            if (canEditCapa || isAdmin) {
                document.getElementById('drawerSaveFieldsBtn').addEventListener('click', () => saveTaskDrawerFields(task.id));
                document.getElementById('drawerEscalateBtn').addEventListener('click', () => escalateTaskFromDrawer(task.id));
            }
            const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => fn(task.id).then(closeTaskDrawer)); };
            wire('drawerSubmitBtn', submitQuickWinTask);
            wire('drawerApproveBtn', completeQuickWinTask);
            wire('drawerDoneBtn', completeQuickWinTask);
            wire('drawerRejectBtn', rejectQuickWinTask);
            wire('drawerReopenBtn', reopenQuickWinTask);
            const deleteBtn = document.getElementById('drawerDeleteBtn');
            if (deleteBtn) deleteBtn.addEventListener('click', () => { if (confirm(`آیا از حذف تسک «${task.title}» مطمئنید؟`)) deleteQuickWinTask(task.id).then(closeTaskDrawer); });
        }

        async function saveTaskDrawerFields(taskId) {
            const task = allTasksRaw.find(t => t.id === taskId);
            const isAdmin = currentProfile.role === 'admin';
            const patch = {
                description: document.getElementById('drawerDescription').value.trim() || null,
            };
            if (isAdmin) {
                patch.responsible_unit = document.getElementById('drawerTaskUnit').value || null;
                patch.severity = document.getElementById('drawerTaskSeverity').value;
                const [respName, respEmail] = (document.getElementById('drawerTaskResponsible').value || '').split('|||');
                const startIso = jalaliInputToIso(document.getElementById('drawerTaskStartDate').value);
                const dueIso = jalaliInputToIso(document.getElementById('drawerTaskDueDate').value);
                if (!respName || !respEmail || !startIso || !dueIso) {
                    alert('مسئول پیگیری، تاریخ شروع و مهلت انجام الزامی‌اند.');
                    return;
                }
                if (startIso > dueIso) { alert('تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.'); return; }
                patch.responsible_name = respName;
                patch.responsible_email = respEmail;
                patch.start_date = startIso;
                patch.due_date = dueIso;
            }
            const { error } = await _supabase.from('tm_case_updates').update(patch).eq('id', taskId);
            if (error) { alert('خطا در ذخیره: ' + error.message); return; }
            Object.assign(task, patch);
            renderTaskDrawerContent(task);
            loadTasksView();
        }

        async function escalateTaskFromDrawer(taskId) {
            const target = prompt('ارجاع به چه سطحی؟ (مثال: مدیر پروژه / PMO / مدیر طرح / کمیته راهبری)', 'PMO');
            if (!target) return;
            const task = allTasksRaw.find(t => t.id === taskId);
            const newNote = [`🚩 ارجاع به ${target} — ${todayJalali()}`, task.description || ''].filter(Boolean).join('\n');
            const { error } = await _supabase.from('tm_case_updates').update({ description: newNote }).eq('id', taskId);
            if (error) { alert('خطا در ثبت ارجاع: ' + error.message); return; }
            task.description = newNote;
            renderTaskDrawerContent(task);
            loadTasksView();
        }


        // پیگیری موانع پروژه‌ها (PROJECT ISSUE TRACKING)
        // ============================================================
        // A calendar/KPI/report surface over TWO sources, not a second
        // task system: this module's own project_issues rows (reportable
        // by any project member, unlike admin-only task creation — see
        // tasksNewBtn gating) UNIONED with پایش اقدامات's existing
        // case_updates (kind='task') rows that carry a due_date — «آن
        // تسک‌ها به این بخش منتقل بشه» means read them here too, not copy
        // them into a new table (same "one source of truth, new lens"
        // precedent as the task tower's own comment about itself).
        // Projects and people are pulled from what already exists
        // (projects table, list_project_users RPC) — no separate
        // project/member registry like the ported reference build had.
        const PIT_SEVERITIES = ['کم', 'متوسط', 'زیاد', 'بحرانی'];
        const PIT_STATUSES = ['باز', 'در حال انجام', 'در انتظار تایید', 'انجام‌شده'];

        // «رنگبندی سامانه رصد مناسب بود از اونم می‌تونی استفاده کنی» — this
        // module's dark palette is lifted directly from the reference
        // build's own CSS custom properties (im-bg/im-panel/im-amber/
        // im-coral/im-mint/im-violet, …), not this app's light theme —
        // like the lifecycle module's always-dark orbit, it keeps one
        // deliberate identity regardless of the global light/dark toggle.
        const PIT_BG = '#0b1220', PIT_PANEL = '#141b2e', PIT_PANEL2 = '#1b2439';
        const PIT_LINE = 'rgba(200,206,219,.12)';
        const PIT_TEXT = '#edeff5', PIT_MUTED = '#8b93a7', PIT_MUTED2 = '#c8cedb';
        const PIT_AMBER = '#f5b248', PIT_CORAL = '#e85d4e', PIT_MINT = '#4ade9e', PIT_VIOLET = '#8b7cf6';
        const PIT_RED = PIT_CORAL, PIT_GREEN = PIT_MINT;
        const PIT_STATUS_COLOR = { 'باز': PIT_VIOLET, 'در حال انجام': PIT_AMBER, 'در انتظار تایید': PIT_MUTED2, 'انجام‌شده': PIT_MINT };
        const PIT_SEVERITY_COLOR = { 'کم': PIT_MUTED2, 'متوسط': PIT_AMBER, 'زیاد': '#ff9d6e', 'بحرانی': PIT_CORAL };
        // «رنگ مانع و تسک رو توش عوض کن» — the calendar's day-cell badge
        // used to collapse every item on a day into one merged
        // "worst status" pill, so a موانع-only day and a تسک-only day
        // looked identical. These two are a separate color CHANNEL from
        // status/severity above (kept out of the amber/coral/mint family
        // those already own) so a pill's fill always answers "task or
        // obstacle?" on its own, independent of whatever urgency ring
        // pitCalDayBadges layers on top of it.
        const PIT_ISSUE_COLOR = '#f472b6', PIT_TASK_COLOR = '#60a5fa';
        const PIT_SOURCE_COLOR = { issue: PIT_ISSUE_COLOR, task: PIT_TASK_COLOR };
        const PIT_SOURCE_LABEL = { issue: 'مانع', task: 'تسک' };
        function pitGoodnessColor(g) { return g >= 66 ? PIT_MINT : g >= 33 ? PIT_AMBER : PIT_CORAL; }

        let pitState = {
            projects: [],
            usersByProject: {},
            issues: [],
            tasks: [],
            isAdmin: false,
            canReport: false,
            activeTab: 'calendar',
            calYear: null,
            calMonth: null,
            selectedDate: null,
            editor: null,
            detailItem: null,
            filters: { project: '', responsible: '', status: '', severity: '', source: '' },
        };

        async function loadIssueTrackingView() {
            pitState.isAdmin = currentProfile.role === 'admin';
            const { data: projects } = await _supabase.from('tm_projects').select('*').order('name');
            pitState.projects = (projects || []).filter(p => p.is_guide || pitState.isAdmin || myProjectAccess.some(a => a.project_name === p.name));
            pitState.canReport = pitState.isAdmin || myProjectAccess.length > 0;

            const [{ data: issuesData, error: issuesErr }, { data: tasksData }] = await Promise.all([
                _supabase.from('tm_project_issues').select('*').order('due_date'),
                _supabase.from('tm_case_updates').select('*').eq('kind', 'task').not('due_date', 'is', null).order('due_date'),
            ]);
            if (issuesErr) { document.getElementById('pitBody').innerHTML = lcEmptyStateHtml('جدول موانع پروژه هنوز ایجاد نشده — migration مربوطه را روی Supabase اجرا کنید.'); return; }
            pitState.issues = issuesData || [];
            pitState.tasks = tasksData || [];

            const uniqueProjectNames = [...new Set(pitState.projects.map(p => p.name))];
            const entries = await Promise.all(uniqueProjectNames.map(async pn => {
                const { data } = await _supabase.rpc('tm_list_project_users', { p_project_name: pn });
                return [pn, data || []];
            }));
            pitState.usersByProject = {};
            entries.forEach(([pn, users]) => { pitState.usersByProject[pn] = users; });

            if (pitState.calYear == null) {
                const today = new Date();
                const [jy, jm] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
                pitState.calYear = jy; pitState.calMonth = jm;
            }
            pitRenderAll();
        }

        // One shared shape for a project_issues row or a case_updates task
        // row, so the calendar/KPIs/reports never need to branch on which
        // table something came from — only the status-action buttons do
        // (they call back into the source-specific update function).
        function pitUnifiedItems() {
            const fromIssues = pitState.issues.map(r => ({
                _source: 'issue', id: r.id, project_name: r.project_name, title: r.title, description: r.description,
                responsible_name: r.responsible_name, responsible_email: r.responsible_email,
                severity: r.severity, status: r.status, due_date: r.due_date,
                created_at: r.created_at, completed_at: r.completed_at, submitted_at: r.submitted_at, submitted_note: r.submitted_note,
                created_by: r.created_by, _raw: r,
            }));
            const fromTasks = pitState.tasks.map(r => ({
                _source: 'task', id: r.id, project_name: r.project_name, title: r.title, description: r.submitted_note || null,
                responsible_name: r.responsible_name, responsible_email: r.responsible_email,
                severity: r.severity || 'متوسط', status: r.task_status, due_date: r.due_date,
                created_at: r.created_at, completed_at: r.completed_at, submitted_at: r.submitted_at, submitted_note: r.submitted_note,
                created_by: r.created_by, _raw: r,
            }));
            return [...fromIssues, ...fromTasks];
        }

        function pitIsOverdue(item) {
            return item.status !== 'انجام‌شده' && !!item.due_date && item.due_date < new Date().toISOString().slice(0, 10);
        }
        function pitDaysUntilDue(item) {
            if (!item.due_date) return null;
            return Math.round((new Date(item.due_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
        }
        function pitItemsForDate(items, iso) {
            return items.filter(it => it.due_date === iso);
        }

        function pitKpis(items) {
            const todayIso = new Date().toISOString().slice(0, 10);
            const in7 = lcAddDays(todayIso, 7);
            const open = items.filter(it => it.status !== 'انجام‌شده');
            const overdue = open.filter(pitIsOverdue);
            const dueSoon = open.filter(it => !pitIsOverdue(it) && it.due_date && it.due_date <= in7);
            const critical = open.filter(it => it.severity === 'بحرانی');

            // Mirrors the reference build's computeIssueMetrics exactly:
            // on-time rate and closed ratio over ALL items (not just a
            // rolling window), average days-to-close, and a week-over-week
            // trend on the *count* of items closed — feeds the three
            // semi-gauges in pitKeyMetricsCardHtml.
            const closed = items.filter(it => it.status === 'انجام‌شده' && it.completed_at);
            const onTime = closed.filter(it => it.completed_at.slice(0, 10) <= it.due_date);
            const onTimeRate = closed.length ? Math.round(onTime.length / closed.length * 100) : 0;
            const closedRatio = items.length ? Math.round(closed.length / items.length * 100) : 0;
            const avgDays = closed.length
                ? closed.reduce((s, it) => s + Math.max(0, Math.round((new Date(it.completed_at) - new Date(it.created_at)) / 86400000)), 0) / closed.length
                : 0;
            const closedCountInWindow = (endIso, days) => {
                const start = lcAddDays(endIso, -days + 1);
                return closed.filter(it => { const d = it.completed_at.slice(0, 10); return d >= start && d <= endIso; }).length;
            };
            const lastWeek = closedCountInWindow(todayIso, 7);
            const prevWeek = closedCountInWindow(lcAddDays(todayIso, -7), 7);
            const trendClosedPct = prevWeek ? Math.round((lastWeek - prevWeek) / prevWeek * 100) : (lastWeek > 0 ? 100 : 0);

            return {
                total: items.length, open: open.length, overdue: overdue.length, dueSoon: dueSoon.length, critical: critical.length,
                onTimeRate, closedRatio, avgDays, trendClosedPct,
            };
        }

        // «رینگ شمارش‌معکوس مهلت» — this module's one signature visual:
        // a thin ring whose fill/colour encode urgency (indigo -> amber
        // inside 3 days -> red once overdue), with the exact day count in
        // the centre — reused at both the small size (calendar day cells,
        // list rows) and the larger size (detail panel).
        function pitCountdownBadge(item, size) {
            size = size || 40;
            const r = size / 2 - 3, cx = size / 2, cy = size / 2;
            const circumference = 2 * Math.PI * r;
            const fontSize = size <= 28 ? 9.5 : 12.5;
            if (item.status === 'انجام‌شده') {
                return `<div class="pit-ring" style="width:${size}px;height:${size}px;">
                    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PIT_MINT}" stroke-width="3"/>
                    </svg>
                    <span class="pit-ring-label" style="color:${PIT_MINT}; font-size:${fontSize}px;">✓</span>
                </div>`;
            }
            const days = pitDaysUntilDue(item);
            const overdue = days < 0;
            const color = overdue ? PIT_CORAL : days <= 3 ? PIT_AMBER : PIT_VIOLET;
            const pct = overdue ? 100 : Math.max(8, 100 - Math.min(days, 30) / 30 * 100);
            const dash = circumference * pct / 100;
            return `<div class="pit-ring${overdue ? ' pit-pulse' : ''}" style="width:${size}px;height:${size}px;">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}33" stroke-width="3"/>
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash} ${circumference - dash}" transform="rotate(-90 ${cx} ${cy})"/>
                </svg>
                <span class="pit-ring-label" style="color:${color}; font-size:${fontSize}px;">${toPersianDigits(Math.abs(days))}</span>
            </div>`;
        }

        // «رنگ‌های متنوع و شیک» — semi-circle gauge (reference: Gauges.tsx
        // SemiGauge), a conic-gradient status donut with a legend
        // (StatusDonut), and severity bars (PriorityBars) — all three
        // ported 1:1 from the رصد reference build's own math/markup, just
        // as template strings instead of JSX.
        function pitSemiGaugeSvg(pct, color, centerText, size) {
            size = size || 96;
            const r = size / 2 - 13, cx = size / 2, cy = size / 2;
            const circ = Math.PI * r;
            const clamped = Math.max(0, Math.min(100, pct));
            const offset = circ * (1 - clamped / 100);
            return `<svg width="${size}" height="${size / 2 + 16}" viewBox="0 0 ${size} ${size / 2 + 16}">
                <path d="M 13 ${cy} A ${r} ${r} 0 0 1 ${size - 13} ${cy}" stroke="rgba(200,206,219,.14)" stroke-width="10" fill="none" stroke-linecap="round"/>
                <path d="M 13 ${cy} A ${r} ${r} 0 0 1 ${size - 13} ${cy}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
                <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="19" font-weight="900" fill="${color}" font-family="Vazirmatn, sans-serif">${centerText}</text>
            </svg>`;
        }

        function pitStatusDonutHtml(items) {
            const total = items.length;
            let acc = 0;
            const stops = PIT_STATUSES.map(s => {
                const count = items.filter(it => it.status === s).length;
                const pct = total ? count / total * 100 : 0;
                const start = acc; acc += pct;
                return `${PIT_STATUS_COLOR[s]} ${start}% ${acc}%`;
            }).join(', ');
            return `
            <div style="width:100px; margin:0 auto;">
                <div style="width:100px; height:100px; border-radius:50%; background:conic-gradient(${total ? stops : PIT_PANEL2 + ' 0% 100%'}); position:relative;">
                    <div style="position:absolute; inset:13px; border-radius:50%; background:${PIT_PANEL}; display:flex; align-items:center; justify-content:center; flex-direction:column;">
                        <span style="font-weight:900; font-size:16px; color:${PIT_TEXT};">${toPersianDigits(total)}</span>
                        <span style="font-size:9px; color:${PIT_MUTED};">کل</span>
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px 10px; justify-content:center; max-width:180px; margin:10px auto 0;">
                    ${PIT_STATUSES.map(s => `<span style="display:flex; align-items:center; gap:4px; font-size:10px; color:${PIT_MUTED2};"><span style="width:6px; height:6px; border-radius:50%; background:${PIT_STATUS_COLOR[s]}; display:inline-block;"></span>${s}</span>`).join('')}
                </div>
            </div>`;
        }

        function pitSeverityBarsHtml(items) {
            const open = items.filter(it => it.status !== 'انجام‌شده');
            const counts = PIT_SEVERITIES.map(s => open.filter(it => it.severity === s).length);
            const max = Math.max(1, ...counts);
            return PIT_SEVERITIES.map((s, i) => `
            <div style="margin-bottom:11px;">
                <div style="display:flex; justify-content:space-between; font-size:11.5px; margin-bottom:4px; color:${PIT_TEXT};">
                    <span>${s}</span><span style="font-weight:800;">${toPersianDigits(counts[i])}</span>
                </div>
                <div style="height:8px; border-radius:6px; background:${PIT_PANEL2}; overflow:hidden;">
                    <div style="height:100%; width:${counts[i] / max * 100}%; background:${PIT_SEVERITY_COLOR[s]}; border-radius:6px;"></div>
                </div>
            </div>`).join('');
        }

        function pitStyleBlock() {
            return `<style>
                #pitBody { color:${PIT_TEXT}; }
                .pit-ring { position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
                .pit-ring-label { position:absolute; font-weight:800; font-variant-numeric:tabular-nums; }
                .pit-pulse circle:last-child { animation: pit-pulse-ring 1.8s ease-in-out infinite; }
                @keyframes pit-pulse-ring { 0%, 100% { opacity:1; } 50% { opacity:.45; } }
                .pit-card { background:${PIT_PANEL}; border:1px solid ${PIT_LINE}; border-radius:1rem; }
                .pit-input { background:${PIT_PANEL2}; border:1px solid ${PIT_LINE}; color:${PIT_TEXT}; }
                .pit-input::placeholder { color:${PIT_MUTED}; }
                .pit-day-cell { transition: background .12s ease; cursor:pointer; }
                .pit-day-cell:hover { background:rgba(245,178,72,.08); }
                .pit-day-cell.pit-day-selected { background:rgba(245,178,72,.12); box-shadow: inset 0 0 0 1.5px ${PIT_AMBER}; }
                .pit-day-cell.pit-day-today .pit-day-num { background:${PIT_AMBER}; color:#1a1206; }
                .pit-day-num { display:inline-flex; align-items:center; justify-content:center; width:23px; height:23px; border-radius:9999px; font-weight:700; font-size:11px; color:${PIT_MUTED2}; }
                .pit-day-badge { font-size:9.5px; font-weight:800; line-height:1.5; padding:0 5px; border-radius:9999px; font-variant-numeric:tabular-nums; }
                .pit-badge-overdue { animation: pit-pulse-badge 1.8s ease-in-out infinite; }
                @keyframes pit-pulse-badge { 0%, 100% { filter:brightness(1); } 50% { filter:brightness(1.5); } }

                /* «تقویم شکل و شمایل تقویم نداره»: a تخته زیرتقویمی (backing
                   board) peeking out behind the month sheet, plus two
                   punched-hole spiral rings straddling its top edge — the
                   same silhouette as the paper tear-off calendars on a desk,
                   built from CSS only (no image assets). */
                .pit-cal-wrap { position:relative; padding:20px 6px 16px; }
                .pit-cal-backing {
                    position:absolute; top:30px; left:-7px; right:-7px; bottom:2px;
                    background:linear-gradient(160deg, #52381f, #26170c);
                    border-radius:16px;
                    box-shadow:0 10px 22px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05);
                }
                .pit-cal-sheet { position:relative; z-index:2; margin-top:20px; border-radius:12px 12px 9px 9px; }
                .pit-cal-ring {
                    position:absolute; top:8px; width:24px; height:24px; border-radius:50%; z-index:3;
                    background:radial-gradient(circle at 32% 28%, #f8fafc, #9aa5b4 55%, #667085 100%);
                    box-shadow:0 2px 5px rgba(0,0,0,.5), inset 0 0 0 6px ${PIT_BG};
                }
                .pit-cal-legend { display:flex; justify-content:center; gap:14px; margin-top:10px; padding-top:8px; border-top:1px solid ${PIT_LINE}; font-size:10px; font-weight:700; color:${PIT_MUTED2}; }
                .pit-cal-legend span { display:inline-flex; align-items:center; gap:5px; }
                .pit-legend-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
            </style>`;
        }

        // ---------------- Calendar ----------------
        // A day cell's pill(s) now answer "obstacle or task?" by fill color
        // (PIT_SOURCE_COLOR) first — that's the one thing the merged
        // "worst status across everything due today" badge this replaced
        // could never show. Urgency (overdue / due soon) rides along as a
        // ring + pulse on the same pill instead of taking over its fill,
        // so neither signal erases the other.
        function pitCalDayBadges(dayItems) {
            const bySource = { issue: dayItems.filter(it => it._source === 'issue'), task: dayItems.filter(it => it._source === 'task') };
            return ['issue', 'task'].map(src => {
                const group = bySource[src];
                if (!group.length) return '';
                const color = PIT_SOURCE_COLOR[src];
                const overdue = group.some(pitIsOverdue);
                const soon = !overdue && group.some(it => it.status !== 'انجام‌شده' && pitDaysUntilDue(it) <= 3);
                const ringClass = overdue ? ' pit-badge-overdue' : '';
                const ringColor = overdue ? PIT_CORAL : soon ? PIT_AMBER : color;
                return `<span class="pit-day-badge${ringClass}" style="background:${color}26; color:${color}; box-shadow:inset 0 0 0 1.5px ${ringColor};" title="${PIT_SOURCE_LABEL[src]}">${toPersianDigits(group.length)}</span>`;
            }).join('');
        }

        function pitCalendarHtml(items) {
            const { calYear: jy, calMonth: jm } = pitState;
            const dim = daysInJalaliMonth(jy, jm);
            const [gy1, gm1, gd1] = jalaliToGregorian(jy, jm, 1);
            const startOffset = (new Date(gy1, gm1 - 1, gd1).getDay() + 1) % 7;
            const todayIso = new Date().toISOString().slice(0, 10);

            const cells = [];
            for (let i = 0; i < startOffset; i++) cells.push('<div></div>');
            for (let d = 1; d <= dim; d++) {
                const [gy, gm, gd] = jalaliToGregorian(jy, jm, d);
                const iso = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
                const dayItems = pitItemsForDate(items, iso);
                const isToday = iso === todayIso;
                const isSelected = iso === pitState.selectedDate;
                cells.push(`
                <div class="pit-day-cell rounded-xl p-1.5 flex flex-col items-center gap-1${isToday ? ' pit-day-today' : ''}${isSelected ? ' pit-day-selected' : ''}" style="min-height:58px;" data-pit-select-date="${iso}">
                    <span class="pit-day-num">${toPersianDigits(d)}</span>
                    <span class="flex items-center gap-0.5">${pitCalDayBadges(dayItems)}</span>
                </div>`);
            }

            return `
            <div class="pit-cal-wrap">
                <div class="pit-cal-backing"></div>
                <div class="pit-cal-ring" style="right:32%;"></div>
                <div class="pit-cal-ring" style="left:32%;"></div>
                <div class="pit-card pit-cal-sheet p-4 md:p-5">
                    <div class="flex items-center justify-between mb-3">
                        <button type="button" data-pit-action="cal-next" class="w-8 h-8 rounded-lg flex items-center justify-center pit-input hover:brightness-125">›</button>
                        <div class="text-center">
                            <p class="font-extrabold text-sm tracking-wide">${JALALI_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}</p>
                            <button type="button" data-pit-action="cal-today" class="text-[10px] font-bold hover:underline" style="color:${PIT_AMBER};">برو به امروز</button>
                        </div>
                        <button type="button" data-pit-action="cal-prev" class="w-8 h-8 rounded-lg flex items-center justify-center pit-input hover:brightness-125">‹</button>
                    </div>
                    <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold mb-1.5" style="color:${PIT_MUTED};">${JALALI_WEEKDAY_LABELS.map(w => `<span>${w}</span>`).join('')}</div>
                    <div class="grid grid-cols-7 gap-1">${cells.join('')}</div>
                    <div class="pit-cal-legend">
                        <span><span class="pit-legend-dot" style="background:${PIT_TASK_COLOR};"></span>تسک</span>
                        <span><span class="pit-legend-dot" style="background:${PIT_ISSUE_COLOR};"></span>مانع</span>
                    </div>
                </div>
            </div>`;
        }

        function pitDayDetailHtml(items) {
            if (!pitState.selectedDate) {
                return `<div class="pit-card p-6 text-center text-sm" style="color:${PIT_MUTED};">یک روز از تقویم را انتخاب کنید تا موارد سررسید آن روز نمایش داده شود.</div>`;
            }
            const dayItems = pitItemsForDate(items, pitState.selectedDate);
            return `
            <div class="pit-card p-4 md:p-5">
                <div class="flex items-center justify-between mb-3">
                    <p class="font-extrabold text-sm">${formatJalali(pitState.selectedDate)}</p>
                    ${pitState.canReport ? `<button type="button" data-pit-action="new-issue" data-date="${pitState.selectedDate}" class="text-[11px] font-bold px-3 py-1.5 rounded-lg" style="background:linear-gradient(135deg, ${PIT_AMBER}, #e8a13d); color:#1a1206;">+ ثبت مانع جدید</button>` : ''}
                </div>
                ${dayItems.length ? `<div class="space-y-2">${dayItems.map(it => pitItemRowHtml(it)).join('')}</div>`
                    : `<p class="text-xs text-center py-6" style="color:${PIT_MUTED};">هیچ مانع یا تسکی برای این روز سررسید ندارد.</p>`}
            </div>`;
        }

        function pitItemRowHtml(item) {
            const sevColor = PIT_SEVERITY_COLOR[item.severity] || PIT_MUTED;
            const statColor = PIT_STATUS_COLOR[item.status] || PIT_MUTED;
            return `
            <div class="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:brightness-110" style="background:${PIT_PANEL2}; border:1px solid ${PIT_LINE};" data-pit-action="open-item" data-source="${item._source}" data-id="${item.id}">
                ${pitCountdownBadge(item, 34)}
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold truncate">${esc(item.title)}</p>
                    <p class="text-[10px] mt-0.5" style="color:${PIT_MUTED};">${esc(item.project_name)} · ${esc(item.responsible_name)}</p>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full" style="background:${statColor}26; color:${statColor};">${esc(item.status)}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background:${sevColor}26; color:${sevColor};">${esc(item.severity)}</span>
                </div>
            </div>`;
        }

        // ---------------- KPI strip ----------------
        // Layout mirrors the reference dashboard exactly: a slim row of
        // plain counts, a "شاخص‌های کلیدی" card with three semi-gauges,
        // then a "توزیع وضعیت و اولویت" card pairing the status donut with
        // severity bars (donut first in source so RTL puts it on the
        // right, bars on the left — same order the reference JSX uses).
        function pitKpiStripHtml(items, kpis) {
            const tiles = [
                { label: 'موانع باز', value: kpis.open, color: PIT_VIOLET },
                { label: 'دارای تاخیر', value: kpis.overdue, color: PIT_CORAL },
                { label: 'سررسید تا ۷ روز آینده', value: kpis.dueSoon, color: PIT_AMBER },
                { label: 'بحرانی باز', value: kpis.critical, color: PIT_CORAL },
            ];
            const gAvg = Math.min(100, kpis.avgDays / 14 * 100);
            const colorAvg = pitGoodnessColor(100 - gAvg);
            const colorOnTime = pitGoodnessColor(kpis.onTimeRate);
            const colorClosed = pitGoodnessColor(kpis.closedRatio);

            return `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                ${tiles.map(t => `
                <div class="pit-card p-3.5 text-center">
                    <p class="text-[10.5px] font-bold mb-1" style="color:${PIT_MUTED};">${esc(t.label)}</p>
                    <p class="text-2xl font-extrabold" style="color:${t.color}; font-variant-numeric:tabular-nums;">${toPersianDigits(t.value)}</p>
                </div>`).join('')}
            </div>

            <div class="pit-card p-4 md:p-5 mt-3">
                <p class="text-[12.5px] font-extrabold mb-2">شاخص‌های کلیدی</p>
                <div class="flex flex-wrap gap-2" style="justify-content:space-between;">
                    <div style="flex:1; min-width:110px; text-align:center;">
                        ${pitSemiGaugeSvg(kpis.onTimeRate, colorOnTime, toPersianDigits(kpis.onTimeRate) + '%')}
                        <p class="text-[10.5px] font-bold mt-1" style="color:${PIT_MUTED2};">تایید به‌موقع</p>
                    </div>
                    <div style="flex:1; min-width:110px; text-align:center;">
                        ${pitSemiGaugeSvg(kpis.closedRatio, colorClosed, toPersianDigits(kpis.closedRatio) + '%')}
                        <p class="text-[10.5px] font-bold mt-1" style="color:${PIT_MUTED2};">نسبت بسته‌شده</p>
                    </div>
                    <div style="flex:1; min-width:110px; text-align:center;">
                        ${pitSemiGaugeSvg(gAvg, colorAvg, toPersianDigits(kpis.avgDays.toFixed(1)))}
                        <p class="text-[10.5px] font-bold mt-1" style="color:${PIT_MUTED2};">میانگین بستن (روز)</p>
                        <p class="text-[9.5px] mt-0.5" style="color:${kpis.trendClosedPct >= 0 ? PIT_MINT : PIT_CORAL};">${kpis.trendClosedPct >= 0 ? '▲' : '▼'} ${toPersianDigits(Math.abs(kpis.trendClosedPct))}٪ نسبت به هفته قبل</p>
                    </div>
                </div>
            </div>

            <div class="pit-card p-4 md:p-5 mt-3">
                <p class="text-[12.5px] font-extrabold mb-3">توزیع وضعیت و اولویت</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    ${pitStatusDonutHtml(items)}
                    <div>${pitSeverityBarsHtml(items)}</div>
                </div>
            </div>`;
        }

        // ---------------- Issue editor (add/edit NATIVE issues only —
        // reflected tasks are edited from پایش اقدامات; here they only get
        // status-transition buttons via pitItemDetailHtml). ----------------
        function pitIssueEditorHtml() {
            const ed = pitState.editor;
            if (!ed) return '';
            const isEdit = ed.mode === 'edit';
            const item = isEdit ? pitState.issues.find(i => i.id === ed.id) : null;
            if (isEdit && !item) return '';
            const project = isEdit ? item.project_name : (ed.projectName || pitState.projects[0]?.name || '');
            const users = pitState.usersByProject[project] || [];
            return `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,.55);" data-pit-action="editor-backdrop">
                <div class="pit-card w-full p-5 space-y-3" style="max-width:480px; max-height:90vh; overflow-y:auto;" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-between">
                        <h4 class="font-extrabold text-sm">${isEdit ? 'ویرایش مانع' : 'ثبت مانع جدید'}</h4>
                        <button type="button" data-pit-action="close-editor" class="text-lg leading-none" style="color:${PIT_MUTED};">×</button>
                    </div>
                    <select data-pit-f="project" class="pit-input w-full text-xs rounded-lg px-2.5 py-2" ${isEdit ? 'disabled' : ''}>
                        ${pitState.projects.map(p => `<option value="${esc(p.name)}" ${p.name === project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                    </select>
                    <input type="text" data-pit-f="title" value="${isEdit ? esc(item.title) : ''}" placeholder="عنوان مانع" class="pit-input w-full text-xs rounded-lg px-2.5 py-2">
                    <textarea data-pit-f="description" placeholder="توضیحات (اختیاری)" rows="2" class="pit-input w-full text-xs rounded-lg px-2.5 py-2">${isEdit ? esc(item.description || '') : ''}</textarea>
                    <div class="grid grid-cols-2 gap-2">
                        <select data-pit-f="responsible" class="pit-input text-xs rounded-lg px-2.5 py-2">
                            <option value="">-- مسئول پیگیری --</option>
                            ${users.map(u => {
                                const label = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                                const selected = isEdit && item.responsible_email === u.email ? 'selected' : '';
                                return `<option value="${esc(u.email)}|${esc(label)}" ${selected}>${esc(label)}</option>`;
                            }).join('')}
                        </select>
                        <select data-pit-f="severity" class="pit-input text-xs rounded-lg px-2.5 py-2">
                            ${PIT_SEVERITIES.map(s => `<option value="${s}" ${isEdit && item.severity === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <input type="text" data-pit-f="due" value="${isEdit ? formatJalali(item.due_date) : (pitState.editor.date ? formatJalali(pitState.editor.date) : '')}" placeholder="مهلت اقدام (۱۴۰۴/۰۱/۰۱)" class="pit-input w-full text-xs rounded-lg px-2.5 py-2">
                    ${!users.length ? `<p class="text-[10px]" style="color:${PIT_AMBER};">این پروژه در «مدیریت کاربران» هنوز کاربری ندارد.</p>` : ''}
                    <div class="flex items-center gap-2 pt-1">
                        <button type="button" data-pit-action="save-issue" class="flex-1 text-xs font-bold px-3 py-2 rounded-lg" style="background:linear-gradient(135deg, ${PIT_AMBER}, #e8a13d); color:#1a1206;">ذخیره</button>
                        ${isEdit ? `<button type="button" data-pit-action="delete-issue" data-id="${item.id}" class="text-xs font-bold px-3 py-2 rounded-lg" style="background:rgba(232,93,78,.14); color:${PIT_CORAL};">حذف</button>` : ''}
                    </div>
                </div>
            </div>`;
        }

        // ---------------- Item detail (status workflow) ----------------
        function pitItemDetailHtml() {
            const sel = pitState.detailItem;
            if (!sel) return '';
            const items = pitUnifiedItems();
            const item = items.find(it => it._source === sel.source && it.id === sel.id);
            if (!item) return '';
            const isResponsible = item.responsible_email === currentUser.email;
            const canAct = pitState.isAdmin || isResponsible;
            const overdue = pitIsOverdue(item);
            return `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,.55);" data-pit-action="detail-backdrop">
                <div class="pit-card w-full p-5 space-y-3" style="max-width:460px; max-height:90vh; overflow-y:auto;" onclick="event.stopPropagation()">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-3">
                            ${pitCountdownBadge(item, 46)}
                            <div>
                                <h4 class="font-extrabold text-sm leading-snug">${esc(item.title)}</h4>
                                <p class="text-[10.5px] mt-0.5" style="color:${PIT_MUTED};">${esc(item.project_name)} · ${item._source === 'task' ? 'تسک اجرایی (پایش اقدامات)' : 'مانع پروژه'}</p>
                            </div>
                        </div>
                        <button type="button" data-pit-action="close-detail" class="text-lg leading-none" style="color:${PIT_MUTED};">×</button>
                    </div>
                    ${item.description ? `<p class="text-xs leading-relaxed" style="color:${PIT_MUTED2};">${esc(item.description)}</p>` : ''}
                    <div class="grid grid-cols-2 gap-2 text-[11px]">
                        <div class="rounded-xl p-2.5" style="background:${PIT_PANEL2};"><p style="color:${PIT_MUTED};">مسئول پیگیری</p><p class="font-bold mt-0.5">${esc(item.responsible_name)}</p></div>
                        <div class="rounded-xl p-2.5" style="background:${PIT_PANEL2};"><p style="color:${PIT_MUTED};">مهلت اقدام</p><p class="font-bold mt-0.5" style="${overdue ? `color:${PIT_CORAL};` : ''}">${formatJalali(item.due_date)}</p></div>
                        <div class="rounded-xl p-2.5" style="background:${PIT_PANEL2};"><p style="color:${PIT_MUTED};">وضعیت</p><p class="font-bold mt-0.5" style="color:${PIT_STATUS_COLOR[item.status]};">${esc(item.status)}</p></div>
                        <div class="rounded-xl p-2.5" style="background:${PIT_PANEL2};"><p style="color:${PIT_MUTED};">اولویت</p><p class="font-bold mt-0.5" style="color:${PIT_SEVERITY_COLOR[item.severity]};">${esc(item.severity)}</p></div>
                    </div>
                    ${item.submitted_note ? `<p class="text-[10.5px] p-2.5 rounded-lg" style="background:rgba(139,124,246,.12); color:${PIT_VIOLET};">یادداشت اقدام: ${esc(item.submitted_note)}</p>` : ''}
                    ${canAct ? pitDetailActionsHtml(item) : ''}
                    ${item._source === 'task' ? `<button type="button" data-pit-action="goto-task-tower" class="w-full text-[11px] font-bold text-center py-2 rounded-lg" style="color:${PIT_AMBER}; background:rgba(245,178,72,.1);">ویرایش کامل در «پایش اقدامات» ‹</button>` : ''}
                </div>
            </div>`;
        }

        function pitDetailActionsHtml(item) {
            const src = item._source;
            const btn = (action, label, style) => `<button type="button" data-pit-action="${action}" data-source="${src}" data-id="${item.id}" class="text-[11px] font-bold px-3 py-1.5 rounded-lg" style="${style}">${label}</button>`;
            const ghost = `background:${PIT_PANEL2}; color:${PIT_MUTED2};`;
            if (item.status === 'انجام‌شده') {
                return pitState.isAdmin ? `<div class="flex flex-wrap gap-1.5 pt-1">${btn('reopen', 'بازگردانی به «باز»', ghost)}</div>` : '';
            }
            let html = '';
            if (item.status === 'باز' || item.status === 'در حال انجام') {
                html += btn('submit', 'ارسال برای تایید', `background:linear-gradient(135deg, ${PIT_AMBER}, #e8a13d); color:#1a1206;`);
            }
            if (pitState.isAdmin && item.status === 'در انتظار تایید') {
                html += btn('approve', 'تایید نهایی', `background:${PIT_MINT}; color:#06281c;`);
                html += btn('reject', 'بازگشت جهت اصلاح', `background:rgba(232,93,78,.14); color:${PIT_CORAL};`);
            }
            return html ? `<div class="flex flex-wrap gap-1.5 pt-1">${html}</div>` : '';
        }

        // ---------------- Reports ----------------
        function pitReportsHtml(items) {
            const f = pitState.filters;
            const responsibleOptions = [...new Set(items.map(it => it.responsible_name))].sort();
            let filtered = items;
            if (f.project) filtered = filtered.filter(it => it.project_name === f.project);
            if (f.responsible) filtered = filtered.filter(it => it.responsible_name === f.responsible);
            if (f.status) filtered = filtered.filter(it => it.status === f.status);
            if (f.severity) filtered = filtered.filter(it => it.severity === f.severity);
            if (f.source) filtered = filtered.filter(it => it._source === f.source);
            filtered = filtered.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

            const byProject = {};
            filtered.forEach(it => { byProject[it.project_name] = (byProject[it.project_name] || 0) + 1; });
            const maxByProject = Math.max(1, ...Object.values(byProject));

            return `
            <div class="pit-card p-4 md:p-5 space-y-3">
                <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <select data-pit-filter="project" class="pit-input text-[11px] rounded-lg px-2 py-1.5"><option value="">همه پروژه‌ها</option>${pitState.projects.map(p => `<option value="${esc(p.name)}" ${f.project === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
                    <select data-pit-filter="responsible" class="pit-input text-[11px] rounded-lg px-2 py-1.5"><option value="">همه مسئولین</option>${responsibleOptions.map(r => `<option value="${esc(r)}" ${f.responsible === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
                    <select data-pit-filter="status" class="pit-input text-[11px] rounded-lg px-2 py-1.5"><option value="">همه وضعیت‌ها</option>${PIT_STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                    <select data-pit-filter="severity" class="pit-input text-[11px] rounded-lg px-2 py-1.5"><option value="">همه اولویت‌ها</option>${PIT_SEVERITIES.map(s => `<option value="${s}" ${f.severity === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                    <select data-pit-filter="source" class="pit-input text-[11px] rounded-lg px-2 py-1.5"><option value="">مانع + تسک</option><option value="issue" ${f.source === 'issue' ? 'selected' : ''}>فقط موانع</option><option value="task" ${f.source === 'task' ? 'selected' : ''}>فقط تسک‌ها</option></select>
                </div>

                ${Object.keys(byProject).length ? `<div class="space-y-1.5 pt-1">
                    <p class="text-[10.5px] font-extrabold" style="color:${PIT_MUTED};">توزیع بر حسب پروژه</p>
                    ${Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([pn, count]) => `
                    <div class="flex items-center gap-2 text-[11px]">
                        <span class="w-28 truncate shrink-0">${esc(pn)}</span>
                        <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:${PIT_PANEL2};"><div class="h-full rounded-full" style="width:${count / maxByProject * 100}%; background:${PIT_AMBER};"></div></div>
                        <span class="w-6 text-left font-bold shrink-0">${toPersianDigits(count)}</span>
                    </div>`).join('')}
                </div>` : ''}

                <div class="flex items-center justify-between pt-2" style="border-top:1px solid ${PIT_LINE};">
                    <p class="text-[10.5px]" style="color:${PIT_MUTED};">${toPersianDigits(filtered.length)} مورد</p>
                    <button type="button" data-pit-action="export-csv" class="text-[10.5px] font-bold px-2.5 py-1 rounded-lg pit-input">خروجی CSV</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-[11px]">
                        <thead><tr class="text-right" style="color:${PIT_MUTED};"><th class="py-1.5 font-bold">عنوان</th><th class="py-1.5 font-bold">پروژه</th><th class="py-1.5 font-bold">مسئول</th><th class="py-1.5 font-bold">اولویت</th><th class="py-1.5 font-bold">وضعیت</th><th class="py-1.5 font-bold">مهلت</th></tr></thead>
                        <tbody>
                            ${filtered.map(it => `<tr class="cursor-pointer hover:brightness-125" style="border-top:1px solid ${PIT_LINE};" data-pit-action="open-item" data-source="${it._source}" data-id="${it.id}">
                                <td class="py-1.5 max-w-[160px] truncate">${esc(it.title)}</td>
                                <td class="py-1.5">${esc(it.project_name)}</td>
                                <td class="py-1.5">${esc(it.responsible_name)}</td>
                                <td class="py-1.5"><span style="color:${PIT_SEVERITY_COLOR[it.severity]};">${esc(it.severity)}</span></td>
                                <td class="py-1.5"><span style="color:${PIT_STATUS_COLOR[it.status]};">${esc(it.status)}</span></td>
                                <td class="py-1.5" style="${pitIsOverdue(it) ? `color:${PIT_CORAL};` : ''}">${formatJalali(it.due_date)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${!filtered.length ? `<p class="text-xs text-center py-6" style="color:${PIT_MUTED};">موردی با این فیلترها یافت نشد.</p>` : ''}
                </div>
            </div>`;
        }

        // ---------------- Orchestrator ----------------
        function pitRenderAll() {
            const body = document.getElementById('pitBody');
            if (!body) return;
            const items = pitUnifiedItems();
            const kpis = pitKpis(items);
            body.innerHTML = `
            ${pitStyleBlock()}
            <div class="rounded-2xl p-4 md:p-5" style="background:${PIT_BG};">
                ${pitKpiStripHtml(items, kpis)}
                <div class="flex items-center gap-1 mt-4 mb-3">
                    <button type="button" data-pit-tab="calendar" class="text-[11.5px] font-bold px-3 py-1.5 rounded-lg" style="${pitState.activeTab === 'calendar' ? `background:linear-gradient(135deg, ${PIT_AMBER}, ${PIT_CORAL}); color:#1a1206;` : `color:${PIT_MUTED};`}">تقویم</button>
                    <button type="button" data-pit-tab="reports" class="text-[11.5px] font-bold px-3 py-1.5 rounded-lg" style="${pitState.activeTab === 'reports' ? `background:linear-gradient(135deg, ${PIT_AMBER}, ${PIT_CORAL}); color:#1a1206;` : `color:${PIT_MUTED};`}">گزارش‌ها</button>
                </div>
                ${pitState.activeTab === 'calendar' ? `
                <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <div class="lg:col-span-3">${pitCalendarHtml(items)}</div>
                    <div class="lg:col-span-2">${pitDayDetailHtml(items)}</div>
                </div>` : pitReportsHtml(items)}
                ${pitIssueEditorHtml()}
                ${pitItemDetailHtml()}
            </div>
            `;
            pitBindEvents();
        }

        // ---------------- Mutations ----------------
        async function pitSaveIssue() {
            const root = document.getElementById('pitBody');
            const ed = pitState.editor;
            const project = root.querySelector('[data-pit-f="project"]').value;
            const title = root.querySelector('[data-pit-f="title"]').value.trim();
            const description = root.querySelector('[data-pit-f="description"]').value.trim();
            const respRaw = root.querySelector('[data-pit-f="responsible"]').value;
            const [responsibleEmail, responsibleName] = respRaw.split('|');
            const severity = root.querySelector('[data-pit-f="severity"]').value;
            const dueIso = jalaliInputToIso(root.querySelector('[data-pit-f="due"]').value.trim());
            if (!project || !title || !responsibleEmail || !dueIso) { alert('عنوان، مسئول پیگیری و مهلت اقدام الزامی است.'); return; }
            if (ed.mode === 'new') {
                const { error } = await _supabase.from('tm_project_issues').insert({
                    project_name: project, title, description: description || null,
                    responsible_name: responsibleName, responsible_email: responsibleEmail,
                    severity, due_date: dueIso, created_by: currentUser.email,
                });
                if (error) { alert('خطا در ثبت مانع: ' + error.message); return; }
            } else {
                const { error } = await _supabase.from('tm_project_issues').update({
                    title, description: description || null, responsible_name: responsibleName, responsible_email: responsibleEmail,
                    severity, due_date: dueIso, updated_at: new Date().toISOString(),
                }).eq('id', ed.id);
                if (error) { alert('خطا در ذخیره: ' + error.message); return; }
            }
            pitState.editor = null;
            await loadIssueTrackingView();
        }

        async function pitDeleteIssue(id) {
            if (!confirm('این مانع حذف شود؟')) return;
            const { error } = await _supabase.from('tm_project_issues').delete().eq('id', Number(id));
            if (error) { alert('خطا در حذف: ' + error.message); return; }
            pitState.editor = null;
            await loadIssueTrackingView();
        }

        async function pitTransition(source, id, action) {
            const idNum = Number(id);
            if (source === 'task') {
                if (action === 'submit') await submitQuickWinTask(idNum);
                else if (action === 'approve') await completeQuickWinTask(idNum);
                else if (action === 'reject') await rejectQuickWinTask(idNum);
                else if (action === 'reopen') await reopenQuickWinTask(idNum);
                await loadIssueTrackingView();
                return;
            }
            if (action === 'submit') {
                const note = prompt('توضیح اقدام انجام‌شده (اختیاری):', '');
                if (note === null) return;
                const { error } = await _supabase.from('tm_project_issues').update({ status: 'در انتظار تایید', submitted_at: new Date().toISOString(), submitted_note: note || null }).eq('id', idNum);
                if (error) { alert('خطا: ' + error.message); return; }
            } else if (action === 'approve') {
                const { error } = await _supabase.from('tm_project_issues').update({ status: 'انجام‌شده', completed_at: new Date().toISOString() }).eq('id', idNum);
                if (error) { alert('خطا: ' + error.message); return; }
            } else if (action === 'reject') {
                if (!confirm('این مانع به «در حال انجام» بازگردانده شود؟')) return;
                const { error } = await _supabase.from('tm_project_issues').update({ status: 'در حال انجام', submitted_at: null, submitted_note: null }).eq('id', idNum);
                if (error) { alert('خطا: ' + error.message); return; }
            } else if (action === 'reopen') {
                if (!confirm('این مانع به حالت «باز» بازگردانده شود؟')) return;
                const { error } = await _supabase.from('tm_project_issues').update({ status: 'باز', completed_at: null }).eq('id', idNum);
                if (error) { alert('خطا: ' + error.message); return; }
            }
            await loadIssueTrackingView();
        }

        function pitExportCsv(items) {
            const header = ['عنوان', 'پروژه', 'مسئول', 'اولویت', 'وضعیت', 'مهلت'];
            const rows = items.map(it => [it.title, it.project_name, it.responsible_name, it.severity, it.status, it.due_date]);
            const csv = [header, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'project-issues.csv';
            a.click();
            URL.revokeObjectURL(url);
        }

        function pitBindEvents() {
            const root = document.getElementById('pitBody');
            if (!root) return;
            root.querySelectorAll('[data-pit-tab]').forEach(btn => btn.addEventListener('click', () => { pitState.activeTab = btn.dataset.pitTab; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-select-date]').forEach(el => el.addEventListener('click', () => { pitState.selectedDate = el.dataset.pitSelectDate; pitRenderAll(); }));
            const nav = (delta) => { pitState.calMonth += delta; if (pitState.calMonth > 12) { pitState.calMonth = 1; pitState.calYear++; } if (pitState.calMonth < 1) { pitState.calMonth = 12; pitState.calYear--; } pitRenderAll(); };
            root.querySelectorAll('[data-pit-action="cal-next"]').forEach(btn => btn.addEventListener('click', () => nav(1)));
            root.querySelectorAll('[data-pit-action="cal-prev"]').forEach(btn => btn.addEventListener('click', () => nav(-1)));
            root.querySelectorAll('[data-pit-action="cal-today"]').forEach(btn => btn.addEventListener('click', () => {
                const today = new Date();
                const [jy, jm] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
                pitState.calYear = jy; pitState.calMonth = jm;
                pitState.selectedDate = today.toISOString().slice(0, 10);
                pitRenderAll();
            }));
            root.querySelectorAll('[data-pit-action="new-issue"]').forEach(btn => btn.addEventListener('click', () => { pitState.editor = { mode: 'new', date: btn.dataset.date || null, projectName: pitState.projects[0]?.name }; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="close-editor"]').forEach(btn => btn.addEventListener('click', () => { pitState.editor = null; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="editor-backdrop"]').forEach(el => el.addEventListener('click', () => { pitState.editor = null; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="save-issue"]').forEach(btn => btn.addEventListener('click', pitSaveIssue));
            root.querySelectorAll('[data-pit-action="delete-issue"]').forEach(btn => btn.addEventListener('click', () => pitDeleteIssue(btn.dataset.id)));
            root.querySelectorAll('[data-pit-f="due"]').forEach(el => attachJalaliDatePickerKeyboardOk(el));
            root.querySelectorAll('[data-pit-action="open-item"]').forEach(el => el.addEventListener('click', () => { pitState.detailItem = { source: el.dataset.source, id: Number(el.dataset.id) }; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="close-detail"]').forEach(btn => btn.addEventListener('click', () => { pitState.detailItem = null; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="detail-backdrop"]').forEach(el => el.addEventListener('click', () => { pitState.detailItem = null; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="goto-task-tower"]').forEach(btn => btn.addEventListener('click', () => switchView('tasks')));
            ['submit', 'approve', 'reject', 'reopen'].forEach(action => {
                root.querySelectorAll(`[data-pit-action="${action}"]`).forEach(btn => btn.addEventListener('click', () => pitTransition(btn.dataset.source, btn.dataset.id, action)));
            });
            root.querySelectorAll('[data-pit-filter]').forEach(sel => sel.addEventListener('change', () => { pitState.filters[sel.dataset.pitFilter] = sel.value; pitRenderAll(); }));
            root.querySelectorAll('[data-pit-action="export-csv"]').forEach(btn => btn.addEventListener('click', () => {
                let items = pitUnifiedItems();
                const f = pitState.filters;
                if (f.project) items = items.filter(it => it.project_name === f.project);
                if (f.responsible) items = items.filter(it => it.responsible_name === f.responsible);
                if (f.status) items = items.filter(it => it.status === f.status);
                if (f.severity) items = items.filter(it => it.severity === f.severity);
                if (f.source) items = items.filter(it => it._source === f.source);
                pitExportCsv(items);
            }));
        }

  return { loadTasksView, loadIssueTrackingView, pitDestroy: () => {} }
}
