import { ArrowRight, BookOpen, ClipboardCheck, History, ScanLine } from 'lucide-react'

const links = [
  { href: '/', label: 'Inspection', description: 'Observe to action', icon: ScanLine },
  { href: '/maintenance', label: 'Maintenance', description: 'Track approved tasks', icon: ClipboardCheck },
  { href: '/equipment', label: 'Equipment', description: 'Configuration and details', icon: BookOpen },
  { href: '/service-history', label: 'Service history', description: 'Record completed work', icon: History },
]

export default function WorkspaceLinks({ active = '/', compact = false }: { active?: string; compact?: boolean }) {
  return <div className={`workspace-links ${compact ? 'workspace-links--compact' : ''}`}>
    {links.filter(link => !compact || link.href !== '/').map(({ href, label, description, icon: Icon }) => <a key={href} href={href} data-tip={description} className={`stage-button ${active === href ? 'is-active' : ''}`} aria-current={active === href ? 'page' : undefined}>
      <span className="stage-icon"><Icon size={18} /></span><span className="stage-text"><b>{label}</b></span>{active !== href && <ArrowRight className="stage-status" size={14} />}
    </a>)}
  </div>
}
