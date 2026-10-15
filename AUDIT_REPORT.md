# Laporan audit PortaPay

> Tindak lanjut: lihat [FIX_REPORT.md](FIX_REPORT.md) untuk perbaikan yang sudah diterapkan dan hasil validasi. Isi di bawah adalah snapshot kondisi saat audit awal.

Tanggal: 15 Oktober 2026. Scope: source working tree saat audit, backend escrow, payment webhook, withdrawal, timer, adapter Discord/Telegram, model/migrasi, serta dashboard admin. Perubahan lokal sebelumnya pada `adapters/discord/commands.js` dan `admin-dashboard/package-lock.json` dipertahankan.

## Kesimpulan

Belum layak menangani dana nyata. Risiko utama adalah pembayaran palsu, saldo tanpa dana pendukung, pencairan berulang, dan saldo hilang ketika operasi gagal di tengah jalan. Ini hasil review kode dan simulasi terisolasi; bukan bukti eksploitasi pada deployment atau verifikasi konfigurasi server yang sedang berjalan.

Arsitektur: Express menerima callback dan API admin; Discord/Telegram memakai service escrow bersama; PostgreSQL melalui Sequelize menyimpan status dan saldo; timer menyelesaikan hold setiap menit; React menjadi panel admin. Alur normal: WAITING_BUYER -> WAITING_PAYMENT -> PAID -> DELIVERED -> COMPLETED_HOLDING -> COMPLETED. FROZEN memerlukan resolusi admin.

Prioritas: P0 = blokir sebelum dana nyata, P1 = perbaiki sebelum deployment publik, P2 = perbaikan fungsi/operasional.

## 1. P0 — Callback n8n bisa mengesahkan pembayaran tanpa autentikasi

Lokasi: `webhook/handler.js:43-58`, mount `index.js:31`.

Endpoint publik `POST /tripay/n8n/callback` langsung memakai transaction_id/payment_ref/nominal_mutasi tanpa signature, shared secret, atau verifikasi sumber. Field status dibaca tetapi tidak diperiksa. Simulasi handler menerima request tanpa header autentikasi dengan status FAILED dan mengembalikan PAID. Jika endpoint terjangkau, pengetahuan ID transaksi cukup untuk memalsukan pembayaran, tanpa transfer uang.

Mitigasi: sementara tutup endpoint dari internet. Tambahkan autentikasi HMAC atas raw body, timestamp dan batas usia request; validasi schema, arah mutasi masuk, status sukses, nominal, mata uang, serta rekening tujuan. Simpan ID mutasi unik agar satu mutasi hanya dipakai sekali. Autentikasi perlu disertai validasi bisnis, bukan menggantikannya.

## 2. P0 — Callback ulang menghidupkan transaksi selesai atau sengketa

Lokasi: `services/escrow.js:190-208`.

`markAsPaid` mencari transaksi tanpa syarat status lalu selalu menulis PAID. Callback terlambat/retry bisa mengubah FROZEN, COMPLETED, CANCELLED, atau DELIVERED menjadi PAID. Simulasi membuktikan FROZEN -> PAID. Pada transaksi COMPLETED, siklus kirim/konfirmasi dapat diulang sehingga berisiko kredit saldo kedua kali. Callback sah pun bisa memicu bug ini.

Mitigasi: transisi atomik hanya WAITING_PAYMENT -> PAID, cek jumlah baris yang berubah. Callback duplikat menjadi no-op yang sukses. Ikat payment event unik ke transaksi; jangan mencocokkan nominal ke transaksi historis secara bebas. Terapkan aturan transisi terpusat untuk semua jalur.

## 3. P0 — Refund/release sengketa bisa menciptakan saldo dari transaksi belum dibayar

Lokasi: `services/escrow.js:217-234`, `routes/admin.js:100-136`.

Komplain diizinkan saat WAITING_PAYMENT bahkan WAITING_BUYER. Setelah FROZEN, admin dapat memilih REFUND_BUYER atau RELEASE_SELLER tanpa bukti dana pernah diterima. Simulasi transaksi belum dibayar dengan amount_with_code 101123 menghasilkan saldo buyer 101123 saat refund. Kesalahan operator cukup untuk menciptakan saldo; bukan endpoint tanpa autentikasi.

Mitigasi: simpan payment event terverifikasi dan funded_amount yang tidak hilang saat status dibekukan. Larang refund/release melebihi dana escrow tersisa. Untuk sengketa belum didanai, sediakan cancel tanpa kredit saldo. Tampilkan bukti pembayaran dan dana tersedia di panel admin.

## 4. P0 — Withdraw paralel dapat melebihi saldo

