import React from 'react'
import { LayoutDashboard, ShieldAlert, ArrowUpRight, LogOut, X, ShieldCheck } from 'lucide-react'
export default function Sidebar({ activeTab, setActiveTab, onLogout, pendingWithdrawsCount, frozenCount, mobileMenuOpen, setMobileMenuOpen }) {
  const items = [{ id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard }, { id: 'disputes', label: 'Sengketa', icon: ShieldAlert, count: frozenCount }, { id: 'withdrawals', label: 'Penarikan dana', icon: ArrowUpRight, count: pendingWithdrawsCount }]
  return <>
    {mobileMenuOpen && <button className="sidebar-backdrop" aria-label="Tutup navigasi" onClick={() => setMobileMenuOpen(false)} />}
    <aside className={`sidebar ${mobileMenuOpen ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setActiveTab('dashboard') }}><span className="brand-mark">p<span>↗</span></span><span>porta<span className="brand-light">pay</span><small>ESCROW OPERATIONS</small></span></a>
      <button className="sidebar-close icon-button" aria-label="Tutup menu" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button>
      <div className="nav-caption">RUANG KERJA <span>01</span></div>
      <nav className="sidebar-nav">{items.map(item => <button key={item.id} id={`nav-${item.id}-btn`} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false) }}><item.icon size={19} strokeWidth={1.6} /><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>)}</nav>
      <div className="sidebar-note"><ShieldCheck size={22} strokeWidth={1.4} /><h3>Kepercayaan,<br />dijaga bersama.</h3><p>Setiap dana punya jejak.<br />Setiap keputusan punya alasan.</p><span>PORTAPAY / ADMINISTRATOR</span></div>
      <div className="sidebar-user"><span className="avatar">A</span><div><strong>Administrator</strong><small>Pengelola operasional</small></div><button id="logout-btn" className="icon-button" title="Keluar" aria-label="Keluar admin" onClick={onLogout}><LogOut size={18} /></button></div>
    </aside>
  </>
}
