import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  Aperture,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Boxes,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Crosshair,
  Database,
  Factory,
  Gauge,
  History,
  Info,
  Layers3,
  LockKeyhole,
  PackageCheck,
  RotateCcw,
  ScanLine,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { bike, factory, stages, type BikeStage, type Stage } from './data'

type DemoState = {
  stage: Stage
  scanPhase: number
  analysisPhase: number
  verificationStep: number
  taskCreated: boolean
  resolved: boolean
}

const storageKey = 'mekascope-demo-v1'
const initialState: DemoState = {
  stage: 'observe',
  scanPhase: 0,
  analysisPhase: 0,
  verificationStep: 0,
  taskCreated: false,
  resolved: false,
}

function readState(): DemoState {
  try {
    const saved = window.sessionStorage.getItem(storageKey)
    if (!saved) return initialState
    const parsed = JSON.parse(saved) as Partial<DemoState>
    const validStages: Stage[] = [...stages.map((stage) => stage.id), 'factory']
    if (!parsed.stage || !validStages.includes(parsed.stage)) return initialState
    return {
      stage: parsed.stage,
      scanPhase: Math.min(3, Math.max(0, Number(parsed.scanPhase) || 0)),
      analysisPhase: Math.min(4, Math.max(0, Number(parsed.analysisPhase) || 0)),
      verificationStep: Math.min(2, Math.max(0, Number(parsed.verificationStep) || 0)),
      taskCreated: parsed.taskCreated === true,
      resolved: parsed.resolved === true,
    }
  } catch {
    return initialState
  }
}

const navigationIcons = [ScanLine, Boxes, Activity, Crosshair, ClipboardCheck]
const sourceChecks = [
  { icon: Boxes, label: 'Equipment configuration', detail: '12-speed drivetrain mapped' },
  { icon: BookOpen, label: 'Component specification', detail: 'RD-R7100 reference checked' },
  { icon: History, label: 'Service history', detail: 'Recent derailleur removal found' },
  { icon: Activity, label: 'Symptom pattern', detail: 'Gears 4–5 isolated' },
]

const stageCopy: Record<BikeStage, { eyebrow: string; title: string; description: string }> = {
  observe: {
    eyebrow: '01 / OBSERVE',
    title: 'Start with what you see.',
    description: 'A prepared camera frame gives MekaScope its first view of the machine.',
  },
  understand: {
    eyebrow: '02 / UNDERSTAND',
    title: 'The part has a place.',
    description: 'Recognition connects the visible component to the equipment around it.',
  },
  investigate: {
    eyebrow: '03 / INVESTIGATE',
    title: 'Follow the evidence.',
    description: 'MekaScope checks context before suggesting a cause.',
  },
  verify: {
    eyebrow: '04 / VERIFY',
    title: 'Test the leading cause.',
    description: 'A short guided check turns a likely answer into a stronger diagnosis.',
  },
  act: {
    eyebrow: '05 / ACT',
    title: 'Turn insight into work.',
    description: 'A person reviews the recommendation before a maintenance task is created.',
  },
}

