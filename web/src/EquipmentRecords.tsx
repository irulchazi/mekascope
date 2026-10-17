import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Aperture, ArrowRight, Bike, BookOpen, CalendarDays, Check, CircleCheck, History, Info, Pencil, Plus, RefreshCw, Save, Search, Settings2, Wrench, X } from 'lucide-react'
import { api, type Equipment, type EquipmentInput, type ServiceRecord, type ServiceRecordInput, type ServiceType } from './api'
import WorkspaceLinks from './WorkspaceLinks'

const serviceTypes: { value: ServiceType; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' }, { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' }, { value: 'upgrade', label: 'Upgrade' },
]
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
type Editor = { kind: 'equipment'; item?: Equipment } | { kind: 'service'; item?: ServiceRecord }

function RecordEditor({ editor, equipment, equipmentId, close, saved }: { editor: Editor; equipment: Equipment[]; equipmentId: string; close: () => void; saved: (item: Equipment | ServiceRecord) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isEquipment = editor.kind === 'equipment'
  const title = `${editor.item ? 'Edit' : 'Add'} ${isEquipment ? 'equipment' : 'service record'}`
  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal() }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) || '').trim()
    saving.current = true; setBusy(true); setError('')
    try {
      if (isEquipment) {
        const body: EquipmentInput = { name: value('name'), manufacturer: value('manufacturer'), model: value('model'), serial_number: value('serial_number'), configuration: value('configuration') }
        saved(await api.saveEquipment(body, editor.item?.id))
      } else {
        const body: ServiceRecordInput = { equipment_id: value('equipment_id'), title: value('title'), performed_on: value('performed_on'), service_type: value('service_type') as ServiceType, performed_by: value('performed_by'), notes: value('notes') }
        saved(await api.saveServiceRecord(body, editor.item?.id))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.')
      saving.current = false; setBusy(false)
    }
  }
  return <dialog ref={dialog} className="maintenance-dialog record-dialog" aria-labelledby="record-editor-title" onCancel={event => { if (saving.current) event.preventDefault() }} onClose={close}>
    <div className="maintenance-dialog-header"><span className="section-kicker">{isEquipment ? <BookOpen size={15} /> : <History size={15} />} {isEquipment ? 'EQUIPMENT CONFIGURATION' : 'SERVICE HISTORY'}</span><button className="icon-button" aria-label="Close editor" disabled={busy} onClick={close}><X size={18} /></button></div>
    <h2 id="record-editor-title">{title}</h2><p className="record-dialog-intro">{isEquipment ? 'Keep the details that matter for the next inspection.' : 'Document the work performed and what changed.'} Fields marked * are required.</p>
    {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span></div>}
    <form onSubmit={submit} className="record-form"><fieldset disabled={busy}>
      {editor.kind === 'equipment' ? <>
        <label>Equipment name *<input name="name" autoFocus required maxLength={200} defaultValue={editor.item?.name} placeholder="e.g. Workshop road bike" /></label>
        <div className="record-form-grid"><label>Manufacturer<input name="manufacturer" maxLength={200} defaultValue={editor.item?.manufacturer} placeholder="e.g. Shimano" /></label><label>Model<input name="model" maxLength={200} defaultValue={editor.item?.model} placeholder="Model or version" /></label></div>
        <label>Serial / asset number<input name="serial_number" maxLength={200} defaultValue={editor.item?.serial_number} placeholder="Your equipment identifier" /></label>
        <label>Configuration notes<textarea name="configuration" rows={6} maxLength={4000} defaultValue={editor.item?.configuration} placeholder="Record the drivetrain, components, specifications, settings, or modifications." /><small>Up to 4,000 characters. Leave unknown details blank.</small></label>
      </> : <>
        <label>Equipment *<select name="equipment_id" required defaultValue={editor.item?.equipment_id || equipmentId || equipment[0]?.id}><option value="" disabled>Select equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Service title *<input name="title" autoFocus required maxLength={200} defaultValue={editor.item?.title} placeholder="e.g. Chain replacement and indexing" /></label>
        <div className="record-form-grid"><label>Service date *<input name="performed_on" type="date" required defaultValue={editor.item?.performed_on || today()} /></label><label>Service type *<select name="service_type" required defaultValue={editor.item?.service_type || 'maintenance'}>{serviceTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label></div>
        <label>Performed by<input name="performed_by" maxLength={200} defaultValue={editor.item?.performed_by} placeholder="Technician, workshop, or yourself" /></label>
        <label>Work performed &amp; observations *<textarea name="notes" required rows={6} maxLength={4000} defaultValue={editor.item?.notes} placeholder="Describe the work, parts replaced, settings changed, and checks after service." /><small>Up to 4,000 characters.</small></label>
      </>}
      <div className="record-form-actions"><button className="secondary-button" type="button" onClick={close}>Cancel</button><button className="primary-button"><Save size={16} />{busy ? 'Saving…' : isEquipment ? 'Save equipment' : 'Save service record'}</button></div>
    </fieldset></form>
  </dialog>
}

