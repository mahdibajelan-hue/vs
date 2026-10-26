import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Cesium from 'cesium'
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { jointStageStateAsOf } from '../lib/jointHistory'
import { deriveFinalStatus } from '../lib/progressEngine'
import { cumulativeDistances, pointAtChainage } from '../lib/chainage'
import { PipelineViewer, type TwinMarker } from '../components/PipelineViewer'
import { Timeline } from '../components/Timeline'
import { ElevationProfile } from '../components/ElevationProfile'
import { JointPanel } from '../components/JointPanel'
import { VisualizationFilters } from '../components/VisualizationFilters'
import { RouteInfoBar } from '../components/RouteInfoBar'
import { LandLayerToggle } from '../components/LandLayerToggle'
import { PssrLayerToggle, PSSR_GAP_COLOR } from '../components/PssrLayerToggle'
import { ConstructionPanel } from '../components/ConstructionPanel'
import { EntryDrawer } from '../components/EntryDrawer'
import { AssetDrawer, AssetForm, AssetPanel } from '../components/AssetPanel'
import { OperationPanel, OP_COLOR } from '../components/OperationPanel'
import { ExecPanel } from '../components/ExecPanel'
import { CONDITION_COLOR, jointNoOfId, type Asset } from '../lib/twinCore'
import type { ProgressSpan } from '../lib/routeSegments'
import type { Official } from '../hooks/useOfficial'

const email = () => useAuthStore.getState().profile?.email ?? ''

