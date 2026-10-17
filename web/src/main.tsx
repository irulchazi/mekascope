import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Maintenance from './Maintenance'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/$/, '') === '/maintenance' ? <Maintenance /> : <App />}
  </React.StrictMode>,
)
