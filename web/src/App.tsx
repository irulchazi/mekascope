import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Activity, Aperture, ArrowLeft, ArrowRight, BookOpen, Boxes, Camera, Check, CircleCheck, ClipboardCheck, Clock3, Crosshair, Factory, Gauge, History, Info, LockKeyhole, Maximize2, PackageCheck, RotateCcw, ScanLine, Sparkles, Wrench } from 'lucide-react'
import { api, ApiError, imageUrl, type Annotation, type Case, type Catalog, type Pump, type Step } from './api'
import { stages, type BikeStage, type Stage } from './data'
import PhotoViewer from './PhotoViewer'
import { AnnotationBoxes, PhotoComponents, useContainedPhoto } from './PhotoAnnotations'
import ScanResultCard from './ScanResultCard'

const storageKey = 'mekascope-case-v2'
function readSaved(): { id: string | null; stage: Stage } {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('case')) {
      const requested = params.get('stage') as Stage
      return { id: params.get('case'), stage: [...stages.map(s => s.id), 'factory'].includes(requested) ? requested : 'act' }
    }
    const value = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    return { id: typeof value.id === 'string' ? value.id : null, stage: [...stages.map(s => s.id), 'factory'].includes(value.stage) ? value.stage : 'observe' }
  } catch { return { id: null, stage: 'observe' } }
}
const icons = [ScanLine, Boxes, Activity, Crosshair, ClipboardCheck]
const copy: Record<BikeStage, [string, string]> = {
  observe: ['Start with what you see.', 'Upload a bicycle photo and describe what you notice.'],
  understand: ['The part has a place.', 'Recognition connects the visible component to the context you provide.'],
  investigate: ['Follow the evidence.', 'Compare possible causes against the photo, symptoms, and available history.'],
  verify: ['Test the leading cause.', 'Confirm the guided checks and optionally add findings or another photo.'],
  act: ['Turn insight into work.', 'Review the recommendation before approving a maintenance task.'],
}
function Label({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return <div className="section-label"><span>{children}</span>{end}</div>
}
function Frame({ src, annotations = [], pending = false, preview = false, fitted = false, zoomable = false }: { src: string; annotations?: Annotation[]; pending?: boolean; preview?: boolean; fitted?: boolean; zoomable?: boolean }) {
  const { frame, photo, bounds } = useContainedPhoto(imageUrl(src), fitted && annotations.length > 0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null)
  useEffect(() => { setActiveAnnotation(null) }, [src, annotations.length])
  const selectedAnnotation = activeAnnotation !== null && activeAnnotation < annotations.length ? activeAnnotation : null
  return <figure className="photo-figure"><div ref={frame} className={`visual-frame live-frame ${pending ? 'is-scanning' : ''}`}>
    <img ref={photo} src={imageUrl(src)} alt={preview ? 'Prepared industrial pump preview' : 'Bicycle inspection photo'} />
    <div className="visual-shade" />
    <span className="frame-corner corner-tl" /><span className="frame-corner corner-tr" /><span className="frame-corner corner-bl" /><span className="frame-corner corner-br" />
    <div className="frame-topline"><span><span className="record-dot" /> {preview ? 'PREPARED PREVIEW' : 'INSPECTION PHOTO'}</span></div>
    {pending && <span className="scan-beam" aria-hidden="true" />}
    <AnnotationBoxes annotations={annotations} selectedAnnotation={selectedAnnotation} bounds={bounds} />
    {zoomable && <button type="button" className="photo-expand" aria-label="Enlarge inspection photo" onClick={() => setViewerOpen(true)}><span><Maximize2 size={16} /> Enlarge photo</span></button>}
  </div>{annotations.length > 0 && <figcaption><PhotoComponents annotations={annotations} selectedAnnotation={selectedAnnotation} selectAnnotation={setActiveAnnotation} /></figcaption>}{viewerOpen && <PhotoViewer src={imageUrl(src)} annotations={annotations} selectedAnnotation={selectedAnnotation} selectAnnotation={setActiveAnnotation} close={() => setViewerOpen(false)} />}</figure>
}
function PhotoPicker({ label, photo, required = false, disabled = false, onChange }: { label: string; photo: File | null; required?: boolean; disabled?: boolean; onChange: (photo: File | null) => void }) {
  const uploadInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!photo) {
      if (uploadInput.current) uploadInput.current.value = ''
      if (cameraInput.current) cameraInput.current.value = ''
    }
  }, [photo])
  return <div className="photo-picker">
    <label>{label}<input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" required={required && !photo} disabled={disabled} onChange={e => onChange(e.target.files?.[0] || null)} /></label>
    <div className="photo-picker-actions"><button type="button" className="secondary-button" disabled={disabled} onClick={() => cameraInput.current?.click()}><Camera size={16} /> Take photo</button><small>{photo ? photo.name : 'JPEG, PNG, WebP, or HEIC/HEIF · up to 10 MiB'}</small></div>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={e => onChange(e.target.files?.[0] || null)} />
  </div>
}
function StepForm({ step, disabled, save }: { step: Step; disabled: boolean; save: (body: FormData) => Promise<boolean> }) {
  const [observation, setObservation] = useState(step.observation)
  const [photo, setPhoto] = useState<File | null>(null)
  return <form className={`verify-step live-step ${step.completed ? 'is-complete' : 'is-current'}`} onSubmit={async event => {
    event.preventDefault()
    const body = new FormData()
    body.set('completed', 'true'); body.set('observation', observation)
    if (photo) body.set('image', photo)
    if (await save(body)) setPhoto(null)
  }}>
    <span className="verify-step-index">{step.completed ? <Check size={15} /> : <Crosshair size={15} />}</span>
    <div className="step-fields"><strong>{step.title}</strong><p>{step.instruction}</p>
      <label>Observations (optional)<textarea aria-label={`Observations: ${step.title}`} maxLength={4000} value={observation} onChange={e => setObservation(e.target.value)} disabled={disabled} /></label>
      <PhotoPicker label="Follow-up photo (optional)" photo={photo} disabled={disabled} onChange={setPhoto} />
      {step.image_url && <a href={imageUrl(step.image_url)} target="_blank" rel="noreferrer">View saved evidence photo</a>}
      <button className="secondary-button" disabled={disabled}>{step.completed ? 'Save check' : 'Confirm check completed'} <Check size={15} /></button>
    </div>
  </form>
}
function PumpPreview({ pump, back }: { pump: Pump; back: () => void }) {
  return <>
    <div className="page-heading"><div className="eyebrow">INDUSTRIAL PREVIEW</div><h1>Same reasoning.<br /><em>Different machine.</em></h1><p>A prepared example of the observe-to-action workflow at industrial scale.</p></div>
    <div className="factory-hero"><Frame src={pump.image} preview /><div className="factory-hero-strip"><div><span>ASSET</span><strong>Pump {pump.id}</strong></div><div><span>SYMPTOM</span><strong>{pump.symptom}</strong></div><div><span>PRIORITY</span><strong className="amber-text">{pump.severity}</strong></div></div></div>
    <div className="factory-preview-grid"><div className="panel factory-diagnosis"><Label end={<span className="sample-tag">STATIC PREVIEW</span>}>EVIDENCE-LED DIAGNOSIS</Label><div className="diagnosis-label">LIKELY CAUSE</div><h2>{pump.diagnosis}</h2><div className="confidence-bar"><span style={{ width: `${pump.confidence}%` }} /></div><div className="confidence-row"><strong>{pump.confidence}% prepared estimate</strong><span>{pump.severity} severity</span></div><p className="muted-copy">Prepared pump data illustrates the workflow. No live analysis is performed here.</p></div>
    <div className="panel factory-action"><Label>HUMAN-APPROVED ACTION</Label><div className="action-icon"><Wrench size={20} /></div><h3>{pump.action}</h3><div className="factory-facts"><span><PackageCheck size={16} /> {pump.inventory}</span><span><Clock3 size={16} /> {pump.duration}</span></div><span className="preview-caption">Preview only; no work order is created.</span></div></div>
    <div className="translation-card"><div><span className="section-kicker">ONE EQUIPMENT MODEL</span><h3>From bicycle to production line</h3></div><div className="translation-flow"><span>Component</span><ArrowRight size={15} /><span>Context</span><ArrowRight size={15} /><span>Evidence</span><ArrowRight size={15} /><span>Action</span></div></div>
    <button className="text-button back-to-bike" onClick={back}><ArrowLeft size={16} /> Back to bicycle case</button>
  </>
}