/** `initialLayer` = which data layer to show on open (e.g. «نمایش روی دوقلوی دیجیتال» from the PSSR module opens with 'pssr'). */
export function DashboardPage({ initialLayer = null, official }: { initialLayer?: 'land' | 'pssr' | null; official: Official }) {
  const st = usePdtStore()
  const { route, pipe, joints, scrubDate, selectedJointId, selectJoint, statusFilter, setStatusFilter, lens, startKm } = st
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  // on a phone the map comes first: the role panel starts closed
  const [kpiOpen, setKpiOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 760)
  const [dockOpen, setDockOpen] = useState(true)
  // one data layer at a time: two colourings of the same pipe cannot be read together
  const [layer, setLayer] = useState<'land' | 'pssr' | null>(initialLayer)
  const [spansBy, setSpansBy] = useState<Partial<Record<'land' | 'pssr', ProgressSpan[] | null>>>({})
  const layerSpans = layer ? spansBy[layer] ?? null : null
  const toggle = (l: 'land' | 'pssr') => setLayer((cur) => (cur === l ? null : l))
  const [entry, setEntry] = useState<{ preset: number | null } | null>(null)
  const [assetForm, setAssetForm] = useState<Asset | 'new' | null>(null)

  // the operator reads the line by commissioning state; the other roles start on construction colours
  const firstLens = useRef(true)
  useEffect(() => {
    if (firstLens.current) { firstLens.current = false; return }
    setLayer(lens === 'operation' ? 'pssr' : null); setEntry(null); setAssetForm(null)
  }, [lens])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => usePdtStore.setState({ flash: null }), 2600); return () => clearTimeout(t) }, [st.flash])

  // Timeline scrubbing replays each joint's stage dates as of the scrubbed moment — the 3D pipe, joint markers, KPI
  // numbers and elevation dots all read the same set.
  const displayedJoints: Joint[] = useMemo(() => {
    if (!scrubDate) return joints
    return joints.map((j) => {
      const stage = jointStageStateAsOf(j, scrubDate)
      return { ...j, ...stage, finalStatus: deriveFinalStatus(stage), history: j.history.filter((h) => h.at <= scrubDate) }
    })
  }, [joints, scrubDate])

  const selectedJoint = displayedJoints.find((j) => j.id === selectedJointId) ?? null
  const selectedAsset = st.assets.find((a) => a.id === st.selectedAssetId) ?? null
  const cumulative = useMemo(() => cumulativeDistances(route.points), [route.points])
  const selectedJointContext = useMemo(() => {
    if (!selectedJoint) return null
    const idx = jointNoOfId(selectedJoint.id) - 1
    return { position: pointAtChainage(route.points, cumulative, selectedJoint.chainageMeters), prevJointNumber: idx > 0 ? displayedJoints[idx - 1].jointNumber : null, nextJointNumber: idx < displayedJoints.length - 1 ? displayedJoints[idx + 1].jointNumber : null }
  }, [selectedJoint, displayedJoints, route.points, cumulative])

  const markers: TwinMarker[] = useMemo(() => st.assets.map((a) => ({
    id: `a-${a.id}`, meters: (a.km - startKm) * 1000, label: a.tag,
    color: lens === 'operation' && a.kind === 'valve' ? OP_COLOR[a.opState] : CONDITION_COLOR[a.condition],
    size: a.id === st.selectedAssetId ? 18 : lens === 'assets' || lens === 'operation' ? 14 : 10,
  })), [st.assets, st.selectedAssetId, lens, startKm])
  const focusMeters = selectedAsset ? (selectedAsset.km - startKm) * 1000 : null
  const onPick = (id: string | null) => { if (id?.startsWith('a-')) st.selectAsset(id.slice(2)); else selectJoint(id) }

  const leftDrawer = entry ? <EntryDrawer presetJoint={entry.preset} onClose={() => setEntry(null)} />
    : assetForm ? <AssetForm asset={assetForm === 'new' ? null : assetForm} onClose={(saved) => { setAssetForm(null); if (saved) st.selectAsset(saved.id) }} />
    : selectedAsset ? <AssetDrawer key={selectedAsset.id} asset={selectedAsset} onEdit={() => setAssetForm(selectedAsset)} onClose={() => st.selectAsset(null)} />
    : null
  const construction = lens === 'construction'

  return (
    <div className="tw relative h-full w-full" data-lens={lens} style={{ '--tw-ctrl-right': kpiOpen ? '25.25rem' : '3.5rem' } as React.CSSProperties}>
      <div className="absolute inset-0">
        <PipelineViewer
          route={route} pipe={pipe} joints={displayedJoints} selectedJointId={selectedJointId} statusFilter={statusFilter}
          onSelectJoint={onPick} layerSpans={layerSpans} layerGapColor={layer === 'pssr' ? PSSR_GAP_COLOR : null}
          markers={markers} focusMeters={focusMeters}
          onViewerReady={(v) => { viewerRef.current = v }}
        />
      </div>

      {!leftDrawer && !selectedJoint && (
        <div className="absolute left-3 top-3 z-10 flex flex-col items-end gap-2" style={{ maxWidth: kpiOpen ? 'calc(100% - 24rem)' : 'calc(100% - 4rem)' }}>
          {construction && !layer && <VisualizationFilters joints={displayedJoints} value={statusFilter} onChange={setStatusFilter} />}
          <LandLayerToggle on={layer === 'land'} onToggle={() => toggle('land')} onSpans={(s) => setSpansBy((m) => ({ ...m, land: s }))} />
          <PssrLayerToggle on={layer === 'pssr'} onToggle={() => toggle('pssr')} onSpans={(s) => setSpansBy((m) => ({ ...m, pssr: s ? s.map((x) => ({ ...x, startMeters: x.startMeters - startKm * 1000, endMeters: x.endMeters - startKm * 1000 })) : null }))} />
        </div>
      )}

      {!selectedJoint && !leftDrawer && !(construction && dockOpen) && <RouteInfoBar route={route} pipe={pipe} />}

      {leftDrawer}
      {!leftDrawer && selectedJoint && selectedJointContext && (
        <JointPanel
          joint={selectedJoint} pipe={pipe} position={selectedJointContext.position} startKm={startKm}
          prevJointNumber={selectedJointContext.prevJointNumber} nextJointNumber={selectedJointContext.nextJointNumber}
          editable={!scrubDate} onUpdate={(field, value) => void st.updateJointField(selectedJoint.id, field, value, email())}
          onClose={() => selectJoint(null)} onEntryFrom={(no) => { selectJoint(null); setEntry({ preset: no }) }}
        />
      )}

      {/* role panel — floats over the right edge of the map and slides away so the map can use the whole width */}
      <div className={`absolute inset-y-3 right-3 z-30 w-[21rem] max-w-[calc(100%-1.5rem)] transition-transform duration-300 ${kpiOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}>
        {lens === 'construction' ? <ConstructionPanel joints={displayedJoints} official={official} onEntry={() => { selectJoint(null); st.selectAsset(null); setEntry({ preset: null }) }} />
          : lens === 'assets' ? <AssetPanel onNew={() => { st.selectAsset(null); setAssetForm('new') }} />
          : lens === 'operation' ? <OperationPanel official={official} />
          : <ExecPanel official={official} />}
      </div>
      <button
        onClick={() => setKpiOpen((v) => !v)}
        title={kpiOpen ? 'بستن پنل' : 'بازکردن پنل'} aria-label={kpiOpen ? 'بستن پنل' : 'بازکردن پنل'}
        className={`absolute top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[rgba(10,14,20,0.85)] text-white/80 backdrop-blur-md transition-[right] duration-300 hover:bg-white/10 ${kpiOpen ? 'right-[22.5rem]' : 'right-3'}`}
      >
        <ChevronLeft size={14} className={`transition-transform ${kpiOpen ? '' : 'rotate-180'}`} />
      </button>

      {construction && !leftDrawer && (
        <div className={`tw-dock absolute bottom-3 left-3 z-20 flex flex-col items-center gap-2 ${kpiOpen ? 'is-squeezed' : ''}`} style={{ right: kpiOpen ? '23rem' : '0.75rem' }}>
          {dockOpen && (
            <div className="flex w-full flex-col gap-2">
              <ElevationProfile route={route} joints={displayedJoints} />
              <Timeline />
            </div>
          )}
          <button
            onClick={() => setDockOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(10,14,20,0.85)] px-4 py-1 text-[10px] font-medium text-white/80 backdrop-blur-md hover:bg-white/10"
          >
            {dockOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {dockOpen ? 'بستن پروفایل و جدول زمانی' : 'نمایش پروفایل و جدول زمانی'}
          </button>
        </div>
      )}
      {st.flash && <div className="tw-flash" role="status">{st.flash}</div>}
      {st.error && <button type="button" className="tw-flash" role="alert" style={{ background: '#fecaca', color: '#7f1d1d' }} onClick={() => usePdtStore.setState({ error: null })}>{st.error} ✕</button>}
    </div>
  )
}
