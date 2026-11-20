"""Engineering: the station's master document list (MDL) with issue / review cycles.
Target (data date): planned − actual = 10.0 points, computed exactly the way engCore does (credits 0.6 / 0.7 / 0.8 / 1)."""
from common import *

DISC = [  # code, discipline, [(category, title, weight)]
    ('GN', 'General', [('PRC', 'Project Execution Plan', 1.2), ('PRC', 'Document Numbering Procedure', 0.4), ('PRC', 'Engineering Design Basis', 1.6), ('LIS', 'Master Document Register (MDR)', 0.5), ('REP', 'Site Soil & Climate Data Report', 0.8), ('PRC', 'Interface Management Procedure', 0.5)]),
    ('PR', 'Process', [('PFD', 'Process Flow Diagram – Compressor Units', 2.0), ('PFD', 'Process Flow Diagram – Fuel Gas & Utilities', 1.2), ('PID', 'P&ID – Station Inlet & Scrubbers', 2.2), ('PID', 'P&ID – Turbo-Compressor Unit A', 2.2), ('PID', 'P&ID – Turbo-Compressor Unit B', 1.8), ('PID', 'P&ID – Turbo-Compressor Unit C (Stand-by)', 1.8), ('PID', 'P&ID – Gas Air Coolers', 1.8), ('PID', 'P&ID – Station Outlet & Metering', 1.8), ('PID', 'P&ID – Fuel Gas Conditioning Skid', 1.4), ('PID', 'P&ID – Blowdown & Vent System', 1.4), ('PID', 'P&ID – Instrument Air System', 1.0), ('PID', 'P&ID – Closed Drain System', 1.0), ('CAL', 'Station Hydraulic Simulation & Compressor Sizing', 2.4), ('CAL', 'Blowdown / Depressurisation Calculation', 1.4), ('CAL', 'Relief Valve Sizing Calculation', 1.2), ('DSH', 'Process Data Sheet – Inlet Scrubbers', 0.9), ('DSH', 'Process Data Sheet – Gas Air Coolers', 0.9), ('LIS', 'Line List', 1.0), ('LIS', 'Tie-in List', 0.6), ('REP', 'HAZOP Report', 1.8), ('REP', 'SIL Classification Report', 1.2), ('PRC', 'Operating Philosophy', 0.9), ('PRC', 'Cause & Effect Diagram', 1.2)]),
    ('ME', 'Mechanical', [('SPC', 'Specification – Gas Turbine Driven Centrifugal Compressor Package', 2.6), ('DSH', 'Data Sheet – Turbo-Compressor Package', 2.0), ('TBE', 'Technical Bid Evaluation – Turbo-Compressor', 1.6), ('SPC', 'Specification – Gas Air Coolers (API 661)', 1.4), ('TBE', 'Technical Bid Evaluation – Air Coolers', 1.0), ('SPC', 'Specification – Pressure Vessels', 1.2), ('DSH', 'Data Sheet – Filter Separators', 0.9), ('DSH', 'Data Sheet – Pig Launcher / Receiver', 0.8), ('SPC', 'Specification – Overhead Crane (Compressor House)', 0.7), ('DSH', 'Data Sheet – Instrument Air Compressors', 0.7), ('LIS', 'Mechanical Equipment List', 0.8), ('VDR', 'Vendor Document – Turbo-Compressor GA & Foundation Loads', 1.6), ('VDR', 'Vendor Document – Turbo-Compressor P&ID & Control Narrative', 1.4), ('VDR', 'Vendor Document – Air Cooler GA Drawings', 1.0), ('VDR', 'Vendor Document – Filter Separator GA', 0.8), ('PRC', 'Mechanical Run Test Procedure', 0.6)]),
    ('PP', 'Piping', [('LAY', 'Overall Plot Plan', 2.0), ('LAY', 'Piping General Arrangement – Compressor Area', 1.8), ('LAY', 'Piping General Arrangement – Cooler Area', 1.4), ('LAY', 'Piping General Arrangement – Inlet / Outlet Headers', 1.4), ('SPC', 'Piping Material Specification (Classes)', 1.6), ('SPC', 'Piping Painting & Insulation Specification', 0.8), ('CAL', 'Stress Analysis – Compressor Suction / Discharge', 1.8), ('CAL', 'Stress Analysis – Cooler Headers', 1.2), ('DWG', 'Isometric Drawings – Process Gas (Batch 1)', 1.2), ('DWG', 'Isometric Drawings – Process Gas (Batch 2)', 1.2), ('DWG', 'Isometric Drawings – Utilities', 0.9), ('MTO', 'Piping Material Take-Off (Final)', 1.0), ('LIS', 'Valve List', 0.7), ('DWG', 'Pipe Support Standard Drawings', 0.7), ('LIS', 'Special Piping Items List', 0.5), ('PRC', 'Hydrostatic Test Procedure & Test Pack Index', 0.9)]),
    ('CV', 'Civil', [('REP', 'Geotechnical Investigation Report', 1.4), ('CAL', 'Turbo-Compressor Foundation Design (Dynamic Analysis)', 2.0), ('DWG', 'Turbo-Compressor Foundation Drawings', 1.6), ('DWG', 'Air Cooler Foundation Drawings', 1.0), ('DWG', 'Equipment Foundations – Scrubbers & Vessels', 0.9), ('DWG', 'Site Grading & Drainage Plan', 1.0), ('DWG', 'Internal Roads & Paving', 0.8), ('DWG', 'Station Fence & Gate Details', 0.5), ('DWG', 'Underground Cable Trench & Duct Bank', 0.7), ('CAL', 'Pipe Rack Steel Structure Calculation', 1.0), ('DWG', 'Pipe Rack Steel Structure Drawings', 0.9), ('DWG', 'Compressor House Steel Structure', 1.2), ('SPC', 'Specification – Concrete Works', 0.6)]),
    ('AR', 'Architecture', [('DWG', 'Control Building – Architectural Drawings', 1.0), ('DWG', 'Electrical Substation Building – Architectural', 0.8), ('DWG', 'Workshop & Warehouse – Architectural', 0.6), ('DWG', 'Administration & Guard House', 0.5), ('DWG', 'Fire Station Building', 0.5)]),
    ('EL', 'Electrical', [('DIA', 'Overall Single Line Diagram (20 kV / 400 V)', 1.6), ('CAL', 'Load List & Load Flow / Short-Circuit Study', 1.4), ('SPC', 'Specification – Power Transformers', 0.8), ('SPC', 'Specification – MV Switchgear', 0.8), ('SPC', 'Specification – Emergency Diesel Generator', 0.7), ('SPC', 'Specification – UPS & Battery Charger', 0.6), ('DWG', 'Hazardous Area Classification Drawing', 1.0), ('DWG', 'Earthing & Lightning Protection Layout', 0.8), ('DWG', 'Cable Routing Layout', 0.8), ('LIS', 'Cable Schedule', 0.7), ('DWG', 'Area Lighting Layout', 0.6), ('VDR', 'Vendor Document – MV Switchgear', 0.6)]),
    ('IN', 'Instrument', [('SPC', 'Specification – DCS / ESD / F&G Systems', 1.6), ('DIA', 'Control System Architecture', 1.2), ('LIS', 'Instrument Index', 1.0), ('DSH', 'Instrument Data Sheets – Transmitters', 0.8), ('DSH', 'Control Valve Data Sheets', 0.9), ('SPC', 'Specification – Ultrasonic Metering Skid', 1.0), ('DWG', 'Instrument Location Layout', 0.7), ('DWG', 'Instrument Loop Diagrams', 0.9), ('DWG', 'Instrument Hook-up Drawings', 0.6), ('VDR', 'Vendor Document – Unit Control Panel (UCP)', 1.0), ('PRC', 'Functional Design Specification (FDS)', 1.0)]),
    ('TC', 'Telecom', [('SPC', 'Specification – Telecom & CCTV Systems', 0.6), ('DWG', 'Telecom & Fibre Optic Layout', 0.5), ('DIA', 'SCADA Interface Block Diagram', 0.6)]),
    ('SF', 'Safety', [('DWG', 'Fire & Gas Detector Layout', 0.9), ('DWG', 'Fire Water Network Layout', 0.9), ('CAL', 'Fire Water Demand Calculation', 0.7), ('REP', 'Fire & Explosion Risk Assessment', 1.0), ('DWG', 'Escape Route & Safety Equipment Layout', 0.5), ('REP', 'Environmental Impact Assessment (EIA)', 0.9)]),
    ('CP', 'Cathodic Protection', [('CAL', 'Cathodic Protection Design – Station Buried Piping', 0.7), ('DWG', 'Cathodic Protection Layout & Details', 0.5)]),
    ('HV', 'HVAC', [('CAL', 'HVAC Load Calculation – Control & Electrical Buildings', 0.6), ('DWG', 'HVAC Layout', 0.5)]),
    ('PC', 'Project Control', [('SCH', 'Level 3 Project Schedule (Baseline)', 1.0), ('WBS', 'WBS & Progress Measurement Procedure', 0.7), ('REP', 'Monthly Progress Report Template', 0.3)]),
]
# late-phase documents: planned after the winter (as-built, commissioning, manuals) — they carry the remaining plan
LATE = [('GN', 'General', 'PRC', 'Pre-commissioning & Commissioning Procedures', 1.2), ('GN', 'General', 'PRC', 'Operation & Maintenance Manuals', 1.0),
        ('PP', 'Piping', 'DWG', 'As-Built Isometric Drawings', 1.0), ('EL', 'Electrical', 'DWG', 'As-Built Electrical Drawings', 0.6),
        ('IN', 'Instrument', 'PRC', 'Loop Check & SAT Procedures', 0.8), ('PR', 'Process', 'PRC', 'Start-up & Gas-in Procedure', 0.9),
        ('ME', 'Mechanical', 'VDR', 'Vendor Document – Turbo-Compressor O&M Manual', 0.9), ('SF', 'Safety', 'REP', 'Pre-Start-up Safety Review (PSSR) Checklists', 0.6)]
