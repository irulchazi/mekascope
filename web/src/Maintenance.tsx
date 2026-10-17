import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Aperture, ArrowRight, Check, CircleCheck, ClipboardCheck, Clock3, Columns3, Gauge, GripVertical, Info, RefreshCw, ScanLine, Search, Wrench, X } from 'lucide-react'
import { api, type BoardStatus, type MaintenanceTask, type Priority } from './api'
import WorkspaceLinks from './WorkspaceLinks'

const columns: { id: BoardStatus; label: string; description: string }[] = [
  { id: 'todo', label: 'To do', description: 'Approved and ready to schedule' },
  { id: 'in_progress', label: 'In progress', description: 'Maintenance underway' },
  { id: 'done', label: 'Done', description: 'Resolved and recorded' },
]
const taskKey = (id: number) => `MT-${String(id).padStart(4, '0')}`
const inspectionLink = (task: MaintenanceTask) => `/?case=${encodeURIComponent(task.case_id)}&stage=act`
const createdDate = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(date))

function TaskDetails({ task, busy, error, close, move, changePriority }: { task: MaintenanceTask; busy: boolean; error: string; close: () => void; move: (id: number, status: BoardStatus, notes?: string) => Promise<void>; changePriority: (id: number, priority: Priority) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [notes, setNotes] = useState('')
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])
  function complete(event: FormEvent) {
    event.preventDefault()
    void move(task.id, 'done', notes)
  }
  return <dialog ref={dialog} className="maintenance-dialog" aria-labelledby="task-detail-title" onClose={close}>
    <div className="maintenance-dialog-header"><span className="section-kicker"><ClipboardCheck size={15} /> {taskKey(task.id)} / MAINTENANCE</span><button className="icon-button" aria-label="Close task details" onClick={close}><X size={19} /></button></div>
    <h2 id="task-detail-title">{task.recommendation.action}</h2>
    <div className="maintenance-detail-tags"><select className={`priority-tag priority-editor priority-tag--${task.priority}`} aria-label="Task priority" title="Change priority" value={task.priority} disabled={busy} onChange={event => void changePriority(task.id, event.target.value as Priority)}>
      <option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option><option value="unknown">Unknown</option>
    </select><span className={`board-status board-status--${task.board_status}`}>{columns.find(column => column.id === task.board_status)?.label}</span></div>
    {error && <div className="error-banner" role="alert"><Info size={17} /> {error}</div>}
    <dl className="maintenance-detail-facts"><div><dt>Equipment</dt><dd>{task.equipment}</dd></div><div><dt>Component</dt><dd>{task.component || 'Not identified'}</dd></div><div><dt>Approved</dt><dd>{createdDate(task.created_at)}</dd></div><div><dt>Diagnosis</dt><dd>{task.recommendation.diagnosis}</dd></div></dl>
    <div className="maintenance-detail-copy"><h3>Reported symptom</h3><p>{task.symptom}</p><h3>Assessment</h3><p>{task.recommendation.summary}</p><h3>Verify the fix</h3><p>{task.recommendation.verification}</p><h3>Expected result</h3><p>{task.recommendation.expected}</p></div>
    {task.board_status === 'done' ? <div className="maintenance-outcome"><CircleCheck size={19} /><div><strong>Resolution recorded</strong><p>{task.outcome_notes}</p></div></div> : <form className="maintenance-resolution" onSubmit={complete}><label>Resolution notes (optional)<textarea maxLength={4000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} placeholder="Record the work performed and what changed." /></label><div className="maintenance-detail-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void move(task.id, task.board_status === 'todo' ? 'in_progress' : 'todo')}>{task.board_status === 'todo' ? 'Start work' : 'Move to To do'}</button><button className="primary-button" disabled={busy}><Check size={16} /> {busy ? 'Saving…' : 'Mark done'}</button></div></form>}
    <a className="text-button maintenance-inspection-link" href={inspectionLink(task)}>Open source inspection <ArrowRight size={16} /></a>
  </dialog>
}