Lokasi: `services/withdrawal.js:26-44`.

Saldo dibaca, dibandingkan, lalu ditulis sebagai nilai absolut tanpa transaksi/row lock. Dua request dapat membaca saldo lama yang sama. Simulasi dua request Rp80.000 dari saldo Rp100.000 menghasilkan dua pengajuan sukses senilai Rp160.000, tetapi saldo akhir masih Rp20.000.

Mitigasi: transaksi database mencakup debit dan insert withdrawal. Gunakan conditional debit `balance >= amount` dengan pemeriksaan affected rows atau SELECT FOR UPDATE pada user. Tambahkan idempotency key per permintaan dan constraint saldo nonnegatif. Uji paralel pada PostgreSQL nyata sebelum produksi.

## 5. P1 — Gagal insert withdrawal tetap mengurangi saldo

Lokasi: `services/withdrawal.js:40-55`.

Saldo dipotong sebelum Withdrawal.create. Jika insert gagal, catch hanya mengembalikan pesan error. Simulasi kegagalan insert membuat saldo turun Rp100.000 -> Rp20.000 tanpa pengajuan yang bisa diproses admin.

Mitigasi: debit dan pengajuan harus commit/rollback bersama dalam satu transaksi database. Validasi bank/account/nominal sebelum mutasi. Catat jurnal saldo agar rekonsiliasi dapat menemukan dan memperbaiki kejadian lama.

## 6. P0 — Settlement dan resolusi admin tidak atomik atau aman dari eksekusi ulang

Lokasi: `services/timer.js:14-60`, `routes/admin.js:100-136,180-199`.

Timer menulis COMPLETED sebelum kredit saldo seller. Kegagalan sesudah update meninggalkan transaksi selesai tanpa saldo; timer berikutnya tidak mengambilnya lagi. Simulasi membuktikan kondisi ini. Timer juga memakai hasil query lama tanpa cek ulang/lock: jika komplain membekukan transaksi setelah query, finalizer masih dapat mencairkan. Worker ganda atau operasi admin bersamaan dapat memproses status lama; pola saldo read-modify-write juga bisa menimpa perubahan saldo lain. Reject withdrawal punya celah kegagalan serupa karena status REJECTED ditulis sebelum pengembalian saldo.

Mitigasi: row lock dan pengecekan status/expiry di dalam transaksi database yang sama dengan seluruh jurnal dan mutasi saldo. Gunakan settlement/refund key unik untuk menjamin satu kredit per peristiwa. Terapkan kenaikan saldo atomik dalam transaksi. Kirim notifikasi setelah commit, idealnya lewat outbox. Lock saja tidak cukup bila pemeriksaan status tetap memakai data lama.

## 7. P1 — Nominal pembayaran tidak dijamin unik dan bisa dipakai ulang

Lokasi: `services/payment/n8n.js:10-40`, `services/escrow.js:197-205`, `db/models/transaction.js:84-96`.

Generator hanya memeriksa transaksi WAITING_PAYMENT yang dibuat dua jam terakhir. Tidak ada expiry yang menutup transaksi lama. Sesi yang baru di-join pun dapat memiliki createdAt lama. Dua join paralel juga bisa lolos cek nominal yang sama sebelum salah satunya menyimpan hasil. Fallback ketika query error atau percobaan habis tetap menghasilkan kode tanpa pengecekan benturan. Pencarian callback berdasarkan nominal tidak membatasi status atau waktu dan menggunakan findOne, sehingga bisa menandai transaksi yang salah, termasuk historis.

Mitigasi: reservasi nominal pembayaran secara atomik dengan unique constraint untuk pembayaran aktif, retry saat konflik, gagal tertutup saat database error, serta expiry berdasarkan waktu instruksi diterbitkan. Untuk mutasi nominal yang ambigu, karantina untuk rekonsiliasi; jangan memilih transaksi sembarang. Simpan ID mutasi unik agar transfer lama tidak menjadi pembayaran sesi baru.

## 8. P1 — Dua buyer bisa sama-sama join satu sesi

Lokasi: `services/escrow.js:68-100`.

Dua request membaca WAITING_BUYER sebelum update. Keduanya bisa menerima instruksi pembayaran sukses, tetapi buyer_id dan nominal terakhir menimpa yang pertama. Buyer pertama bisa membayar instruksi yang sudah tidak terkait dengannya. Pengecekan satu sesi per user juga memiliki pola check-then-insert yang sama.

Mitigasi: lock user dan transaksi dengan urutan konsisten, cek ulang status di dalam transaksi database, reservasi instruksi bayar, lalu commit sekali. Pastikan hanya satu buyer memenangkan transisi WAITING_BUYER. Uji join paralel serta cancel versus join.

