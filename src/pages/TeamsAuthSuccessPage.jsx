import { useEffect } from 'react'
import { authentication } from '@microsoft/teams-js'

// Auth-end page: opened by Teams as a popup, closes itself and signals success back
// to the TeamsConfigPage via authentication.notifySuccess()
export default function TeamsAuthSuccessPage() {
  useEffect(() => {
    authentication.notifySuccess()
  }, [])

  return (
    <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0073ea', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>DT</span>
      </div>
      <p style={{ color: '#666', fontSize: 14 }}>Signed in. Closing…</p>
    </div>
  )
}