CRED = {'first': 0.6, 'later': 0.7, 'noted': 0.8, 'approved': 1.0}

def build():
    docs = []
    n = 0
    for code, disc, items in DISC:
        for i, (cat, title, w) in enumerate(items):
            n += 1
            # planned: design docs from 1404/02 to 1405/06, vendor docs later; all approvals planned before the data date
            start = add(START, 30 + int(n * 3.1) + rnd.randint(-10, 10))
            if cat == 'VDR': start = add(start, 120)
            pp = min(start, D(2026, 9, 25)); pa = min(add(pp, rnd.randint(25, 45)), D(2026, 11, 15))
            docs.append(dict(key=f'{code}-{cat}-{i+1:03d}', no=f'HMD-CS-{code}-{cat}-{1000 + i * 10 + 1}', title=title, disc=disc, cat=cat, w=w, pp=pp, pa=pa,
                             phase='DP1' if cat not in ('VDR',) else 'VD1', critical=w >= 1.6 or 'Turbo' in title))
    for i, (code, disc, cat, title, w) in enumerate(LATE):
        pp = D(2027, 3, 10) + timedelta(days=i * 9); pa = add(pp, 30)
        docs.append(dict(key=f'{code}-{cat}-L{i+1:02d}', no=f'HMD-CS-{code}-{cat}-{9001 + i}', title=title, disc=disc, cat=cat, w=w, pp=pp, pa=pa, phase='DP2', critical=False))
    # a few design docs planned to be issued but not yet approved by the data date (credit 0.6 on the plan side)
    for x in docs:
        if x['cat'] in ('DWG', 'MTO') and 'Isometric' in x['title'] or x['title'].startswith('Vendor Document – Turbo-Compressor GA'):
            x['pp'] = D(2026, 10, 20); x['pa'] = D(2027, 3, 20)
    for x in docs:
        x['pp'], x['pa'] = safe(x['pp']), safe(x['pa'])
        if x['pa'] < x['pp']: x['pa'] = add(x['pp'], 20)
    return docs