function VisualFrame({
  kind,
  annotation,
  scanning = false,
}: {
  kind: 'bike' | 'factory'
  annotation: 'none' | 'detected' | 'verify' | 'factory'
  scanning?: boolean
}) {
  const equipment = kind === 'bike' ? bike : factory
  return (
    <div className={`visual-frame visual-frame--${kind} ${scanning ? 'is-scanning' : ''}`}>
      <img src={equipment.image} alt={kind === 'bike' ? 'Prepared image of a road bicycle drivetrain' : 'Prepared image of an industrial centrifugal pump'} />
      <div className="visual-shade" />
      <span className="frame-corner corner-tl" aria-hidden="true" />
      <span className="frame-corner corner-tr" aria-hidden="true" />
      <span className="frame-corner corner-bl" aria-hidden="true" />
      <span className="frame-corner corner-br" aria-hidden="true" />
      <div className="frame-topline">
        <span><span className="record-dot" /> PREPARED CAMERA INPUT</span>
        <span>FRAME 001 / DEMO</span>
      </div>
      {scanning && <span className="scan-beam" aria-hidden="true" />}
      {annotation === 'detected' && (
        <>
          <div className="hotspot hotspot--derailleur"><span className="hotspot-pulse" /><span className="hotspot-label">REAR DERAILLEUR <b>96%</b></span></div>
          <div className="hotspot hotspot--cassette hotspot--secondary"><span className="hotspot-pulse" /><span className="hotspot-label">CASSETTE</span></div>
        </>
      )}
      {annotation === 'verify' && (
        <div className="hotspot hotspot--gear"><span className="hotspot-pulse" /><span className="hotspot-label">FOURTH REAR COG <b>DETECTED</b></span></div>
      )}
      {annotation === 'factory' && (
        <div className="hotspot hotspot--bearing"><span className="hotspot-pulse" /><span className="hotspot-label">MOTOR BEARING B <b>FOCUS</b></span></div>
      )}
      <div className="frame-bottomline">
        <span><Crosshair size={13} /> {kind === 'bike' ? `BIKE #${bike.id}` : `PUMP ${factory.id}`}</span>
        <span>SIMULATED ANALYSIS</span>
      </div>
    </div>
  )
}

