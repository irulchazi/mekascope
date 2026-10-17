import { Component, type ReactNode } from 'react'
import { Info, RotateCcw } from 'lucide-react'

export default class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="app-shell main-content"><div className="page-heading"><h1>Could not open the workspace.</h1><p>Reload the page to try again. Saved records remain available.</p></div><div className="error-banner" role="alert"><Info size={18} /><span>The page encountered an unexpected error.</span></div><button className="secondary-button" onClick={() => window.location.reload()}><RotateCcw size={16} />Reload workspace</button></main>
    return this.props.children
  }
}
