// Static markup of the two views, copied from the source app's index.html (ids are referenced by the engine).
export const TASKS_VIEW_HTML = `                <div class="print-card bg-white rounded-2xl shadow-sm border p-5">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div class="flex items-center gap-3">
                            <span class="shrink-0 h-11 w-11 rounded-2xl flex items-center justify-center text-[#ffffff]" style="background: linear-gradient(135deg, #0f172a, #334155);">
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            </span>
                            <div>
                                <h2 class="text-lg font-extrabold text-slate-800">پایش اقدامات</h2>
                                <p class="text-xs text-slate-500 mt-0.5">مرکز پایش، تحلیل و پیگیری تسک‌های اجرایی پروژه</p>
                            </div>
                        </div>
                        <div class="no-print flex items-center gap-2 flex-wrap">
                            <button type="button" id="tasksRefreshBtn" title="بروزرسانی" class="h-9 w-9 flex items-center justify-center rounded-xl border text-slate-500 hover:bg-slate-50">⟲</button>
                            <button type="button" id="tasksFilterToggleBtn" class="text-xs font-bold px-3 py-2 rounded-xl border text-slate-600 hover:bg-slate-50">🔍 فیلتر</button>
                            <button type="button" id="tasksExportCsvBtn" class="text-xs font-bold px-3 py-2 rounded-xl border text-slate-600 hover:bg-slate-50">خروجی CSV</button>
                            <button type="button" id="tasksPrintBtn" class="text-xs font-bold px-3 py-2 rounded-xl border text-slate-600 hover:bg-slate-50">🖨 چاپ / PDF</button>
                            <button type="button" id="tasksNewBtn" class="hidden bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow">+ ثبت تسک جدید</button>
                        </div>
                    </div>
                </div>

                <div id="taskFilterBox" class="no-print hidden bg-white rounded-2xl shadow-sm border p-4 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">پروژه</label>
                            <select id="taskFilterProject" multiple class="w-full border rounded-lg p-1.5 h-32 bg-white text-xs"></select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">جستجو در تسک‌ها (عنوان، پروژه، اقدام مرتبط، مسئول)</label>
                            <div class="relative">
                                <input id="taskFilterSearch" type="text" placeholder="برای جستجوی سریع تایپ کنید..." class="w-full border rounded-lg p-2.5 pr-8 text-xs">
                                <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">جستجو بلافاصله اعمال می‌شود و مستقل از فیلترهای زیر، همه تسک‌های مطابق را پیدا می‌کند.</p>
                        </div>
                    </div>
                    <p class="text-[10px] text-slate-400 border-t pt-2">برای انتخاب هم‌زمان چند مورد در فیلترهای زیر، کلید Ctrl (یا ⌘ در مک) را هنگام کلیک نگه دارید.</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">واحد مسئول</label><select id="taskFilterUnit" multiple class="w-full border rounded-lg p-1 h-24 bg-white"></select></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">شدت (Priority/Severity)</label><select id="taskFilterSeverity" multiple class="w-full border rounded-lg p-1 h-24 bg-white"></select></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">وضعیت</label><select id="taskFilterStatus" multiple class="w-full border rounded-lg p-1 h-24 bg-white"></select></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">مسئول پیگیری</label><select id="taskFilterPerson" multiple class="w-full border rounded-lg p-1 h-24 bg-white"></select></div>
                    </div>
                    <div class="flex flex-wrap items-end gap-3 pt-2 border-t text-xs">
                        <label class="flex items-center gap-1.5 font-bold text-red-700"><input type="checkbox" id="taskFilterOverdueOnly"> فقط معوق‌ها</label>
                        <label class="flex items-center gap-1.5 font-bold text-amber-700"><input type="checkbox" id="taskFilterDueSoonOnly"> فقط نزدیک به سررسید</label>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">از تاریخ</label><input id="taskFilterDateFrom" type="text" dir="ltr" placeholder="۱۴۰۵/۰۱/۰۱" class="border rounded-lg p-1.5 text-center w-28"></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1">تا تاریخ</label><input id="taskFilterDateTo" type="text" dir="ltr" placeholder="۱۴۰۵/۰۶/۳۰" class="border rounded-lg p-1.5 text-center w-28"></div>
                        <button type="button" id="tasksApplyFiltersBtn" class="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-1.5 rounded-lg">اعمال فیلتر</button>
                        <button type="button" id="tasksClearFiltersBtn" class="text-slate-500 underline">پاک‌کردن همه فیلترها</button>
                    </div>
                    <div id="taskActiveFilterChips" class="flex flex-wrap gap-1.5 text-[11px] pt-1"></div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5" id="taskKpiRow"></div>

                <div class="print-card rounded-2xl shadow-lg overflow-hidden">
                    <div class="p-4 relative overflow-hidden" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
                        <div class="absolute -top-10 -left-10 h-36 w-36 rounded-full pointer-events-none" style="background: radial-gradient(circle, rgba(255,255,255,.18), transparent 70%);"></div>
                        <div class="relative flex items-center justify-between flex-wrap gap-2.5">
                            <div class="flex items-center gap-2.5">
                                <span class="shrink-0 h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center text-white">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                </span>
                                <div>
                                    <h3 class="text-sm font-extrabold text-white">مرکز اقدام فوری</h3>
                                    <p class="text-[11px]" style="color:#fecaca;">موارد نیازمند پیگیری فوری — معوق، نزدیک به سررسید، یا شروع‌نشده</p>
                                </div>
                            </div>
                            <div class="no-print flex gap-1 text-[11px]" id="taskActionTabs"></div>
                        </div>
                    </div>
                    <div id="taskActionCenterBody" class="p-4 space-y-1.5"></div>
                </div>

                <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <h3 class="text-sm font-bold text-slate-800">کل تسک‌ها</h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">همه تسک‌های مطابق فیلترهای بالا در یک جدول — تسک‌های انجام‌شده با خط ظریف مشخص شده‌اند.</p>
                        </div>
                        <span id="allTasksTableCount" class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full shrink-0"></span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs">
                            <thead class="bg-slate-100 text-slate-600">
                                <tr><th class="p-2.5">عنوان تسک</th><th class="p-2.5">شدت</th><th class="p-2.5">مهلت</th><th class="p-2.5">وضعیت</th></tr>
                            </thead>
                            <tbody id="allTasksTableBody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                    <div>
                        <h3 class="text-sm font-bold text-slate-800">وضعیت اقدامات زودبازده و میان‌مدت</h3>
                        <p class="text-[11px] text-slate-500 mt-0.5">پیشرفت هر اقدام، امکان بروزرسانی وضعیت، و ثبت نتیجه نهایی پس از تکمیل.</p>
                    </div>
                    <div id="taskProjectCardsBody" class="space-y-4"></div>
                </div>

                <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <h3 class="text-sm font-bold text-slate-800">آمار تسک‌ها</h3>
                            <p class="text-[11px] text-slate-500 mt-0.5">شمار تسک‌های مطابق فیلترهای بالا؛ کلیک روی هر ردیف مثل فیلتر عمل می‌کند — کلیک دوباره برای برداشتن آن.</p>
                        </div>
                        <div class="no-print flex gap-1 text-[10px]" id="taskStatsTabBtns"></div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-right text-xs" id="taskStatsTable"></table>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <h3 class="text-sm font-bold text-slate-800">وضعیت تسک‌ها</h3>
                        <div class="relative h-48 mx-auto" style="max-width:220px">
                            <canvas id="taskStatusDonut"></canvas>
                            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span id="taskStatusDonutCenter" class="text-2xl font-extrabold text-slate-800"></span>
                                <span class="text-[10px] text-slate-400">تسک فعال</span>
                            </div>
                        </div>
                        <div id="taskStatusLegend" class="space-y-1 text-xs"></div>
                    </div>
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <h3 class="text-sm font-bold text-slate-800">توزیع شدت (Severity)</h3>
                        <div style="height:190px"><canvas id="taskSeverityChart"></canvas></div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <div class="flex items-center justify-between flex-wrap gap-2">
                            <h3 class="text-sm font-bold text-slate-800">Task Aging Analysis</h3>
                            <p class="text-[11px] text-slate-500">قدیمی‌ترین تسک باز: <span id="taskOldestOpen" class="font-extrabold text-slate-800"></span></p>
                        </div>
                        <div style="height:190px"><canvas id="taskAgingChart"></canvas></div>
                    </div>
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <h3 class="text-sm font-bold text-slate-800">🎯 Overdue Radar</h3>
                        <div id="taskOverdueRadarList" class="space-y-1.5 max-h-56 overflow-y-auto"></div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <h3 class="text-sm font-bold text-slate-800">Tasks by Responsible Unit</h3>
                        <div style="height:200px"><canvas id="taskByUnitChart"></canvas></div>
                    </div>
                    <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                        <h3 class="text-sm font-bold text-slate-800">Tasks by Responsible Person</h3>
                        <div style="height:200px"><canvas id="taskByPersonChart"></canvas></div>
                    </div>
                </div>

                <div class="print-card bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                    <div class="flex justify-between items-center flex-wrap gap-2">
                        <h3 class="text-sm font-bold text-slate-800">Task Trend</h3>
                        <div class="no-print flex gap-1 text-[10px]" id="taskTrendGranularityBtns"></div>
                    </div>
                    <div style="height:220px"><canvas id="taskTrendChart"></canvas></div>
                </div>

                <div class="print-card print-card-accent rounded-2xl shadow-sm p-5 space-y-2.5" style="background: linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%);">
                    <h3 class="text-sm font-bold text-[#ffffff] flex items-center gap-2">💡 AI Management Insight</h3>
                    <div id="taskAiInsightList" class="space-y-1.5"></div>
                </div>`