def planned_credit(x): return 1.0 if x['pa'] <= TODAY else (0.6 if x['pp'] <= TODAY else 0.0)

def cycles_for(x, state):
    """state → issue/review history; returns (cycles, credit at the data date)"""
    pp = x['pp']; late = rnd.randint(5, 40)
    s1 = min(add(pp, late), add(TODAY, -3))
    if state == 'none': return [], 0.0
    if state == 'rev_a_pending': return [dict(seq=1, rev='A', purpose='IFR', on=s1, res='pending', ron=None)], CRED['first']
    if state == 'rejected_then_pending':
        s2 = min(add(s1, 28), add(TODAY, -2))
        return [dict(seq=1, rev='A', purpose='IFR', on=min(s1, add(s2, -20)), res='rejected', ron=min(add(s1, 10), add(s2, -5))), dict(seq=2, rev='B', purpose='IFR', on=s2, res='pending', ron=None)], CRED['first']
    if state == 'commented_b_pending':
        s2 = min(add(s1, 30), add(TODAY, -2))
        return [dict(seq=1, rev='A', purpose='IFR', on=min(s1, add(s2, -22)), res='commented', ron=min(add(s1, 12), add(s2, -4))), dict(seq=2, rev='B', purpose='IFA', on=s2, res='pending', ron=None)], CRED['later']
    if state == 'noted':
        s2 = min(add(s1, 25), add(TODAY, -8))
        return [dict(seq=1, rev='A', purpose='IFR', on=min(s1, add(s2, -20)), res='commented', ron=min(add(s1, 10), add(s2, -4))), dict(seq=2, rev='0', purpose='IFA', on=s2, res='approved_as_noted', ron=min(add(s2, 9), add(TODAY, -1)))], CRED['noted']
    if state == 'approved':
        s2 = min(add(s1, 24), add(TODAY, -10))
        return [dict(seq=1, rev='A', purpose='IFR', on=min(s1, add(s2, -18)), res='commented', ron=min(add(s1, 11), add(s2, -3))), dict(seq=2, rev='0', purpose='IFA', on=s2, res='approved', ron=min(add(s2, 8), add(TODAY, -2)))], CRED['approved']
    raise ValueError(state)