export default function App() {
  const [saved] = useState(readSaved)
  const [caseId, setCaseId] = useState(saved.id)
  const activeId = useRef(saved.id)
  const [stage, setStage] = useState<Stage>(saved.stage)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [current, setCurrent] = useState<Case | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState('')
  const running = useRef(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState<'sample' | 'upload'>('sample')
  const [symptom, setSymptom] = useState('')
  const [configuration, setConfiguration] = useState('')
  const [service, setService] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [previewPending, setPreviewPending] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [outcomeNotes, setOutcomeNotes] = useState('')

  function adopt(value: Case) { setCurrent(value); setCaseId(value.id); activeId.current = value.id }
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    async function load() {
      try {
        const data = await api.catalog()
        if (cancelled) return
        setCatalog(data)
        if (!activeId.current) setSymptom(data.bicycle.symptom)
        if (activeId.current) {
          try {
            const value = await api.getCase(activeId.current)
            if (cancelled) return
            adopt(value)
            setStage(s => s === 'factory' || value.available_stages.includes(s) ? s : 'observe')
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
              activeId.current = null; setCaseId(null); setCurrent(null); setStage('observe'); setSymptom(data.bicycle.symptom)
            } else throw e
          }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the workspace.') }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [reload])
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ id: caseId, stage })) } catch { /* API progress remains available. */ }
  }, [caseId, stage])
  useEffect(() => {
    setPreview(''); setPreviewError(''); setPreviewPending(false)
    if (!file) return
    const controller = new AbortController()
    let url = ''
    let active = true
    async function prepare(selectedFile: File) {
      setPreviewPending(true)
      try {
        if (selectedFile.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MiB.')
        const heif = /\.(heic|heif)$/i.test(selectedFile.name) || /^image\/hei[cf]/i.test(selectedFile.type)
        const image = heif ? await api.previewImage(selectedFile, controller.signal) : selectedFile
        if (active) { url = URL.createObjectURL(image); setPreview(url) }
      } catch (error) {
        if (active) setPreviewError(error instanceof Error ? error.message : 'Could not prepare this photo. Please try again.')
      } finally { if (active) setPreviewPending(false) }
    }
    void prepare(file)
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [file])
  useEffect(() => {
    if (!current?.operation || pending) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void api.getCase(current.id).then(value => { if (!cancelled) { adopt(value); setError('') } }).catch(e => { if (!cancelled) setError(e.message) })
    }, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [current?.operation, current?.id, pending])

  const busy = !!pending || !!current?.operation
  function changeStage(next: Stage) {
    if (next !== 'factory' && next !== 'observe' && !current?.available_stages.includes(next)) return
    const url = new URL(window.location.href)
    if (url.searchParams.has('case')) {
      url.searchParams.set('stage', next)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
    setStage(next)
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  function restart() {
    if (busy) return
    window.history.replaceState(null, '', '/')
    activeId.current = null; setCaseId(null); setCurrent(null); setStage('observe'); setError('')
    setFile(null); setSource('sample'); setSymptom(catalog?.bicycle.symptom || ''); setConfiguration(''); setService(''); setOutcomeNotes('')
  }
  async function run(label: string, work: () => Promise<Case>, next?: Stage): Promise<boolean> {
    if (running.current || current?.operation) return false
    running.current = true; setPending(label); setError('')
    try { const value = await work(); adopt(value); if (next) setStage(next); return true }
    catch (e) {
      setError(e instanceof Error ? e.message : 'The operation failed. Please retry.')
      if (activeId.current) {
        try { adopt(await api.getCase(activeId.current)) } catch { /* Keep the last saved view. */ }
      }
      return false
    } finally { running.current = false; setPending('') }
  }
  async function startScan() {
    if (previewPending || previewError) return
    await run('Analyzing bicycle photo…', async () => {
      let value = current
      if (!value) {
        if (source === 'upload' && !file) throw new Error('Choose a bicycle photo first.')
        if (file && file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MiB.')
        const body = new FormData()
        body.set('source', source); body.set('symptom', symptom); body.set('configuration', configuration); body.set('service', service)
        if (source === 'upload' && file) body.set('image', file)
        value = await api.createCase(body); adopt(value)
      }
      return api.analyze(value.id, 'scan')
    })
  }

  const isFactory = stage === 'factory'
  const bikeStage: BikeStage = isFactory ? 'observe' : stage
  const scan = current?.scan
  const investigation = current?.investigation
  const verification = current?.verification
  const task = current?.task
  const assetName = current?.context.name || (source === 'sample' ? catalog?.bicycle.context.name : 'Uploaded bicycle') || 'Bicycle inspection'
  const photo = current?.image_url || (source === 'upload' ? preview : catalog?.bicycle.image) || ''
  const note = isFactory ? 'The industrial page uses prepared sample results.' : task?.status === 'resolved' ? 'The reported outcome is saved with this case.' : verification?.summary || investigation?.summary || scan?.summary || <>Start with a photo and a symptom.<br />Equipment and service context are optional.</>

  const equipmentProfile = <div className="context-card"><Label end={<span className="context-live"><span /> {isFactory ? 'PREVIEW' : 'Bicycle'}</span>}>EQUIPMENT PROFILE</Label><div className="asset-summary"><span className="asset-icon">{isFactory ? <Factory size={22} /> : <Gauge size={22} />}</span><div><strong>{isFactory ? `Pump ${catalog?.pump.id || ''}` : assetName}</strong><small>{isFactory ? catalog?.pump.location : scan?.equipment || 'Bicycle inspection'}</small></div></div><div className="context-divider" /><div className="context-rows"><div><span>Component</span><strong>{isFactory ? catalog?.pump.component : scan?.component || 'Not yet identified'}</strong></div><div><span>Model</span><strong>{isFactory ? 'Static preview' : scan?.model || 'Unknown'}</strong></div><div><span>History</span><strong>{isFactory ? 'Prepared' : current?.context.service ? current.context.source === 'sample' ? 'Sample context' : 'User supplied' : 'Not supplied'}</strong></div></div></div>
  const agentNote = <div className="agent-note"><div className="agent-note-icon"><Sparkles size={18} /></div><span className="section-kicker">AGENT NOTE</span><p>{note}</p><div className="note-bottom"><span className="mini-pulse" /> {isFactory ? 'STATIC INDUSTRIAL PREVIEW' : 'PERSISTED CASE WORKFLOW'}</div></div>
  const contextAvailable = <div className="data-card"><Label>CONTEXT AVAILABLE</Label><div><span><Boxes size={15} /> Equipment photo</span>{photo && <CircleCheck size={14} />}</div><div><span><BookOpen size={15} /> Configuration</span>{current?.context.configuration ? <CircleCheck size={14} /> : <span>Unknown</span>}</div><div><span><History size={15} /> Service history</span>{current?.context.service ? <CircleCheck size={14} /> : <span>Unknown</span>}</div><small>Only supplied context is used in analysis.</small></div>

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={restart} disabled={busy || loading} aria-label="MekaScope, new case"><span className="brand-mark"><Aperture size={24} /></span><span className="brand-name">meka<span>scope</span><small>MECHANICAL INTELLIGENCE</small></span></button><div className="topbar-right"><span className="topbar-edition">BICYCLE INSPECTION</span><span className="simulation-badge"><span className="badge-dot" /> {isFactory ? 'STATIC PREVIEW' : 'GEMINI ANALYSIS'}</span></div></header>
    <div className={`workspace ${stage === 'observe' ? 'workspace--observe' : ''}`}>
      <nav className="sidebar" aria-label="Inspection workflow"><div className="sidebar-heading">THE WORKFLOW <span>01—05</span></div><div className="stage-list">{stages.map((s, index) => {
        const Icon = icons[index]; const locked = s.id !== 'observe' && !current?.available_stages.includes(s.id)
        return <button key={s.id} className={`stage-button ${stage === s.id ? 'is-active' : ''}`} disabled={locked || loading || !!pending} onClick={() => changeStage(s.id)} aria-current={stage === s.id ? 'step' : undefined}><span className="stage-icon"><Icon size={17} /></span><span className="stage-text"><b>{s.label}</b><small>{s.description}</small></span><span className="stage-status">{locked ? <LockKeyhole size={12} /> : s.number}</span></button>
      })}</div><div className="sidebar-lower"><a className="factory-link maintenance-nav-link" href="/maintenance"><span className="factory-link-icon"><ClipboardCheck size={19} /></span><span><b>Maintenance board</b><small>Track approved tasks</small></span><ArrowRight size={15} /></a><div className="sidebar-heading">BEYOND THE BIKE</div><button className={`factory-link ${isFactory ? 'is-active' : ''}`} disabled={loading || !!pending} onClick={() => changeStage('factory')}><span className="factory-link-icon"><Factory size={19} /></span><span><b>Factory preview</b><small>Same intelligence, new scale</small></span><ArrowRight size={15} /></button><div className="sidebar-foot"><span className="mini-pulse" /> HUMAN-REVIEWED WORKFLOW</div></div></nav>
      <main className="main-content" id="main-content" aria-busy={loading || busy}>
        <div className="main-topline"><span>WORKSPACE / {isFactory ? 'INDUSTRIAL PREVIEW' : current ? `CASE ${current.id.slice(0, 8)}` : 'NEW CASE'}</span><span>{isFactory ? 'PREVIEW MODE' : 'BICYCLE'}</span></div>
        {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span>{(!catalog || (caseId && !current)) && <button className="secondary-button" onClick={() => setReload(n => n + 1)}>Retry connection</button>}</div>}
        {loading ? <div className="progress-card" role="status"><span className="spinner" /> Loading workspace…</div> : catalog && (!caseId || current) ? <>
          {(busy || current?.last_error) && <div className="progress-card" role="status" aria-live="polite">{busy && <span className="spinner" />}<span>{pending || (current?.operation ? `Running ${current.operation}…` : current?.last_error)}</span></div>}
          {isFactory ? <PumpPreview pump={catalog.pump} back={() => changeStage(current?.verification ? 'act' : current?.scan?.recognized ? 'understand' : 'observe')} /> : <>
            <div className="page-heading"><div className="eyebrow">{stages.find(s => s.id === stage)?.number} / {stage.toUpperCase()}</div><h1>{copy[bikeStage][0]}</h1><p>{copy[bikeStage][1]}</p></div>
            {stage === 'observe' && <div className="inspection-layout">
              <div className="inspection-preview">{photo ? <Frame src={photo} fitted zoomable annotations={scan?.recognized ? scan.annotations : []} pending={pending.includes('photo') || current?.operation === 'scan'} /> : <div className="photo-placeholder" role={previewError ? 'alert' : 'status'}>{previewPending ? <span className="spinner" /> : <ScanLine size={40} />}<p>{previewPending ? 'Preparing photo preview…' : previewError || 'Choose a bicycle photo to begin.'}</p></div>}</div>
              <div className="inspection-context" aria-label="Equipment context">{equipmentProfile}{contextAvailable}{agentNote}</div>
              {!current && <form className="panel intake-form" onSubmit={e => { e.preventDefault(); void startScan() }}>
                <fieldset disabled={busy}><legend>Inspection input</legend><div className="source-picker"><label><input type="radio" name="source" checked={source === 'sample'} onChange={() => { setSource('sample'); setFile(null); setSymptom(catalog.bicycle.symptom) }} /> Sample bicycle</label><label><input type="radio" name="source" checked={source === 'upload'} onChange={() => { setSource('upload'); setSymptom(''); setConfiguration(''); setService('') }} /> Upload photo</label></div>
                {source === 'upload' && <PhotoPicker label="Bicycle photo" photo={file} required disabled={busy} onChange={setFile} />}
                <label>What do you notice?<textarea required maxLength={4000} value={symptom} onChange={e => setSymptom(e.target.value)} /></label>
                <details><summary>Equipment and service context (optional)</summary><label>Configuration notes<textarea maxLength={4000} value={configuration} onChange={e => setConfiguration(e.target.value)} /></label><label>Service history notes<textarea maxLength={4000} value={service} onChange={e => setService(e.target.value)} /></label>{source === 'sample' && <p className="muted-copy">Prepared configuration and service history accompany the sample photo.</p>}</details>
                <button className="primary-button" disabled={busy || previewPending || !!previewError || !symptom.trim()}><ScanLine size={17} /> Analyze photo <ArrowRight size={17} /></button></fieldset>
              </form>}
              {current && <div className="input-card"><div><span className="section-kicker">REPORTED SYMPTOM</span><p>{current.symptom}</p></div><span className="sample-tag">{current.context.source === 'sample' ? 'SAMPLE INPUT' : 'USER INPUT'}</span></div>}
              {current && !scan && <div className="action-row"><p>Your case is saved. Run or retry image recognition.</p><button className="primary-button" disabled={busy} onClick={() => void startScan()}>Analyze photo <ArrowRight size={17} /></button></div>}
              {scan && <ScanResultCard scan={scan} explore={() => changeStage('understand')} restart={restart} />}
            </div>}
            {stage === 'understand' && current && scan && <>
              <div className="understand-grid"><div className="image-panel"><Frame src={current.image_url} annotations={scan.annotations} /></div><div className="panel component-card"><Label end={<span className="confidence-pill">{scan.confidence}% ESTIMATE</span>}>IDENTIFIED COMPONENT</Label><div className="component-glyph"><Boxes size={25} /></div><h2>{scan.component}</h2><p>{scan.model || 'Exact model unknown'}</p><div className="component-line" /><p>{scan.summary}</p></div></div>
              <div className="detail-grid"><div className="panel detail-panel"><Label>EQUIPMENT CONFIGURATION</Label><p className="muted-copy">{current.context.configuration || 'No configuration supplied.'}</p></div><div className="panel detail-panel"><Label>SERVICE HISTORY</Label><p className="muted-copy">{current.context.service || 'No service history supplied.'}</p><span className="sample-tag">{current.context.source === 'sample' ? 'PREPARED SAMPLE CONTEXT' : 'USER-SUPPLIED CONTEXT'}</span></div></div>
              <div className="symptom-action"><div><span className="section-kicker">INVESTIGATE THE SYMPTOM</span><p>{current.symptom}</p></div><button className="primary-button" disabled={busy} onClick={() => { changeStage('investigate'); if (!investigation) void run('Comparing possible causes…', () => api.analyze(current.id, 'investigate')) }}>Investigate issue <ArrowRight size={17} /></button></div>
            </>}
            {stage === 'investigate' && current && <>
              <div className="investigation-intro"><span className="pulse-ring"><Sparkles size={19} /></span><div><span className="section-kicker">GEMINI INVESTIGATION</span><h2>{investigation?.summary || 'Compare the available evidence.'}</h2></div></div>
              {investigation ? <>
                <div className="investigation-grid"><div className="panel sources-panel"><Label>CONTEXT SOURCES</Label><div className="source-list">{investigation.sources.map((s, i) => <div className={`source-item ${s.status !== 'missing' ? 'is-done' : ''}`} key={i}><span className="source-icon"><BookOpen size={18} /></span><div><strong>{s.label} · {s.status}</strong><small>{s.detail}</small></div>{s.status === 'missing' ? <Info size={16} /> : <Check size={16} />}</div>)}</div></div><div className="panel evidence-panel"><Label>OBSERVED AND INFERRED EVIDENCE</Label><div className="evidence-list">{investigation.evidence.map((e, i) => <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{e.text}<small className="evidence-source">{e.source}</small></p></div>)}</div></div></div>
                <div className="panel hypotheses-panel"><Label end={<span className="section-hint">RANKED, NOT FINAL</span>}>POSSIBLE CAUSES</Label><div className="hypothesis-list">{investigation.hypotheses.map((h, i) => <div key={i}><div className={`hypothesis-row ${i === 0 ? 'primary' : ''}`}><div className="hypothesis-name"><span className="hypothesis-marker" /><strong>{h.name}</strong>{i === 0 && <span className="leading-tag">LEADING</span>}</div><div className="hypothesis-track"><span style={{ width: `${h.confidence}%` }} /></div><b>{h.confidence}%</b></div><p className="hypothesis-reason">{h.reasoning}</p></div>)}</div><div className="hypotheses-footer"><span><Info size={15} /> Model estimates, not measured probabilities.</span><button className="primary-button" onClick={() => changeStage('verify')}>Verify leading cause <ArrowRight size={17} /></button></div></div>
              </> : <div className="action-row"><p>Investigate the image and supplied context.</p><button className="primary-button" disabled={busy} onClick={() => void run('Comparing possible causes…', () => api.analyze(current.id, 'investigate'))}>Run investigation <ArrowRight size={17} /></button></div>}
            </>}
            {stage === 'verify' && current && investigation && <>
              <div className="verification-banner"><span><Crosshair size={18} /> GUIDED INSPECTION</span><p>Confirm each check. Findings and follow-up photos are optional.</p></div><Frame src={current.image_url} annotations={scan?.annotations} />
              <div className="verify-grid"><div className="panel verify-steps"><Label>INSPECTION STEPS</Label>{current.steps.map(step => <StepForm key={step.id} step={step} disabled={busy || !!verification} save={body => run('Saving verification evidence…', () => api.saveStep(current.id, step.id, body))} />)}</div><div className="panel confidence-panel"><Label>DIAGNOSIS CONFIDENCE</Label><div className="confidence-comparison"><div><span>BEFORE CHECK</span><strong>{investigation.hypotheses[0]?.confidence}<small>%</small></strong></div><ArrowRight size={23} /><div className={`confidence-after ${verification ? 'is-confirmed' : ''}`}><span>AFTER CHECK</span><strong>{verification?.confidence ?? '—'}<small>{verification ? '%' : ''}</small></strong></div></div><p>{verification?.summary || 'Confidence may increase, decrease, or remain unchanged after review.'}</p><p className="muted-copy">A confirmation records that you performed a check. Only supplied findings can establish its outcome.</p></div></div>
              <div className="next-strip"><div><CircleCheck size={19} /><span>{verification ? `Review complete: ${verification.conclusion}.` : 'Confirm all checks, then reassess the diagnosis.'}</span></div>{verification ? <button className="primary-button" onClick={() => changeStage('act')}>Review action plan <ArrowRight size={17} /></button> : <button className="primary-button" disabled={busy || !current.steps.every(s => s.completed)} onClick={() => void run('Reassessing the diagnosis…', () => api.analyze(current.id, 'verify'))}>Reassess diagnosis <ArrowRight size={17} /></button>}</div>
            </>}
            {stage === 'act' && current && verification && <>
              <div className="diagnosis-hero"><div className="diagnosis-hero-top"><span><CircleCheck size={17} /> {verification.conclusion.toUpperCase()}</span><span className="sample-tag">AI RECOMMENDATION</span></div><div className="diagnosis-hero-main"><div><span className="section-kicker">PROBABLE CAUSE</span><h2>{verification.diagnosis}</h2><p>{verification.summary}</p></div><div className="diagnosis-score"><strong>{verification.confidence}<span>%</span></strong><small>ESTIMATED CONFIDENCE</small></div></div><div className="diagnosis-hero-bottom"><span>{verification.severity.toUpperCase()} SEVERITY</span><span>Human review required</span></div></div>
              <div className="act-grid"><div className="panel recommendation-panel"><Label>RECOMMENDED ACTION</Label><div className="recommendation-main"><span className="action-icon"><Wrench size={20} /></span><h3>{verification.action}</h3></div><div className="recommendation-detail"><span>VERIFY THE FIX</span><p>{verification.verification}</p></div><div className="recommendation-detail"><span>EXPECTED RESULT</span><p>{verification.expected}</p></div></div><div className="panel approval-panel"><Label>HUMAN APPROVAL</Label><div className="approval-illustration"><ClipboardCheck size={35} /></div><h3>{task ? 'Service task recorded.' : 'Review before approving.'}</h3><p>{task ? 'The task is on your maintenance board.' : 'Approve the recommendation to create an internal service task.'}</p>{task ? <><span className="approval-confirmed"><CircleCheck size={17} /> Task approved</span><a className="text-button" href="/maintenance">View maintenance board <ArrowRight size={16} /></a></> : <button className="primary-button full-width" disabled={busy} onClick={() => void run('Creating service task…', () => api.approve(current.id))}>Approve & create task <ArrowRight size={17} /></button>}</div></div>
              {task && <div className="service-task" aria-live="polite"><div className="task-heading"><div><span className="section-kicker">SERVICE TASK</span><h3>Task #{task.id}</h3></div><span className={`task-status ${task.status === 'resolved' ? 'is-resolved' : ''}`}>{task.status.toUpperCase()}</span></div><div className="task-fields"><div><span>EQUIPMENT</span><strong>{assetName}</strong></div><div><span>COMPONENT</span><strong>{scan?.component}</strong></div><div><span>ISSUE</span><strong>{task.recommendation.diagnosis}</strong></div><div><span>PRIORITY</span><strong>{task.recommendation.severity}</strong></div></div>{task.status === 'open' ? <form onSubmit={e => { e.preventDefault(); void run('Saving resolution…', () => api.resolve(task.id, outcomeNotes)) }}><label>Resolution notes (optional)<textarea maxLength={4000} value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} disabled={busy} /></label><button className="secondary-button" disabled={busy}><Check size={17} /> Mark issue resolved</button></form> : <div className="knowledge-result"><div className="knowledge-icon"><Sparkles size={19} /></div><div><strong>Outcome added to the case memory</strong><p>{task.outcome_notes}</p></div></div>}</div>}
              {task?.status === 'resolved' && <div className="finish-card"><div><span className="section-kicker">THE SAME LOOP, BEYOND BICYCLES</span><h3>See the factory translation.</h3></div><button className="primary-button" onClick={() => changeStage('factory')}>Explore pump preview <ArrowRight size={17} /></button></div>}
            </>}
          </>}
        </> : null}
        <footer className="page-footer"><span>MEKASCOPE / PROTOTYPE</span><span>{isFactory ? 'Prepared industrial preview' : 'AI-assisted inspection · Human-approved tasks'}</span></footer>
      </main>
      <aside className="context-rail" aria-label="Equipment and agent context">{stage !== 'observe' && equipmentProfile}{stage !== 'observe' && agentNote}{stage !== 'observe' && contextAvailable}<button className="restart-button" disabled={busy || loading} onClick={restart}><RotateCcw size={15} /> New case</button></aside>
    </div>
  </div>
}
