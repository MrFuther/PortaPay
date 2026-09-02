import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Disputes from './pages/Disputes'
import Withdrawals from './pages/Withdrawals'

const API_BASE_URL = window.location.origin.includes('5173') 
  ? `http://${window.location.hostname}:3000` 
  : window.location.origin

export default function App() {
  const [authToken, setAuthToken] = useState(localStorage.getItem('portapay_admin_token') || '')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState({
    totalVolume: 0,
    activeDeals: 0,
    frozenDisputes: 0,
    pendingWithdrawals: 0,
    totalCompletedDeals: 0
  })
  const [disputes, setDisputes] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [notification, setNotification] = useState(null)

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const fetchAllData = async () => {
    if (!authToken) return
    setIsRefreshing(true)
    try {
      const headers = { Authorization: `Bearer ${authToken}` }

      const [statsRes, disputesRes, withdrawRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/disputes`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/withdrawals`, { headers })
      ])

      if (statsRes.status === 401 || statsRes.status === 403) {
        handleLogout()
        return
      }

      if (statsRes.ok) {
        const data = await statsRes.json()
        if (data.success) setStats(data.stats)
      }

      if (disputesRes.ok) {
        const data = await disputesRes.json()
        if (data.success) setDisputes(data.disputes)
      }

      if (withdrawRes.ok) {
        const data = await withdrawRes.json()
        if (data.success) setWithdrawals(data.withdrawals)
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (authToken) {
      fetchAllData()
    }
  }, [authToken])

  const handleLoginSuccess = (token) => {
    localStorage.setItem('portapay_admin_token', token)
    setAuthToken(token)
    showNotification('Berhasil masuk sebagai Admin!')
  }

  const handleLogout = () => {
    localStorage.removeItem('portapay_admin_token')
    setAuthToken('')
  }

  const handleResolveDispute = async (disputeId, action) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ action })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotification(data.message, 'success')
        fetchAllData()
      } else {
        showNotification(data.message || 'Gagal memproses sengketa.', 'danger')
      }
    } catch (err) {
      showNotification('Terjadi kesalahan koneksi.', 'danger')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleActionWithdrawal = async (id, action) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/withdrawals/${id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ action })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        showNotification(data.message, 'success')
        fetchAllData()
      } else {
        showNotification(data.message || 'Gagal memproses penarikan dana.', 'danger')
      }
    } catch (err) {
      showNotification('Terjadi kesalahan koneksi.', 'danger')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!authToken) {
    return <Login onLoginSuccess={handleLoginSuccess} apiBaseUrl={API_BASE_URL} />
  }

  const tabTitles = {
    dashboard: '📊 Overview Dashboard',
    disputes: '⚠️ Kelola Komplain Transaksi',
    withdrawals: '💸 Pengajuan Penarikan Dana'
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        pendingWithdrawsCount={stats.pendingWithdrawals}
        frozenCount={stats.frozenDisputes}
      />

      <main className="main-content">
        <Navbar
          title={tabTitles[activeTab]}
          onRefresh={fetchAllData}
          isRefreshing={isRefreshing}
        />

        {notification && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '14px 20px',
            borderRadius: '12px',
            background: notification.type === 'danger' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)',
            color: '#fff',
            fontWeight: '600',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            backdropFilter: 'blur(8px)'
          }}>
            {notification.type === 'danger' ? '❌' : '✅'} {notification.message}
          </div>
        )}

        {activeTab === 'dashboard' && <Dashboard stats={stats} />}

        {activeTab === 'disputes' && (
          <Disputes
            disputes={disputes}
            onResolveDispute={handleResolveDispute}
            isProcessing={isProcessing}
          />
        )}

        {activeTab === 'withdrawals' && (
          <Withdrawals
            withdrawals={withdrawals}
            onActionWithdrawal={handleActionWithdrawal}
            isProcessing={isProcessing}
          />
        )}
      </main>
    </div>
  )
}