export const ISSUES_VIEW_HTML = `                <div class="print-card rounded-2xl shadow-sm p-5" style="background:#141b2e;">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div class="flex items-center gap-3">
                            <span class="shrink-0 h-11 w-11 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, #f5b248, #e85d4e); color:#1a1206;">
                                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            </span>
                            <div>
                                <h2 class="text-lg font-extrabold" style="color:#edeff5;">پیگیری موانع پروژه‌ها</h2>
                                <p class="text-xs mt-0.5" style="color:#8b93a7;">تقویم، شاخص‌ها و گزارش‌های موانع اجرایی و تسک‌های دارای مهلت</p>
                            </div>
                        </div>
                        <button type="button" onclick="window.print()" class="no-print text-xs font-bold px-4 py-2 rounded-xl" style="background:#1b2439; color:#c8cedb;">🖨 چاپ / PDF</button>
                    </div>
                </div>

                <div id="pitBody"></div>`

// Task detail drawer and the «ثبت تسک جدید» modal (siblings of the views in the source page).
export const TASK_OVERLAYS_HTML = `    <!-- Task Detail Drawer -->
    <div id="taskDrawerOverlay" class="no-print hidden fixed inset-0 z-40 bg-black/50"></div>
    <div id="taskDrawer" class="no-print fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto" style="transform: translateX(100%); transition: transform .25s ease;">
        <div class="p-5 space-y-4" id="taskDrawerContent"></div>
    </div>

    <!-- New Task Modal -->
    <div id="newTaskModal" class="no-print hidden fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3">
            <div class="flex justify-between items-center">
                <h3 class="font-bold text-slate-800">+ ثبت تسک جدید</h3>
                <button type="button" id="newTaskCloseBtn" class="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">پروژه *</label>
                    <select id="newTaskProject" class="w-full border rounded-lg p-2 bg-white"><option value="">-- انتخاب پروژه --</option></select>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">اقدام زودبازده / میان‌مدت *</label>
                    <select id="newTaskCase" class="w-full border rounded-lg p-2 bg-white"><option value="">-- ابتدا پروژه را انتخاب کنید --</option></select>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">عنوان تسک *</label>
                    <input id="newTaskTitle" type="text" class="w-full border rounded-lg p-2" placeholder="عنوان کوتاه و مشخص">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">واحد مسئول *</label>
                    <select id="newTaskUnit" class="w-full border rounded-lg p-2 bg-white"><option value="">-- انتخاب --</option></select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">شدت (Priority/Severity)</label>
                    <select id="newTaskSeverity" class="w-full border rounded-lg p-2 bg-white"></select>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">مسئول پیگیری *</label>
                    <select id="newTaskResponsible" class="w-full border rounded-lg p-2 bg-white"><option value="">-- ابتدا پروژه را انتخاب کنید --</option></select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">تاریخ شروع *</label>
                    <input id="newTaskStartDate" type="text" dir="ltr" placeholder="۱۴۰۵/۰۶/۰۱" class="w-full border rounded-lg p-2 text-center">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">مهلت انجام *</label>
                    <input id="newTaskDueDate" type="text" dir="ltr" placeholder="۱۴۰۵/۰۶/۳۰" class="w-full border rounded-lg p-2 text-center">
                </div>
            </div>
            <button type="button" id="newTaskSubmitBtn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl shadow">ثبت تسک</button>
        </div>
    </div>`