function SectionLabel({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return <div className="section-label"><span>{children}</span>{end}</div>
}

function App() {
  const [demo, setDemo] = useState<DemoState>(readState)
  const scanComplete = demo.scanPhase === 3
  const analysisComplete = demo.analysisPhase === 4
  const verificationComplete = demo.verificationStep === 2
  const unlockedIndex = verificationComplete ? 4 : analysisComplete ? 3 : scanComplete ? 2 : 0

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(demo))
    } catch {
      // The demo remains usable when browser storage is unavailable.
    }
  }, [demo])

  useEffect(() => {
    if (demo.scanPhase < 1 || demo.scanPhase >= 3) return
    const timer = window.setTimeout(() => setDemo((current) => ({ ...current, scanPhase: current.scanPhase + 1 })), 860)
    return () => window.clearTimeout(timer)
  }, [demo.scanPhase])

  useEffect(() => {
    if (demo.analysisPhase < 1 || demo.analysisPhase >= 4) return
    const timer = window.setTimeout(() => setDemo((current) => ({ ...current, analysisPhase: current.analysisPhase + 1 })), 690)
    return () => window.clearTimeout(timer)
  }, [demo.analysisPhase])

  function changeStage(stage: Stage) {
    if (stage !== 'factory' && stages.findIndex((item) => item.id === stage) > unlockedIndex) return
    setDemo((current) => ({ ...current, stage }))
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  function restartDemo() {
    setDemo(initialState)
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const isFactory = demo.stage === 'factory'
  const currentBikeStage: BikeStage = demo.stage === 'factory' ? 'observe' : demo.stage
  const currentIndex = stages.findIndex((stage) => stage.id === demo.stage)
  const contextNote = isFactory
    ? 'Industrial preview uses the same observe-to-action structure with pump data.'
    : demo.resolved
      ? 'Resolution captured. This outcome can inform future maintenance cases.'
      : demo.taskCreated
        ? 'The simulated task is open and ready for technician follow-up.'
        : verificationComplete
          ? 'Guided evidence raised diagnosis confidence from 73% to 92%.'
          : analysisComplete
            ? 'Four possible causes were compared against equipment context.'
            : scanComplete
              ? 'The rear derailleur was linked to its drivetrain configuration.'
              : 'Begin the prepared scan to identify the equipment and its components.'

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={restartDemo} aria-label="MekaScope, restart demo">
          <span className="brand-mark"><Aperture size={24} strokeWidth={2.1} /></span>
          <span className="brand-name">meka<span>scope</span><small>MECHANICAL INTELLIGENCE</small></span>
        </button>
        <div className="topbar-right">
          <span className="topbar-edition">INTERACTIVE CASE STUDY <span className="topbar-separator">/</span> 01</span>
          <span className="simulation-badge"><span className="badge-dot" /> FRONT-END SIMULATION</span>
        </div>
      </header>

      <div className="workspace">
        <nav className="sidebar" aria-label="Demo workflow">
          <div className="sidebar-heading">THE WORKFLOW <span>01—05</span></div>
          <div className="stage-list">
            {stages.map((stage, index) => {
              const Icon = navigationIcons[index]
              const locked = index > unlockedIndex
              return (
                <button
                  key={stage.id}
                  className={`stage-button ${demo.stage === stage.id ? 'is-active' : ''} ${index < currentIndex && !isFactory ? 'is-past' : ''}`}
                  disabled={locked}
                  onClick={() => changeStage(stage.id)}
                  aria-current={demo.stage === stage.id ? 'step' : undefined}
                  title={locked ? 'Complete the previous step to unlock' : undefined}
                >
                  <span className="stage-icon"><Icon size={17} strokeWidth={1.8} /></span>
                  <span className="stage-text"><b>{stage.label}</b><small>{stage.description}</small></span>
                  <span className="stage-status">{locked ? <LockKeyhole size={12} /> : index < currentIndex && !isFactory ? <Check size={14} /> : stage.number}</span>
                </button>
              )
            })}
          </div>
          <div className="sidebar-lower">
            <div className="sidebar-heading">BEYOND THE BIKE</div>
            <button className={`factory-link ${isFactory ? 'is-active' : ''}`} onClick={() => changeStage('factory')}>
              <span className="factory-link-icon"><Factory size={19} /></span>
              <span><b>Factory preview</b><small>Same intelligence, new scale</small></span>
              <ArrowRight size={15} />
            </button>
            <div className="sidebar-foot"><span className="mini-pulse" /> LOCAL DEMO · NO LIVE SYSTEMS</div>
          </div>
        </nav>

        <main className="main-content" id="main-content">
          <div className="main-topline">
            <span>WORKSPACE <ChevronRight size={12} /> {isFactory ? 'INDUSTRIAL PREVIEW' : `BIKE #${bike.id}`}</span>
            <span>{isFactory ? 'PREVIEW MODE' : `DEMO SEQUENCE / ${String(currentIndex + 1).padStart(2, '0')}`}</span>
          </div>

          {isFactory ? (
            <>
              <div className="page-heading">
                <div className="eyebrow"><span className="eyebrow-line" /> INDUSTRIAL PREVIEW</div>
                <h1>Same reasoning.<br /><em>Different machine.</em></h1>
                <p>The equipment changes. The observe, investigate, verify, and act workflow does not.</p>
              </div>
              <div className="factory-hero">
                <VisualFrame kind="factory" annotation="factory" />
                <div className="factory-hero-strip">
                  <div><span>ASSET</span><strong>Pump {factory.id}</strong></div>
                  <div><span>SYMPTOM</span><strong>Abnormal vibration</strong></div>
                  <div><span>PRIORITY</span><strong className="amber-text">High</strong></div>
                </div>
              </div>
              <div className="factory-preview-grid">
                <div className="panel factory-diagnosis">
                  <SectionLabel end={<span className="sample-tag">SIMULATED RESULT</span>}>EVIDENCE-LED DIAGNOSIS</SectionLabel>
                  <div className="diagnosis-label">LIKELY CAUSE</div>
                  <h2>{factory.diagnosis}</h2>
                  <div className="confidence-bar"><span style={{ width: `${factory.confidence}%` }} /></div>
                  <div className="confidence-row"><strong>{factory.confidence}% confidence</strong><span>High severity</span></div>
                  <p className="muted-copy">Motor vibration, operating context, and service history point to a bearing issue in this prepared example.</p>
                </div>
                <div className="panel factory-action">
                  <SectionLabel>HUMAN-APPROVED ACTION</SectionLabel>
                  <div className="action-icon"><Wrench size={20} /></div>
                  <h3>{factory.action}</h3>
                  <div className="factory-facts"><span><PackageCheck size={16} /> {factory.inventory}</span><span><Clock3 size={16} /> {factory.duration}</span></div>
                  <span className="preview-caption">Work order shown as a preview; no action is sent.</span>
                </div>
              </div>
              <div className="translation-card">
                <div><span className="section-kicker">ONE EQUIPMENT MODEL</span><h3>From bicycle to production line</h3></div>
                <div className="translation-flow"><span>Component</span><ArrowRight size={15} /><span>Context</span><ArrowRight size={15} /><span>Evidence</span><ArrowRight size={15} /><span>Action</span></div>
              </div>
              <button className="text-button back-to-bike" onClick={() => changeStage(verificationComplete ? 'act' : scanComplete ? 'understand' : 'observe')}><ArrowLeft size={16} /> Back to bicycle case</button>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div className="eyebrow"><span className="eyebrow-line" /> {stageCopy[currentBikeStage].eyebrow}</div>
                <h1>{stageCopy[currentBikeStage].title}</h1>
                <p>{stageCopy[currentBikeStage].description}</p>
              </div>

              {demo.stage === 'observe' && (
                <>
                  <VisualFrame kind="bike" annotation={scanComplete ? 'detected' : 'none'} scanning={demo.scanPhase > 0 && !scanComplete} />
                  <div className="input-card">
                    <span className="input-icon"><AudioLines size={20} /></span>
                    <div><span className="section-kicker">SAMPLE USER INPUT · VOICE OR TEXT</span><p>“{bike.symptom}”</p></div>
                    <span className="sample-tag">PREPARED</span>
                  </div>
                  {demo.scanPhase === 0 ? (
                    <div className="action-row"><div><strong>Ready to inspect</strong><span>Run the prepared scan to begin the story.</span></div><button className="primary-button" onClick={() => setDemo((current) => ({ ...current, scanPhase: 1 }))}><ScanLine size={17} /> Run simulated scan <ArrowRight size={17} /></button></div>
                  ) : !scanComplete ? (
                    <div className="progress-card" role="status" aria-live="polite"><div><span className="spinner" /><strong>Analyzing prepared frame</strong><small>{['', 'Locating mechanical assemblies…', 'Resolving component identity…'][demo.scanPhase]}</small></div><button className="text-button" onClick={() => setDemo((current) => ({ ...current, scanPhase: 3 }))}>Skip animation <ArrowRight size={15} /></button></div>
                  ) : (
                    <div className="scan-result"><div className="result-check"><Check size={21} /></div><div><span className="section-kicker">COMPONENT IDENTIFIED</span><h3>{bike.component}</h3><p>{bike.model} <span className="result-dot">·</span> {bike.confidence}% visual match</p></div><button className="primary-button" onClick={() => changeStage('understand')}>Explore equipment <ArrowRight size={17} /></button></div>
                  )}
                </>
              )}

              {demo.stage === 'understand' && (
                <>
                  <div className="understand-grid">
                    <div className="image-panel"><VisualFrame kind="bike" annotation="detected" /><div className="image-panel-footer"><span><Layers3 size={15} /> COMPONENT RELATIONSHIP MAP</span><span>BIKE #{bike.id}</span></div></div>
                    <div className="panel component-card"><SectionLabel end={<span className="confidence-pill">{bike.confidence}% MATCH</span>}>IDENTIFIED COMPONENT</SectionLabel><div className="component-glyph"><Boxes size={25} /></div><span className="component-type">DRIVETRAIN / REAR</span><h2>{bike.component}</h2><p>{bike.model}</p><div className="component-line" /><div className="tree-row"><span className="tree-dot" /> Bike #{bike.id} <ChevronRight size={13} /> Drivetrain <ChevronRight size={13} /> <b>Rear derailleur</b></div></div>
                  </div>
                  <div className="detail-grid">
                    <div className="panel detail-panel"><SectionLabel>BIKE CONFIGURATION</SectionLabel><div className="spec-list">{bike.configuration.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div>
                    <div className="panel detail-panel"><SectionLabel>COMPATIBILITY CHECK</SectionLabel><div className="check-list">{bike.compatibility.map((item) => <div key={item.label} className={item.status === 'warn' ? 'warning' : ''}>{item.status === 'warn' ? <Info size={17} /> : <CircleCheck size={17} />}<span>{item.label}</span></div>)}</div></div>
                  </div>
                  <div className="symptom-action"><div><span className="section-kicker">NOW INVESTIGATE THE SYMPTOM</span><p>“{bike.symptom}”</p></div><button className="primary-button" onClick={() => setDemo((current) => ({ ...current, stage: 'investigate', analysisPhase: current.analysisPhase || 1 }))}>Investigate issue <ArrowRight size={17} /></button></div>
                </>
              )}

              {demo.stage === 'investigate' && (
                <>
                  <div className="investigation-intro"><span className="pulse-ring"><Sparkles size={19} /></span><div><span className="section-kicker">MEKASCOPE INVESTIGATION</span><h2>What explains clicking in gears 4 and 5?</h2></div><span className="sample-tag">SIMULATED AGENT RUN</span></div>
                  <div className="investigation-grid">
                    <div className="panel sources-panel"><SectionLabel end={<span className="source-count">{Math.min(demo.analysisPhase, 4)}/4 CHECKED</span>}>CONTEXT SOURCES</SectionLabel><div className="source-list">{sourceChecks.map((source, index) => { const Icon = source.icon; const done = demo.analysisPhase > index; return <div key={source.label} className={`source-item ${done ? 'is-done' : ''}`}><span className="source-icon"><Icon size={18} /></span><div><strong>{source.label}</strong><small>{done ? source.detail : 'Waiting for analysis'}</small></div>{done ? <Check size={16} className="source-check" /> : <span className="source-empty" />}</div> })}</div></div>
                    <div className="panel evidence-panel"><SectionLabel>OBSERVED EVIDENCE</SectionLabel>{analysisComplete ? <div className="evidence-list">{bike.observations.map((item, index) => <div key={item}><span>0{index + 1}</span><p>{item}</p></div>)}</div> : <div className="pending-evidence"><span className="spinner" /><p>Connecting observations to equipment history…</p></div>}</div>
                  </div>
                  {analysisComplete ? <div className="panel hypotheses-panel"><SectionLabel end={<span className="section-hint">RANKED, NOT FINAL</span>}>POSSIBLE CAUSES</SectionLabel><div className="hypothesis-list">{bike.hypotheses.map((item) => <div key={item.name} className={`hypothesis-row ${item.primary ? 'primary' : ''}`}><div className="hypothesis-name"><span className="hypothesis-marker" /><strong>{item.name}</strong>{item.primary && <span className="leading-tag">LEADING</span>}</div><div className="hypothesis-track"><span style={{ width: `${item.probability}%` }} /></div><b>{item.probability}%</b></div>)}</div><div className="hypotheses-footer"><span><Info size={15} /> These are prepared demo estimates, not live diagnostics.</span><button className="primary-button" onClick={() => changeStage('verify')}>Verify leading cause <ArrowRight size={17} /></button></div></div> : <div className="action-row"><div><strong>Checking four sources</strong><span>The demo progresses automatically.</span></div><button className="text-button" onClick={() => setDemo((current) => ({ ...current, analysisPhase: 4 }))}>Skip animation <ArrowRight size={15} /></button></div>}
                </>
              )}

              {demo.stage === 'verify' && (
                <>
                  <div className="verification-banner"><span><Crosshair size={18} /> GUIDED CAMERA CHECK</span><p>Inspect the chain on the fourth rear cog to distinguish indexing from wear.</p><span className="sample-tag">PREPARED INPUT</span></div>
                  <VisualFrame kind="bike" annotation={demo.verificationStep > 0 ? 'verify' : 'detected'} />
                  <div className="verify-grid"><div className="panel verify-steps"><SectionLabel>INSPECTION STEPS</SectionLabel><div className={`verify-step ${demo.verificationStep >= 1 ? 'is-complete' : 'is-current'}`}><span className="verify-step-index">{demo.verificationStep >= 1 ? <Check size={15} /> : '1'}</span><div><strong>Shift to the fourth rear cog</strong><p>Confirm the chain position in the prepared camera frame.</p></div></div><div className={`verify-step ${demo.verificationStep >= 2 ? 'is-complete' : demo.verificationStep === 1 ? 'is-current' : ''}`}><span className="verify-step-index">{demo.verificationStep >= 2 ? <Check size={15} /> : '2'}</span><div><strong>Rotate the crank slowly</strong><p>Watch how the chain tracks beside the adjacent cog.</p></div></div>{demo.verificationStep < 2 ? <button className="primary-button verify-button" onClick={() => setDemo((current) => ({ ...current, verificationStep: current.verificationStep + 1 }))}>{demo.verificationStep === 0 ? 'Confirm fourth gear' : 'Inspect chain movement'} <ArrowRight size={17} /></button> : <div className="verified-note"><CircleCheck size={18} /><span>Chain contact with adjacent larger cog supports indexing misalignment.</span></div>}</div><div className="panel confidence-panel"><SectionLabel>DIAGNOSIS CONFIDENCE</SectionLabel><div className="confidence-comparison"><div><span>BEFORE CHECK</span><strong>73<small>%</small></strong></div><ArrowDownRight size={23} /><div className={verificationComplete ? 'confidence-after is-confirmed' : 'confidence-after'}><span>AFTER CHECK</span><strong>{verificationComplete ? '92' : '—'}<small>{verificationComplete ? '%' : ''}</small></strong></div></div><div className="confidence-track"><span style={{ width: verificationComplete ? '92%' : '73%' }} /></div><p>{verificationComplete ? 'Guided evidence strengthens the leading hypothesis.' : 'Complete both prepared checks to update the estimate.'}</p></div></div>
                  {verificationComplete && <div className="next-strip"><div><CheckCheck size={19} /><span>Verification complete. The recommendation is ready for human review.</span></div><button className="primary-button" onClick={() => changeStage('act')}>Review action plan <ArrowRight size={17} /></button></div>}
                </>
              )}

              {demo.stage === 'act' && (
                <>
                  <div className="diagnosis-hero"><div className="diagnosis-hero-top"><span><CircleCheck size={17} /> GUIDED DIAGNOSIS COMPLETE</span><span className="sample-tag">SIMULATED RESULT</span></div><div className="diagnosis-hero-main"><div><span className="section-kicker">PROBABLE CAUSE</span><h2>{bike.diagnosis}</h2><p>Evidence points to alignment at the rear derailleur after the guided check.</p></div><div className="diagnosis-score"><strong>92<span>%</span></strong><small>CONFIDENCE</small></div></div><div className="diagnosis-hero-bottom"><span><span className="severity-dot" /> LOW SEVERITY</span><span>Rideable · service recommended</span></div></div>
                  <div className="act-grid"><div className="panel recommendation-panel"><SectionLabel>RECOMMENDED ACTION</SectionLabel><div className="recommendation-main"><span className="action-icon"><Wrench size={20} /></span><h3>{bike.action}</h3></div><div className="recommendation-detail"><span>VERIFY THE FIX</span><p>{bike.verification}</p></div><div className="recommendation-detail"><span>EXPECTED RESULT</span><p>{bike.expected}</p></div></div><div className="panel approval-panel"><SectionLabel>HUMAN APPROVAL</SectionLabel><div className="approval-illustration"><ClipboardCheck size={35} strokeWidth={1.4} /></div><h3>{demo.taskCreated ? 'Task created for review.' : 'Ready to create a service task.'}</h3><p>{demo.taskCreated ? 'The prepared action has been recorded in this browser session.' : 'Approve the recommendation to create a simulated maintenance record.'}</p>{!demo.taskCreated ? <button className="primary-button full-width" onClick={() => setDemo((current) => ({ ...current, taskCreated: true }))}>Approve & create task <ArrowRight size={17} /></button> : <span className="approval-confirmed"><CircleCheck size={17} /> Approved by demo user</span>}</div></div>
                  {demo.taskCreated && <div className="service-task" aria-live="polite"><div className="task-heading"><div><span className="section-kicker">SIMULATED SERVICE TASK</span><h3>Task #{bike.taskId}</h3></div><span className={`task-status ${demo.resolved ? 'is-resolved' : ''}`}>{demo.resolved ? 'RESOLVED' : 'OPEN'}</span></div><div className="task-fields"><div><span>EQUIPMENT</span><strong>{bike.name}</strong></div><div><span>COMPONENT</span><strong>{bike.component}</strong></div><div><span>ISSUE</span><strong>Indexing misalignment</strong></div><div><span>PRIORITY</span><strong>Low</strong></div></div>{!demo.resolved ? <button className="secondary-button" onClick={() => setDemo((current) => ({ ...current, resolved: true }))}><Check size={17} /> Mark issue resolved</button> : <div className="knowledge-result"><div className="knowledge-icon"><Sparkles size={19} /></div><div><strong>Outcome added to the case memory</strong><p>Symptom: clicking in gears 4–5 · Fix: minor indexing adjustment · Result: resolved</p></div></div>}</div>}
                  {demo.resolved && <div className="finish-card"><div><span className="section-kicker">THE SAME LOOP, BEYOND BICYCLES</span><h3>See the factory translation.</h3></div><button className="primary-button" onClick={() => changeStage('factory')}>Explore pump preview <ArrowRight size={17} /></button></div>}
                </>
              )}
            </>
          )}
          <footer className="page-footer"><span>MEKASCOPE / HACKATHON PROTOTYPE</span><span>Prepared visuals and deterministic results · No live diagnosis or task system</span></footer>
        </main>

        <aside className="context-rail" aria-label="Equipment and agent context">
          <div className="context-card"><SectionLabel end={<span className="context-live"><span /> {isFactory ? 'PREVIEW' : 'IN FOCUS'}</span>}>EQUIPMENT PROFILE</SectionLabel><div className="asset-summary"><span className="asset-icon">{isFactory ? <Factory size={22} /> : <Gauge size={22} />}</span><div><strong>{isFactory ? `Pump ${factory.id}` : `Bike #${bike.id}`}</strong><small>{isFactory ? factory.location : bike.name}</small></div></div><div className="context-divider" /><div className="context-rows">{isFactory ? <><div><span>Asset type</span><strong>Centrifugal pump</strong></div><div><span>Focus</span><strong>{factory.component}</strong></div><div><span>Symptom</span><strong>Vibration</strong></div><div><span>Severity</span><strong className="amber-text">High</strong></div></> : <><div><span>System</span><strong>Drivetrain</strong></div><div><span>Speed</span><strong>12-speed</strong></div><div><span>Last service</span><strong>3,400 km ago</strong></div><div><span>Component</span><strong>Rear derailleur</strong></div></>}</div></div>
          <div className="agent-note"><div className="agent-note-icon"><Sparkles size={18} /></div><span className="section-kicker">AGENT NOTE</span><p>{contextNote}</p><div className="note-bottom"><span className="mini-pulse" /> {isFactory ? 'STATIC INDUSTRIAL PREVIEW' : 'LOCAL DEMO STATE'}</div></div>
          <div className="data-card"><SectionLabel>CONTEXT AVAILABLE</SectionLabel><div><span><Database size={15} /> Equipment data</span><CircleCheck size={14} /></div><div><span><BookOpen size={15} /> Component specs</span><CircleCheck size={14} /></div><div><span><History size={15} /> Service history</span><CircleCheck size={14} /></div><small>Prepared sample data for this demonstration.</small></div>
          <button className="restart-button" onClick={restartDemo}><RotateCcw size={15} /> Restart demo</button>
        </aside>
      </div>
    </div>
  )
}

export default App
