import assert from 'node:assert/strict'
import { parseXml } from './xml.ts'
import { detectP6Format, parseXer, parseP6Xml, parseXerCalendarData } from './p6.ts'
import { validateParsed } from './validate.ts'

// ── minimal XML reader
const x = parseXml('<?xml version="1.0"?><!-- c --><a:Root xmlns:a="u"><Item id="1">A &amp; B</Item><Item id="2"/><![CDATA[<raw>]]></a:Root>')
assert.equal(x.children[0].name, 'Root'); assert.equal(x.children[0].children.length, 2)
assert.equal(x.children[0].children[0].text, 'A & B'); assert.equal(x.children[0].children[1].attrs.id, '2')
assert.throws(() => parseXml('<a><b></a'))

// ── XER (synthetic sample following the documented table layout; hours → days at 8 h/day)
const cal = '(0||CalendarData()(\n (0||DaysOfWeek()(\n  (0||1()())\n  (0||2()((0||0(s|08:00|f|16:00)())))\n  (0||3()((0||0(s|08:00|f|16:00)())))\n  (0||4()((0||0(s|08:00|f|16:00)())))\n  (0||5()((0||0(s|08:00|f|16:00)())))\n  (0||6()())\n  (0||7()((0||0(s|08:00|f|16:00)())))\n )\n )\n (0||Exceptions()(\n  (0||0(d|46033)())\n )\n))'
const xer = [
  'ERMHDR\t8.4\t2026-01-01\tProject\tadmin\tadmin\tdb\tPM\tUSD',
  '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tplan_start_date\tlast_recalc_date\tclndr_id', '%R\t100\tDEMO\t2026-01-03 08:00\t2026-01-11 08:00\t1',
  '%T\tCALENDAR', '%F\tclndr_id\tclndr_name\tday_hr_cnt\tclndr_data', `%R\t1\tStd\t8\t${cal.replace(/\n/g, ' ')}`,
  '%T\tPROJWBS', '%F\twbs_id\twbs_short_name\twbs_name\tparent_wbs_id', '%R\t1\tROOT\tDemo Project\t', '%R\t2\tCN\tConstruction\t1',
  '%T\tTASK', '%F\ttask_id\ttask_code\ttask_name\ttask_type\twbs_id\tclndr_id\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tcomplete_pct_type\tcstr_type\tcstr_date',
  '%R\t11\tA100\tStringing\tTT_Task\t2\t1\t40\t0\t2026-01-03 08:00\t2026-01-07 16:00\t2026-01-03 08:00\t2026-01-07 16:00\t100\tCP_Phys\t\t',
  '%R\t12\tA200\tWelding\tTT_Task\t2\t1\t24\t8\t2026-01-10 08:00\t2026-01-12 16:00\t2026-01-10 08:00\t\t67\tCP_Phys\tCS_MSOA\t2026-01-10 08:00',
  '%R\t13\tM900\tDone\tTT_FinMile\t2\t1\t0\t0\t2026-01-13 08:00\t2026-01-13 16:00\t\t\t0\tCP_Phys\t\t',
  '%R\t99\tWBS1\tSummary\tTT_WBS\t2\t1\t0\t0\t\t\t\t\t0\tCP_Phys\t\t',
  '%T\tTASKPRED', '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt', '%R\t1\t12\t11\tPR_FS\t0', '%R\t2\t13\t12\tPR_FS\t16', '%R\t3\t13\t77\tPR_FS\t0',
  '%T\tRSRC', '%F\trsrc_id\trsrc_name', '%R\t1\tCrane',
  '%E',
].join('\n')
assert.equal(detectP6Format(xer), 'xer')
const px = parseXer(xer)
assert.equal(px.activities.length, 3)                                      // the WBS-summary row is not an activity
assert.equal(px.projectName, 'DEMO'); assert.equal(px.dataDate, '2026-01-11')
const a200 = px.activities.find((a) => a.code === 'A200')
assert.equal(a200.origDuration, 3); assert.equal(a200.remDuration, 1); assert.equal(a200.pctComplete, 67)
assert.equal(a200.constraintType, 'SNET'); assert.equal(a200.wbsPath, 'Demo Project / Construction')
assert.equal(px.activities.find((a) => a.code === 'M900').type, 'milestone')
assert.equal(px.relations.length, 2); assert.equal(px.relations.find((r) => r.succCode === 'M900').lag, 2)   // 16 h = 2 days
assert.ok(px.issues.some((i) => /خارج از فهرست/.test(i.message)))      // the relation to unknown task 77 is reported
assert.ok(px.unsupported.some((u) => /منابع/.test(u)))                     // resources are reported as not carried over
const cd = parseXerCalendarData(cal)
assert.deepEqual(cd.workDays, [0, 2, 3, 4, 5])                              // P6 days 2,3,4,5 (Mon..Thu) and 7 (Sat) → our 0=Sat, 2=Mon … 5=Thu
assert.equal(cd.holidays[0], '2026-01-11')                                 // Excel serial 46033
assert.equal(px.calendars[0].isDefault, true)
assert.deepEqual(parseXer('garbage').issues.map((i) => i.level), ['error'])