## 9. P1 — Hold/FROZEN tidak dianggap sesi aktif, komplain dapat menyasar sesi lain

Lokasi: `services/escrow.js:8,23-35,217-226`.

getActiveTransaction mengabaikan COMPLETED_HOLDING dan FROZEN. User dapat membuat/join sesi baru selama hold. triggerDispute memilih findOne tanpa ID/order dari beberapa status termasuk hold. Ketika ada sesi baru dan sesi hold lama, komplain tidak menjamin membekukan transaksi yang dimaksud. Lookup /status juga menyembunyikan dana dalam hold/sengketa. Simulasi mengonfirmasi kedua status dikecualikan.

Mitigasi: samakan definisi sesi yang mengunci user, termasuk hold/sengketa jika aturan bisnis tetap satu sesi. Perintah komplain harus menargetkan transaction_id dan memeriksa kepemilikan; tampilkan semua transaksi yang relevan jika lebih dari satu memang diizinkan.

## 10. P1 — Admin memakai password default dan token permanen berupa password asli

Lokasi: `routes/admin.js:10-32`, `admin-dashboard/src/App.jsx:16,88-95`.

Saat ADMIN_PASSWORD kosong, fallback yang diketahui adalah admin12345. Login mengembalikan password asli sebagai bearer token, disimpan di localStorage; tidak ada expiry atau rate limit di source. Logout hanya menghapus salinan browser, sehingga token yang sudah tersalin tetap berlaku hingga password dirotasi. Keterjangkauan internet/TLS/proxy deployment tidak diverifikasi.

Mitigasi: fail startup jika kredensial belum dikonfigurasi atau memakai default. Gunakan hash password, session berumur terbatas lewat cookie HttpOnly/Secure/SameSite, logout/revokasi server, rate limit, dan HTTPS. Batasi akses jaringan admin sebagai mitigasi sementara.

## 11. P2 — Build dashboard sukses tetapi path aset salah untuk /admin

Lokasi: `admin-dashboard/vite.config.js:5`, `index.js:34`.

Build aktual menghasilkan `/assets/index-*.js` dan `/assets/index-*.css`. Express hanya menyediakan dist pada `/admin`, sehingga browser meminta aset di root yang tidak disajikan aplikasi. Dashboard berpotensi kosong pada deployment sesuai source saat ini. Reverse proxy eksternal yang menambahkan route aset dapat mengubah gejalanya; konfigurasi itu tidak ditinjau.

Mitigasi: set Vite base `/admin/`, build ulang, lalu verifikasi HTTP `/admin/` dan seluruh URL aset menghasilkan 200 beserta MIME type yang benar.

## Validasi yang dilakukan

- `node scripts/audit-repro.cjs`: sukses, tujuh skenario bug terkonfirmasi melalui dependency in-memory. Script menjalankan source service/handler sebenarnya dengan dependency pengganti; tidak membaca .env atau menghubungi DB/platform. Ini reproduksi kondisi logika, bukan uji konkurensi PostgreSQL.
- `node --check` untuk file JavaScript di adapters/services/routes/webhook/db/scripts: lolos.
- `npm.cmd run build` pada admin-dashboard: lolos; hasil HTML dipakai memverifikasi path aset.
- Tidak ada script test di package.json backend. Belum dilakukan E2E Discord/Telegram, integrasi n8n/Tripay, migrasi DB aktual, load test, atau audit dependency advisory. Tidak ada klaim sistem bebas bug lain.
- Kode aplikasi tidak diperbaiki dalam audit. File baru: laporan ini dan script reproduksi; folder dist dihasilkan oleh build.

## Urutan mitigasi

1. Sebelum memakai dana nyata: batasi callback/admin dari publik, nonaktifkan mock payment di produksi, wajibkan secret valid; tutup temuan 1-3.
2. Jadikan ledger/jurnal saldo sumber kebenaran. Atomikkan payment, settlement, refund, dan withdrawal; tambahkan constraint serta idempotency key untuk temuan 4-8. Rekonsiliasi saldo lama dengan mutasi dana dan riwayat payout sebelum mengaktifkan kembali.
3. Perbaiki pemilihan sesi/komplain, autentikasi admin, dan base URL dashboard.
4. Gate rilis dengan integration test PostgreSQL: webhook duplikat, dua withdraw bersamaan, join bersamaan, freeze vs timer, kegagalan database di setiap langkah mutasi saldo, refund belum didanai, serta uji HTTP dashboard produksi. Assertion script reproduksi saat ini sengaja membuktikan bug; setelah perbaikan, ubah menjadi assertion perilaku yang aman.