def calibrate(docs, gap_target=10.0):
    """assign each document a review state so that (planned − actual) hits the target to ±0.02 points"""
    W = sum(x['w'] for x in docs)
    planned = sum(x['w'] * planned_credit(x) for x in docs) / W * 100
    target_actual = planned - gap_target
    order = sorted(docs, key=lambda x: (x['pa'], x['no']))
    states = ['approved', 'noted', 'commented_b_pending', 'rev_a_pending', 'rejected_then_pending', 'none']
    credit = {'approved': 1, 'noted': .8, 'commented_b_pending': .7, 'rev_a_pending': .6, 'rejected_then_pending': .6, 'none': 0}
    # start: early docs approved, a mix in the middle, late ones not started
    for i, x in enumerate(order):
        f = i / len(order)
        if x['pp'] > TODAY: x['state'] = 'none'
        elif f < .55: x['state'] = 'approved' if rnd.random() < .9 else 'noted'
        elif f < .8: x['state'] = rnd.choice(['approved', 'noted', 'commented_b_pending', 'rev_a_pending'])
        else: x['state'] = rnd.choice(['rev_a_pending', 'rejected_then_pending', 'commented_b_pending', 'none'])
    act = lambda: sum(x['w'] * credit[x['state']] for x in docs) / W * 100
    # nudge: step documents up or down one state, most recent first, until the actual equals the target
    for _ in range(4000):
        a = act(); diff = target_actual - a
        if abs(diff) < 0.02: break
        cand = [x for x in reversed(order) if x['pp'] <= TODAY]
        if diff > 0:  # need more progress
            x = next((y for y in cand if states.index(y['state']) > 0 and y['w'] / W * 100 * (credit[states[states.index(y['state']) - 1]] - credit[y['state']]) <= diff + 0.02), None)
            if not x: break
            x['state'] = states[states.index(x['state']) - 1]
        else:
            x = next((y for y in order if y['pp'] <= TODAY and states.index(y['state']) < len(states) - 1 and y['w'] / W * 100 * (credit[y['state']] - credit[states[states.index(y['state']) + 1]]) <= -diff + 0.02), None)
            if not x: break
            x['state'] = states[states.index(x['state']) + 1]
    return planned, act()

def sql(value_rial: float = VALUE_E):
    docs = build()
    planned, actual = calibrate(docs)
    W = sum(x['w'] for x in docs)
    rows, cyc = [], []
    for x in docs:
        cs, _ = cycles_for(x, x['state'])
        x['id'] = U('eng/' + x['key'])
        rows.append(dict(id=x['id'], project_id=P, doc_no=x['no'], title=x['title'], discipline=x['disc'], rev='0', status='required' if not cs else 'in_preparation',
                         contract='HMD-EPC-01', preparer='دفتر مهندسی پیمانکار' if x['cat'] != 'VDR' else 'سازنده (Vendor)', approver='مشاور ناظر', weight=round(x['w'] / W * 100, 4),
                         planned_prepared=x['pp'], planned_approved=x['pa'], critical=x['critical'], category=x['cat'], phase=x['phase'], target_issue='IFC' if x['cat'] in ('DWG', 'LAY') else 'IFA',
                         price=round(value_rial * x['w'] / W), created_by=ME))
        for c in cs:
            cyc.append(dict(id=U(f"engc/{x['key']}/{c['seq']}"), project_id=P, doc_id=x['id'], seq=c['seq'], rev=c['rev'], purpose=c['purpose'], submitted_on=c['on'],
                            result=c['res'], result_on=c['ron'], result_by=CONS_PM if c['ron'] else None))
    out = ["-- engineering: master document list + issue/review cycles (cycles set the documents' status through ex_eng_cycle_sync)"]
    out += ins('ex_eng_docs', rows) + ins('ex_eng_doc_cycles', cyc)
    return out, dict(docs=len(rows), cycles=len(cyc), planned=round(planned, 2), actual=round(actual, 2), gap=round(planned - actual, 2))
