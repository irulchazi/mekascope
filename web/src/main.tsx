import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Maintenance from './Maintenance'
import EquipmentRecords from './EquipmentRecords'
import WorkspaceErrorBoundary from './WorkspaceErrorBoundary'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceErrorBoundary>{window.location.pathname.replace(/\/$/, '') === '/maintenance' ? <Maintenance /> : window.location.pathname.replace(/\/$/, '') === '/equipment' ? <EquipmentRecords page="equipment" /> : window.location.pathname.replace(/\/$/, '') === '/service-history' ? <EquipmentRecords page="service" /> : <App />}</WorkspaceErrorBoundary>
  </React.StrictMode>,
)