export default function Maintenance() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [dropStatus, setDropStatus] = useState<BoardStatus | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void api.tasks(controller.signal).then(result => {
      if (!controller.signal.aborted) setTasks(result)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load maintenance tasks.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  async function move(id: number, status: BoardStatus, notes = '') {
    if (updatingId !== null || loading) return
    setUpdatingId(id); setError(''); setAnnouncement('')
    try {
      const updated = await api.moveTask(id, status, notes)
      setTasks(current => current.map(task => task.id === id ? updated : task))
      setAnnouncement(`${taskKey(id)} moved to ${columns.find(column => column.id === status)?.label}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this task. Please retry.')
    } finally { setUpdatingId(null); setDropStatus(null) }
  }

  async function changePriority(id: number, priority: Priority) {
    if (updatingId !== null || loading) return
    setUpdatingId(id); setError(''); setAnnouncement('')
    try {
      const updated = await api.setTaskPriority(id, priority)
      setTasks(current => current.map(task => task.id === id ? updated : task))
      setAnnouncement(`${taskKey(id)} priority changed to ${priority}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this priority. Please retry.')
    } finally { setUpdatingId(null) }
  }

  function startDrag(event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData('application/x-mekascope-task', event.currentTarget.dataset.taskId || '')
    event.dataTransfer.effectAllowed = 'move'
  }
  function dragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('application/x-mekascope-task') || updatingId !== null || loading) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropStatus(event.currentTarget.dataset.status as BoardStatus)
  }
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const id = Number(event.dataTransfer.getData('application/x-mekascope-task'))
    const status = event.currentTarget.dataset.status as BoardStatus
    const task = tasks.find(item => item.id === id)
    setDropStatus(null)
    if (task && task.board_status !== 'done' && task.board_status !== status) void move(id, status)
  }

  const query = search.trim().toLowerCase()
  const filtered = tasks.filter(task => (priority === 'all' || task.priority === priority) && (!query || [taskKey(task.id), task.equipment, task.component, task.symptom, task.recommendation.action, task.recommendation.diagnosis].filter(Boolean).join(' ').toLowerCase().includes(query)))
  const selected = tasks.find(task => task.id === selectedId)
  const activeCount = tasks.filter(task => task.board_status !== 'done').length
  const busy = loading || updatingId !== null

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="MekaScope, inspection"><span className="brand-mark"><Aperture size={24} /></span><span className="brand-name">meka<span>scope</span><small>MECHANICAL INTELLIGENCE</small></span></a><div className="topbar-right"><span className="topbar-edition">MAINTENANCE WORKSPACE</span><span className="simulation-badge"><span className="badge-dot" /> HUMAN-APPROVED WORK</span></div></header>
    <div className="workspace maintenance-workspace">
      <nav className="sidebar maintenance-sidebar" aria-label="Workspace"><div className="sidebar-heading">THE WORKSPACE <span>04</span></div><WorkspaceLinks active="/maintenance" /><div className="maintenance-sidebar-note"><Wrench size={20} /><span className="section-kicker">FROM INSIGHT TO ACTION</span><p>Every task starts with an inspection and your approval.</p></div><div className="sidebar-lower"><div className="maintenance-workload"><span className="section-kicker">OPEN WORK</span><strong>{loading ? '—' : activeCount.toString().padStart(2, '0')}</strong><small>tasks awaiting resolution</small></div><div className="sidebar-foot"><span className="mini-pulse" /> HUMAN-REVIEWED WORKFLOW</div></div></nav>
      <main className="main-content maintenance-main" aria-busy={busy}>
        <div className="main-topline"><span>WORKSPACE / MAINTENANCE</span><span>OPERATIONS BOARD</span></div>
        <div className="maintenance-heading"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" /> APPROVED WORK / KANBAN</div><h1>Maintenance<span className="maintenance-heading-dot">.</span></h1><p>Turn approved inspections into completed work.</p></div><a href="/?new=1" className="secondary-button"><ScanLine size={16} /> Open inspection <ArrowRight size={16} /></a></div>
        <div className="maintenance-board-bar"><span><Columns3 size={17} /> Board</span><div><span>{tasks.length} total</span><span className="maintenance-bar-divider" /><span><Clock3 size={13} /> {tasks.filter(task => task.board_status === 'in_progress').length} in progress</span></div></div>
        <div className="maintenance-toolbar"><label className="maintenance-search"><Search size={17} /><input type="search" aria-label="Search maintenance tasks" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tasks, equipment, or diagnosis…" /></label><label className="maintenance-priority"><span>Priority</span><select aria-label="Filter by priority" value={priority} onChange={event => setPriority(event.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unknown">Unassessed</option></select></label><button className="icon-button maintenance-refresh" aria-label="Refresh maintenance tasks" disabled={busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={17} /></button></div>
        {error && !selected && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span><button className="secondary-button" disabled={busy} onClick={() => setReload(value => value + 1)}>Retry</button></div>}
        <div className="maintenance-board-hint"><span>{loading ? 'Loading tasks…' : `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}${query || priority !== 'all' ? ' matching filters' : ' on this board'}`}</span><span>Drag cards or use their status menu</span></div>
        <div className="maintenance-announcement" role="status" aria-live="polite">{announcement}</div>
        {!loading && !error && tasks.length === 0 && <div className="maintenance-empty"><ClipboardCheck size={27} /><div><h2>Your next action starts with an inspection.</h2><p>Choose Approve &amp; create task in the Act step to add your first maintenance task.</p></div><a href="/?new=1" className="text-button">Start an inspection <ArrowRight size={16} /></a></div>}
        <div className="kanban-scroll"><div className="kanban-board" aria-label="Maintenance Kanban board">
          {columns.map(column => {
            const cards = filtered.filter(task => task.board_status === column.id)
            return <section key={column.id} className={`kanban-column kanban-column--${column.id} ${dropStatus === column.id ? 'is-drop-target' : ''}`} aria-labelledby={`column-${column.id}`} data-status={column.id} onDragOver={dragOver} onDrop={drop}>
              <div className="kanban-column-heading"><h2 id={`column-${column.id}`}><span className="kanban-status-dot" />{column.label}<span className="kanban-count">{cards.length}</span></h2>{column.id === 'done' ? <CircleCheck size={16} /> : <span className="kanban-column-mark">{column.id === 'todo' ? '01' : '02'}</span>}</div><p className="kanban-column-description">{column.description}</p>
              <div className="kanban-cards">{cards.map(task => <article key={task.id} className={`maintenance-task ${updatingId === task.id ? 'is-saving' : ''}`} aria-label={`${taskKey(task.id)}: ${task.recommendation.action}`} data-task-id={task.id} draggable={!busy && task.board_status !== 'done'} onDragStart={startDrag} onDragEnd={() => setDropStatus(null)}>
                <div className="maintenance-task-top"><span className="maintenance-task-key"><ClipboardCheck size={13} />{taskKey(task.id)}</span><span className={`priority-tag priority-tag--${task.priority}`}>{task.priority === 'unknown' ? 'Unassessed' : task.priority}</span></div>
                <button className="maintenance-task-title" onClick={() => { setSelectedId(task.id); setError('') }}>{task.recommendation.action}</button>
                <div className="maintenance-task-equipment"><Gauge size={14} /><span>{task.equipment}</span></div><p className="maintenance-task-diagnosis">{task.recommendation.diagnosis}</p>
                <div className="maintenance-task-footer"><span><Clock3 size={12} />{createdDate(task.created_at)}</span>{task.board_status === 'done' ? <span className="maintenance-done-label"><Check size={13} /> Resolved</span> : <GripVertical size={15} className="maintenance-drag-handle" />}</div>
                <label className="maintenance-task-status"><span className="sr-only">Status for {taskKey(task.id)}</span><select value={task.board_status} aria-label={`Status for ${taskKey(task.id)}`} disabled={busy || task.board_status === 'done'} onChange={event => void move(task.id, event.target.value as BoardStatus)}>{columns.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              </article>)}{!loading && cards.length === 0 && <div className="kanban-empty"><span>—</span><p>{query || priority !== 'all' ? 'No matching tasks' : column.id === 'todo' ? 'Approved tasks land here' : column.id === 'in_progress' ? 'Ready when work begins' : 'Completed work lands here'}</p></div>}</div>
            </section>
          })}
        </div></div>
        <footer className="page-footer"><span>MEKASCOPE / MAINTENANCE</span><span>Inspection → Approval → Resolution</span></footer>
      </main>
    </div>
    {selected && <TaskDetails key={selected.id} task={selected} busy={busy} error={error} close={() => setSelectedId(null)} move={move} changePriority={changePriority} />}
  </div>
}
