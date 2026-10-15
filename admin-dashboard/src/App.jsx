import React, { useState, useEffect, useCallback } from 'react'
import { AlertCircle as CircleAlert, Check, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Disputes from './pages/Disputes'
import Withdrawals from './pages/Withdrawals'
const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === '5173' ? `${window.location.protocol}//${window.location.hostname}:3000` : window.location.origin)
export default function App() {
  const [authenticated, setAuthenticated] = useState(false), [checking, setChecking] = useState(true), [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState({}), [disputes, setDisputes] = useState([]), [withdrawals, setWithdrawals] = useState([])
  const [isRefreshing, setRefreshing] = useState(false), [isProcessing, setProcessing] = useState(false), [menu, setMenu] = useState(false), [toast, setToast] = useState(null), [lastUpdated, setLastUpdated] = useState(null), [connectionError, setConnectionError] = useState('')
  useEffect(() => { localStorage.removeItem('portapay_admin_token'); fetch(`${API}/api/admin/session`, { credentials: 'include' }).then(r => { if (r.ok) setAuthenticated(true) }).catch(() => {}).finally(() => setChecking(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer) }, [toast])
  const refresh = useCallback(async () => {
    if (!authenticated) return
    setRefreshing(true)
    try {
      const responses = await Promise.all(['stats', 'disputes', 'withdrawals'].map(path => fetch(`${API}/api/admin/${path}`, { credentials: 'include' })))
      if (responses.some(r => r.status === 401 || r.status === 403)) { setAuthenticated(false); return }
      if (responses.some(r => !r.ok)) throw Error('Data belum dapat diperbarui. Data terakhir tetap ditampilkan.')
      const [s, d, w] = await Promise.all(responses.map(r => r.json()))
      setStats(s.stats); setDisputes(d.disputes); setWithdrawals(w.withdrawals); setLastUpdated(new Date()); setConnectionError('')
    } catch (error) { setConnectionError(error.message === 'Failed to fetch' ? 'Koneksi ke server terputus. Mencoba lagi secara otomatis.' : error.message) }
    finally { setRefreshing(false) }
  }, [authenticated])
  useEffect(() => { if (!authenticated) return; refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer) }, [authenticated, refresh])
  async function logout() { try { await fetch(`${API}/api/admin/logout`, { method: 'POST', credentials: 'include' }) } finally { setAuthenticated(false); setStats({}); setDisputes([]); setWithdrawals([]); setLastUpdated(null) } }
  async function action(path, value) {
    setProcessing(true)
    try {
      const res = await fetch(`${API}/api/admin/${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: value }) })
      const data = await res.json()
      if (!res.ok || !data.success) throw Error(data.message || 'Tindakan belum berhasil.')
      setToast({ message: data.message, type: 'success' }); await refresh()
    } catch (error) { setToast({ message: error.message, type: 'error' }) }
    finally { setProcessing(false) }
  }
  if (checking) return <div className="boot-screen"><span className="brand-mark">p<span>↗</span></span><p>Menyiapkan ruang kendali…</p></div>
  if (!authenticated) return <Login apiBaseUrl={API} onLoginSuccess={() => setAuthenticated(true)} />
  const titles = { dashboard: 'Ringkasan', disputes: 'Sengketa', withdrawals: 'Penarikan dana' }
  return <div className="app-layout"><Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={logout} pendingWithdrawsCount={stats.pendingWithdrawals} frozenCount={stats.frozenDisputes} mobileMenuOpen={menu} setMobileMenuOpen={setMenu} /><main className="main-content"><Navbar title={titles[activeTab]} onRefresh={refresh} isRefreshing={isRefreshing} setMobileMenuOpen={setMenu} lastUpdated={lastUpdated} />{connectionError && <div className="connection-error" role="alert"><CircleAlert size={17} />{connectionError}</div>}{activeTab === 'dashboard' && <Dashboard stats={stats} onNavigate={setActiveTab} />}{activeTab === 'disputes' && <Disputes disputes={disputes} isProcessing={isProcessing} onResolveDispute={(id, value) => action(`disputes/${id}/resolve`, value)} />}{activeTab === 'withdrawals' && <Withdrawals withdrawals={withdrawals} isProcessing={isProcessing} onActionWithdrawal={(id, value) => action(`withdrawals/${id}/action`, value)} />}</main>{toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'success' ? <Check size={19} /> : <CircleAlert size={19} />}<span>{toast.message}</span><button aria-label="Tutup pemberitahuan" onClick={() => setToast(null)}><X size={16} /></button></div>}</div>
}
