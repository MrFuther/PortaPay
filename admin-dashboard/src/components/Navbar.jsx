import React from 'react'
import { RefreshCw, Menu, ChevronRight } from 'lucide-react'
export default function Navbar({ title, onRefresh, isRefreshing, setMobileMenuOpen, lastUpdated }) {
  return <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Buka menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button><span>Ruang kerja</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-right"><span className="sync-label"><i className={lastUpdated ? 'live-dot' : 'waiting-dot'} />{isRefreshing ? 'Memperbarui data' : lastUpdated ? `Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Menunggu data'}</span><button id="refresh-data-btn" className="icon-button refresh" aria-label="Perbarui data" onClick={onRefresh} disabled={isRefreshing}><RefreshCw size={17} className={isRefreshing ? 'spin' : ''} /></button></div></header>
}