// ── PMXML
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V8.4/API/BusinessObjects">
 <Calendar><ObjectId>1</ObjectId><Name>Std</Name><HoursPerDay>8</HoursPerDay>
  <StandardWorkWeek>
   <StandardWorkHours><DayOfWeek>Saturday</DayOfWeek><WorkTime><Start>08:00:00</Start><Finish>16:00:00</Finish></WorkTime></StandardWorkHours>
   <StandardWorkHours><DayOfWeek>Sunday</DayOfWeek><WorkTime><Start>08:00:00</Start><Finish>16:00:00</Finish></WorkTime></StandardWorkHours>
   <StandardWorkHours><DayOfWeek>Monday</DayOfWeek><WorkTime><Start>08:00:00</Start><Finish>16:00:00</Finish></WorkTime></StandardWorkHours>
   <StandardWorkHours><DayOfWeek>Thursday</DayOfWeek></StandardWorkHours>
  </StandardWorkWeek>
  <HolidayOrExceptions><HolidayOrException><Date>2026-01-12T00:00:00</Date></HolidayOrException></HolidayOrExceptions>
 </Calendar>
 <Project><ObjectId>1</ObjectId><Id>DEMO</Id><Name>Demo Project</Name><DataDate>2026-01-11T08:00:00</DataDate><DefaultCalendarObjectId>1</DefaultCalendarObjectId>
  <WBS><ObjectId>5</ObjectId><Code>CN</Code><Name>Construction</Name></WBS>
  <Activity><ObjectId>21</ObjectId><Id>B100</Id><Name>Fit-up</Name><Type>Task Dependent</Type><WBSObjectId>5</WBSObjectId><CalendarObjectId>1</CalendarObjectId><PlannedDuration>40</PlannedDuration><RemainingDuration>0</RemainingDuration><PlannedStartDate>2026-01-03T08:00:00</PlannedStartDate><PlannedFinishDate>2026-01-07T16:00:00</PlannedFinishDate><ActualStartDate>2026-01-03T08:00:00</ActualStartDate><ActualFinishDate>2026-01-07T16:00:00</ActualFinishDate><PhysicalPercentComplete>100</PhysicalPercentComplete></Activity>
  <Activity><ObjectId>22</ObjectId><Id>B200</Id><Name>Coating</Name><Type>Task Dependent</Type><WBSObjectId>5</WBSObjectId><CalendarObjectId>1</CalendarObjectId><PlannedDuration>PT24H0M0S</PlannedDuration><PlannedStartDate>2026-01-10T08:00:00</PlannedStartDate><PlannedFinishDate>2026-01-12T16:00:00</PlannedFinishDate><PrimaryConstraintType>Mandatory Finish</PrimaryConstraintType><PrimaryConstraintDate>2026-01-12T16:00:00</PrimaryConstraintDate></Activity>
  <Activity><ObjectId>23</ObjectId><Id>B300</Id><Name>Handover</Name><Type>Finish Milestone</Type><PlannedFinishDate>2026-01-13T16:00:00</PlannedFinishDate></Activity>
  <Activity><ObjectId>24</ObjectId><Id>B200</Id><Name>Duplicate</Name><Type>Task Dependent</Type></Activity>
  <Relationship><PredecessorActivityObjectId>21</PredecessorActivityObjectId><SuccessorActivityObjectId>22</SuccessorActivityObjectId><Type>Finish to Start</Type><Lag>0</Lag></Relationship>
  <Relationship><PredecessorActivityObjectId>22</PredecessorActivityObjectId><SuccessorActivityObjectId>23</SuccessorActivityObjectId><Type>Start to Start</Type><Lag>8</Lag></Relationship>
  <Relationship><PredecessorActivityObjectId>22</PredecessorActivityObjectId><SuccessorActivityObjectId>23</SuccessorActivityObjectId><Type>Odd</Type><Lag>0</Lag></Relationship>
 </Project>
 <Resource><ObjectId>7</ObjectId><Name>Crane</Name></Resource>
</APIBusinessObjects>`
assert.equal(detectP6Format(xml), 'xml')
const pm = parseP6Xml(xml)
assert.equal(pm.activities.length, 3); assert.equal(pm.projectName, 'Demo Project'); assert.equal(pm.dataDate, '2026-01-11')
assert.equal(pm.activities[0].origDuration, 5); assert.equal(pm.activities[1].origDuration, 3)   // numeric hours and ISO PT24H
assert.equal(pm.activities[1].constraintType, 'MFO')
assert.equal(pm.relations.length, 2); assert.equal(pm.relations[1].type, 'SS'); assert.equal(pm.relations[1].lag, 1)
assert.ok(pm.issues.some((i) => /تکراری/.test(i.message))); assert.ok(pm.issues.some((i) => /شناخته نشد/.test(i.message)))
assert.deepEqual(pm.calendars[0].workDays, [0, 1, 2]); assert.deepEqual(pm.calendars[0].holidays, ['2026-01-12'])   // Thursday without worktime is a day off
assert.ok(pm.unsupported.some((u) => /منابع/.test(u)))
assert.equal(parseP6Xml('<a/>').issues[0].level, 'error')

// ── shared validation
const cyc = { ...px, relations: [{ predCode: 'A100', succCode: 'A200', type: 'FS', lag: 0 }, { predCode: 'A200', succCode: 'A100', type: 'FS', lag: 0 }] }
assert.ok(validateParsed(cyc).some((i) => i.level === 'error' && /چرخه/.test(i.message)))
console.log('scheduling/p6: all assertions passed')
