import React, { useState } from 'react'
import { ArrowUpRight, ArrowRight, Eye, EyeOff, Lock as LockKeyhole, ShieldCheck, AlertCircle as CircleAlert } from 'lucide-react'
export default function Login({ onLoginSuccess, apiBaseUrl }) {
  const [password, setPassword] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [show, setShow] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const data = await res.json()
      if (res.ok && data.success) onLoginSuccess()
      else setError(data.message || 'Belum berhasil masuk. Periksa password Anda.')
    } catch { setError('Server belum terhubung. Coba lagi beberapa saat.') }
    finally { setLoading(false) }
  }
  return <main className="login-layout">
    <section className="login-story"><a className="brand" href="#"><span className="brand-mark">p<span>↗</span></span><span>porta<span className="brand-light">pay</span></span></a><div className="story-content"><div className="eyebrow light">BUILT ON TRUST. RUN WITH CLARITY.</div><h1>Di balik setiap<br />kesepakatan<span className="accent-text"> yang<br />terjaga.</span></h1><p>Ruang kendali untuk menjaga dana,<br />menyelesaikan sengketa, dan menuntaskan transaksi.</p><div className="story-ledger"><div><span>01</span><strong>Verifikasi pembayaran</strong><ShieldCheck size={18} /></div><div><span>02</span><strong>Jaga dana bersama</strong><LockKeyhole size={18} /></div><div><span>03</span><strong>Tuntaskan kesepakatan</strong><ArrowUpRight size={18} /></div></div></div><footer>PORTAPAY OPERATIONS <span>KEPERCAYAAN DALAM SETIAP TRANSAKSI</span></footer></section>
    <section className="login-form-side"><div className="login-top-note"><span className="little-square" /> AKSES ADMINISTRATOR</div><div className="login-form"><div className="login-number">/ 01</div><h2>Selamat datang<br />kembali.</h2><p>Masuk untuk melanjutkan operasional PortaPay.</p>{error && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}<form onSubmit={submit}><label htmlFor="admin-password-input">Password admin</label><div className="password-wrap"><LockKeyhole size={18} /><input id="admin-password-input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan password Anda" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><button id="admin-login-submit-btn" className="button primary login-submit" disabled={loading}>{loading ? 'Memverifikasi…' : 'Masuk ke ruang kendali'}<ArrowRight size={19} /></button></form><div className="login-security"><ShieldCheck size={15} /> Sesi privat untuk pengelola yang berwenang.</div></div><footer>PortaPay <span>Ruang kendali rekber.</span></footer></section>
  </main>
}