export default function EquipmentRecords({ page }: { page: 'equipment' | 'service' }) {
  const isEquipment = page === 'equipment'
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('equipment') || '')
  const [filterId, setFilterId] = useState(() => new URLSearchParams(window.location.search).get('equipment') || '')
  const [typeFilter, setTypeFilter] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void Promise.all([api.equipment(controller.signal), api.serviceRecords(controller.signal)]).then(([assets, history]) => {
      if (controller.signal.aborted) return
      setEquipment(assets); setRecords(history)
      setSelectedId(current => assets.some(item => item.id === current) ? current : assets[0]?.id || '')
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load records.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])
  function saved(item: Equipment | ServiceRecord) {
    if ('configuration' in item) {
      setEquipment(items => items.some(asset => asset.id === item.id) ? items.map(asset => asset.id === item.id ? item : asset) : [item, ...items])
      setSearch(''); setSelectedId(item.id)
    } else {
      setRecords(items => [item, ...items.filter(record => record.id !== item.id)].sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at)))
      setSearch(''); setFilterId(item.equipment_id); setTypeFilter('')
    }
    setAnnouncement(`${'configuration' in item ? 'Equipment' : 'Service record'} saved.`); setEditor(null)
  }
  const query = search.trim().toLowerCase()
  const filteredEquipment = equipment.filter(item => [item.name, item.manufacturer, item.model, item.serial_number, item.configuration].join(' ').toLowerCase().includes(query))
  const selected = filteredEquipment.find(item => item.id === selectedId) || filteredEquipment[0]
  const selectedRecords = records.filter(record => record.equipment_id === selected?.id)
  const filteredRecords = records.filter(record => (!filterId || record.equipment_id === filterId) && (!typeFilter || record.service_type === typeFilter) && [record.title, record.notes, record.performed_by, equipment.find(item => item.id === record.equipment_id)?.name].join(' ').toLowerCase().includes(query))
  const activePath = isEquipment ? '/equipment' : '/service-history'
  const visibleCount = isEquipment ? filteredEquipment.length : filteredRecords.length
  const visibleUnit = isEquipment ? visibleCount === 1 ? 'profile' : 'profiles' : visibleCount === 1 ? 'entry' : 'entries'

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="MekaScope, inspection"><span className="brand-mark"><Aperture size={24} /></span><span className="brand-name">meka<span>scope</span><small>MECHANICAL INTELLIGENCE</small></span></a><div className="topbar-right"><span className="topbar-edition">EQUIPMENT WORKSPACE</span><span className="simulation-badge"><span className="badge-dot" /> EQUIPMENT MEMORY</span></div></header>
    <div className="workspace maintenance-workspace records-workspace">
      <nav className="sidebar maintenance-sidebar records-sidebar" aria-label="Workspace"><div className="sidebar-heading">THE WORKSPACE <span>04</span></div><WorkspaceLinks active={activePath} /><div className="maintenance-sidebar-note"><BookOpen size={21} /><span className="section-kicker">CONTEXT THAT STAYS</span><p>Configuration and service records give every inspection a better starting point.</p></div><div className="sidebar-lower"><div className="sidebar-foot"><span className="mini-pulse" /> HUMAN-REVIEWED WORKFLOW</div></div></nav>
      <main className="main-content maintenance-main records-main" aria-busy={loading}>
        <div className="main-topline"><span>WORKSPACE / {isEquipment ? 'EQUIPMENT' : 'SERVICE HISTORY'}</span><span>EQUIPMENT MEMORY</span></div>
        <div className="maintenance-heading"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line" /> {isEquipment ? 'KNOW YOUR EQUIPMENT' : 'EVERY SERVICE, RECORDED'}</div><h1>{isEquipment ? 'Equipment configuration' : 'Service history'}<span className="maintenance-heading-dot">.</span></h1><p>{isEquipment ? 'Keep specifications, components, and settings in one place.' : 'A record of the work that keeps your equipment running.'}</p></div><button className="primary-button" disabled={loading || !!error || (!isEquipment && equipment.length === 0)} onClick={() => { setAnnouncement(''); setEditor({ kind: isEquipment ? 'equipment' : 'service' }) }}><Plus size={17} />{isEquipment ? 'Add equipment' : 'Log service'}</button></div>
        <div className="record-overview" aria-label="Record summary"><div><span className="record-overview-icon"><Bike size={19} /></span><span><strong>{loading ? '—' : equipment.length.toString().padStart(2, '0')}</strong><small>Equipment profiles</small></span></div><div><span className="record-overview-icon"><Wrench size={19} /></span><span><strong>{loading ? '—' : records.length.toString().padStart(2, '0')}</strong><small>Service records</small></span></div><div className="record-overview-note"><CircleCheck size={17} /><span>Saved context for future inspections</span></div></div>
        <div className="maintenance-board-bar"><span>{isEquipment ? <Settings2 size={17} /> : <History size={17} />}{isEquipment ? 'Equipment register' : 'Service log'}</span><div><span>{loading ? 'Loading…' : `${visibleCount} ${visibleUnit}`}</span></div></div>
        <div className="maintenance-toolbar records-toolbar"><label className="maintenance-search"><Search size={17} /><input type="search" aria-label={isEquipment ? 'Search equipment' : 'Search service history'} value={search} onChange={event => setSearch(event.target.value)} placeholder={isEquipment ? 'Search equipment, model, or serial…' : 'Search work, equipment, or technician…'} /></label>{!isEquipment && <><label className="record-filter"><span className="sr-only">Filter by equipment</span><select aria-label="Filter by equipment" value={filterId} onChange={event => setFilterId(event.target.value)}><option value="">All equipment</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="record-filter"><span className="sr-only">Filter by service type</span><select aria-label="Filter by service type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All service types</option>{serviceTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label></>}<button className="icon-button" aria-label="Refresh records" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={17} /></button></div>
        {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span><button className="secondary-button" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
        <div className="maintenance-announcement" role="status">{announcement}</div>
        {loading ? <div className="progress-card" role="status"><span className="spinner" />Loading equipment records…</div> : !error && <>
          {isEquipment ? filteredEquipment.length > 0 && selected ? <div className="equipment-layout">
            <div className="equipment-list" aria-label="Equipment profiles">{filteredEquipment.map(item => <button key={item.id} className={`equipment-list-item ${item.id === selected.id ? 'is-selected' : ''}`} aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}><span className="asset-icon"><Bike size={20} /></span><span><strong>{item.name}</strong><small>{[item.manufacturer, item.model].filter(Boolean).join(' / ') || 'Details not recorded'}</small></span><ArrowRight size={15} /></button>)}</div>
            <section className="panel equipment-detail" aria-labelledby="equipment-name"><div className="record-detail-top"><span className="section-kicker"><BookOpen size={15} /> EQUIPMENT PROFILE</span><button className="secondary-button" onClick={() => setEditor({ kind: 'equipment', item: selected })}><Pencil size={14} /> Edit</button></div><h2 id="equipment-name">{selected.name}</h2><dl className="equipment-facts"><div><dt>Manufacturer</dt><dd>{selected.manufacturer || 'Not recorded'}</dd></div><div><dt>Model</dt><dd>{selected.model || 'Not recorded'}</dd></div><div><dt>Serial / asset number</dt><dd>{selected.serial_number || 'Not recorded'}</dd></div><div><dt>Last service</dt><dd>{selectedRecords[0] ? dateLabel(selectedRecords[0].performed_on) : '17/08/2026'}</dd></div></dl><div className="equipment-configuration"><h3><Settings2 size={16} /> Configuration notes</h3><p>{selected.configuration || 'Add components, specifications, and settings using Edit.'}</p></div><div className="record-detail-footer"><a className="text-button" href={`/service-history?equipment=${encodeURIComponent(selected.id)}`}>Service history ({selectedRecords.length}) <ArrowRight size={15} /></a><a className="secondary-button" href={`/?equipment=${encodeURIComponent(selected.id)}`}>Inspect equipment <ArrowRight size={15} /></a></div></section>
          </div> : <div className="records-empty"><BookOpen size={30} /><h2>{equipment.length ? 'No matching equipment.' : 'Build your equipment memory.'}</h2><p>{equipment.length ? 'Try another equipment name, model, or serial number.' : 'Add your first equipment profile to record its configuration and service history.'}</p>{!equipment.length && <button className="secondary-button" onClick={() => setEditor({ kind: 'equipment' })}><Plus size={16} />Add first equipment</button>}</div> : filteredRecords.length ? <div className="service-timeline" aria-label="Service records">{filteredRecords.map(record => <article key={record.id} className="panel service-entry"><div className="service-entry-date"><span className="record-overview-icon"><Wrench size={18} /></span><time dateTime={record.performed_on}>{dateLabel(record.performed_on)}</time></div><div className="service-entry-body"><div className="service-entry-top"><span className={`service-type service-type--${record.service_type}`}>{serviceTypes.find(type => type.value === record.service_type)?.label}</span><button className="icon-button" aria-label={`Edit ${record.title}`} onClick={() => setEditor({ kind: 'service', item: record })}><Pencil size={15} /></button></div><h2>{record.title}</h2><a className="service-equipment-link" href={`/equipment?equipment=${encodeURIComponent(record.equipment_id)}`}><Bike size={15} />{equipment.find(item => item.id === record.equipment_id)?.name || 'Equipment'}<ArrowRight size={13} /></a><p>{record.notes}</p><div className="service-entry-footer"><span><Check size={14} /> Work recorded</span><span>{record.performed_by ? `Performed by ${record.performed_by}` : 'Technician not recorded'}</span></div></div></article>)}</div> : <div className="records-empty"><CalendarDays size={30} /><h2>{records.length ? 'No matching service records.' : 'A history starts with the first service.'}</h2><p>{records.length ? 'Try a different search or adjust your filters.' : equipment.length ? 'Log work performed, parts replaced, and observations for your equipment.' : 'Save an equipment profile first, then record its service history.'}</p>{!equipment.length ? <a href="/equipment" className="secondary-button">Add equipment <ArrowRight size={16} /></a> : !records.length && <button className="secondary-button" onClick={() => setEditor({ kind: 'service' })}><Plus size={16} />Log first service</button>}</div>}
        </>}
        <footer className="page-footer"><span>MEKASCOPE / {isEquipment ? 'EQUIPMENT' : 'SERVICE HISTORY'}</span><span>Configuration → Inspection → Service</span></footer>
      </main>
    </div>
    {editor && <RecordEditor editor={editor} equipment={equipment} equipmentId={filterId} close={() => setEditor(null)} saved={saved} />}
  </div>
}
