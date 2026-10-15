# Hasil perbaikan audit — 15 Oktober 2026

## Sudah diterapkan

Backend lokal sudah memakai kode baru, migrasi additive sudah diterapkan, dan workflow n8n `K9ZIMlTQDCwVGVoy` sudah diimpor, dipublikasikan, serta diaktifkan setelah restart. Versi tersimpan dan versi published cocok; log runtime mengonfirmasi aktivasi.

| Temuan audit | Perbaikan |
|---|---|
| Callback n8n tanpa autentikasi | Header Auth credential `x-webhook-secret`, validasi status PAID, arah CREDIT, IDR, dan alias rekening yang diizinkan. Credential disimpan terenkripsi oleh n8n; secret backend di .env. Gunakan HTTPS jika memisahkan n8n dari host backend. |
| Callback menghidupkan transaksi selesai/FROZEN | PaymentEvents dengan ID mutasi unik; hanya WAITING_PAYMENT dapat berubah menjadi PAID. Retry event yang sama menjadi no-op; event berbeda ditolak pada transaksi yang sudah dibayar. |
| Refund/release transaksi belum didanai | Wajib PaymentEvent dan funded_amount yang cocok. Sengketa sebelum pembayaran hanya bisa dibatalkan tanpa kredit saldo. Transaksi historis dengan funding belum terverifikasi ditahan untuk rekonsiliasi. |
| Withdraw paralel melebihi saldo | Row lock pada user, debit dan insert pengajuan dalam satu transaksi PostgreSQL. |
| Saldo hilang saat pengajuan gagal | Seluruh debit/insert/jurnal rollback bersama ketika salah satu langkah gagal. |
| Timer/resolusi/reject tidak atomik | Status dicek ulang dengan row lock, saldo dan jurnal commit bersama; unique settlement key serta settled_at mencegah kredit ulang. |
| Nominal unik bertabrakan atau dipakai ulang | Reservasi session serial lintas proses, unique index untuk WAITING_PAYMENT, tanpa fallback acak saat database gagal. Nominal historis tidak dipakai ulang secara otomatis. |
| Dua buyer join bersamaan | Reservasi dan pengecekan sesi dalam transaksi database; hanya satu buyer berhasil. |
| HOLDING/FROZEN terlewat dari sesi aktif | Keduanya ikut mengunci sesi baru. Jika data lama memiliki lebih dari satu sesi, aksi ditolak agar tidak menyasar sesi secara acak. |
| Password admin default/token permanen | Password minimal 16 karakter, pemeriksaan scrypt, token sesi acak satu jam, cookie HttpOnly/SameSite, logout merevokasi sesi, rate limit login, token localStorage lama dibuang. Password lemah di konfigurasi lokal diganti otomatis dengan nilai acak. |
| Aset dashboard salah path | Vite base `/admin/`; HTML dan dua aset build sudah diuji HTTP 200 dari backend lokal. |

Tambahan: auto-sync `alter:true` di startup dihapus; perubahan schema melalui migrasi eksplisit. Mock payment lokal dinonaktifkan di .env dan tidak dapat diaktifkan pada NODE_ENV=production. Perhitungan nominal memakai integer cents dan menolak input tidak valid.

Watch list nodemon dibatasi ke source backend dan .env agar file pengujian, export workflow, serta file scratch tidak memicu restart bot berulang saat dibuat.

## Penyebab n8n yang benar-benar ditemukan

Execution 43 menyimpan versi parser Blu yang membaca `email.text`. Email Blu asli hanya memiliki HTML, sehingga parser lama menghasilkan nominal 0. Versi editor berbeda dari versi published yang sedang berjalan. Bukti SeaBank dalam execution yang sama merupakan **transfer keluar**, sehingga bukan bukti dana masuk ke escrow.

Workflow baru: `Email Trigger (IMAP)` -> `Validate incoming bank email` -> `Confirm escrow payment`.

- Filter hanya email UNSEEN dan sender bank yang dikenal; email ditandai read oleh trigger.
- Parser mendukung HTML-only, pemisah ribuan, koma desimal, memeriksa notifikasi masuk dan DMARC dari Gmail. Receipt keluar diabaikan. Nominal ambigu/gagal autentikasi menjadi error terlihat.
- Tidak ada lagi node PostgreSQL/MySQL yang mengubah saldo secara langsung.
- Callback HTTP memakai credential internal dan menghentikan execution bila callback menolak pembayaran. Email gagal harus direkonsiliasi melalui execution; jangan menganggap status email read sebagai bukti pembayaran berhasil.
- Parser baru diuji **tanpa mengirim callback** terhadap empat email dari execution 43: dua email Blu dikenali sebagai 10000.00 dan 10342.00, dua receipt keluar SeaBank diabaikan.
- Sender/format masuk DANA dan SeaBank lain tetap perlu diuji dengan contoh email masuk aslinya. Parser sengaja menolak format yang tidak dikenal. Pemeriksaan Authentication-Results saat ini khusus receiving server Gmail.

## Validasi

- `npm.cmd test`: **5 unit test lolos**, mencakup parser bank, rejection bukti tidak valid, parser workflow hasil generate, JSON filter IMAP, dan angka uang.
- `npm.cmd run test:integration`: **15 skenario PostgreSQL nyata lolos** dalam schema `escrow_test_*` yang dibuat dan dihapus oleh pengujian. Tabel public tidak dipakai untuk pengujian.
- Skenario meliputi withdraw paralel, rollback insert gagal, join paralel, nominal salah, callback duplikat, frozen tidak dapat dihidupkan, stale timer, rollback settlement, settlement paralel, refund tanpa dana, sesi hold, callback tanpa secret/FAILED, login/logout, callback sukses/refund penuh, serta fee INCLUDE dan retry timer.
- Build dashboard lolos; login backend lokal 200 dengan cookie HttpOnly, session 200, callback unsigned 403, halaman admin dan kedua aset 200.
- Migrasi baru juga diuji pada schema legacy terpisah sebelum diterapkan. Migrasi mengakomodasi kolom yang sebelumnya dibuat oleh auto-sync development.
- Riwayat tiga migrasi lama dibaseline setelah memeriksa tabel, kolom, constraint unik, dan enum yang sebelumnya dibuat melalui sync. `npm.cmd run db:migrate` kini mengonfirmasi schema sudah up to date.
- Belum ada transfer bank baru yang dilakukan untuk menguji seluruh alur produksi. Tidak ada transfer atau pencairan dana nyata yang dijalankan oleh perbaikan ini.

## Konfigurasi dan transaksi lama

Password login sekarang adalah nilai `ADMIN_PASSWORD` di `.env`; secret tidak dicetak ke chat/laporan. Backup konfigurasi sebelum perbaikan dan workflow sebelum perubahan berada di folder ignored `scratch/n8n/`. Folder tersebut mengandung konfigurasi privat dan tidak boleh di-commit atau dibagikan.

Transaksi `9dc634f7-e9b3-4633-a31b-700192ca51fe` tetap **PAID**, amount_with_code **10342.00**. Rekonsiliasi spesifik sudah dilakukan terhadap receipt masuk Blu yang terautentikasi dari execution 43: nominal cocok tepat, hanya satu transaksi memakai nominal tersebut, receipt berada dalam window pembayaran lama, dan kedua pihak memiliki saldo/deal/withdrawal nol. PaymentEvent, funded_amount 10342.00, serta waktu bukti pembayaran sudah dicatat atomik. Saldo, status PAID, dan payout tidak diubah. Menjalankan ulang rekonsiliasi menghasilkan no-op. Transaksi tersebut dapat melanjutkan proses kirim/konfirmasi/hold biasa.

Untuk transaksi historis lain, migrasi tetap tidak menganggap status PAID sebagai bukti dana. PaymentEvent/funded_amount harus direkonsiliasi terhadap receipt/mutasi bank sebelum settlement. Ini mencegah status yang sebelumnya berasal dari mock, callback palsu, atau SQL manual otomatis menjadi saldo cair.

Jurnal `BalanceEntries` mencatat seluruh mutasi saldo baru; saldo historis masih merupakan saldo pembuka yang perlu diaudit, bukan riwayat yang direkonstruksi otomatis. Kredit saldo tidak dijalankan ulang atas transaksi lama.

Sesi admin disimpan di memori proses: restart membuat admin perlu login lagi. Saat menggunakan banyak instance backend, gunakan session store bersama. Nominal transfer historis tidak didaur ulang; jika 900 variasi nominal sudah habis, gunakan referensi pembayaran yang dapat diverifikasi provider atau rekonsiliasi manual, bukan mengabaikan benturan.

File aplikasi dan .env lokal sudah diterapkan. Perubahan lokal user pada command Discord dan package-lock dashboard tetap dipertahankan; belum ada commit atau push.

## Tindak lanjut: notifikasi andal dan panel transaksi interaktif

Notifikasi pembayaran sekarang dijadwalkan di tabel `NotificationDeliveries` dalam transaksi database yang sama dengan PaymentEvent dan status PAID. Penjual/pembeli memiliki catatan pengiriman terpisah. Worker memeriksa antrean setiap 15 detik, menunggu bot siap, mencatat keberhasilan, dan mencoba ulang kegagalan dengan jeda bertambah sampai 15 menit. Lease dua menit memungkinkan pemulihan setelah proses terhenti; catatan SENT tidak dikirim ulang. Discord memakai nonce tetap untuk mengurangi duplikasi jika respons jaringan tidak pasti. Pengiriman eksternal tetap memiliki kemungkinan duplikasi saat pesan berhasil diterima platform tetapi konfirmasi pengirimannya hilang.

Untuk transaksi yang dilaporkan user, DM pembayaran untuk kedua pihak sudah tercatat SENT dan sudah diverifikasi dari pesan Discord. Rekonsiliasi yang diulang sekarang hanya melengkapi antrean/panel yang belum ada, tanpa mengubah saldo.

`TransactionPanels` menyimpan ID pesan DM per transaksi dan per pihak. Mulai pembayaran terverifikasi, panel yang sama mengikuti perubahan status, termasuk penyerahan, hold, komplain, dan selesai. Pembaruan diperiksa setiap 15 detik; edit hanya dikirim bila isi berubah. ID pesan bertahan saat restart. Pesan notifikasi pembayaran sebelumnya diadopsi dan diubah menjadi panel agar tidak membuat panel duplikat.

- Penjual pada status PAID: tombol penyerahan digital dengan catatan opsional; barang fisik menggunakan formulir ekspedisi dan resi.
- Pembeli setelah DELIVERED: tombol penerimaan, dilanjutkan konfirmasi eksplisit yang menjelaskan hold tiga jam.
- Tombol komplain membuka formulir alasan dan membekukan pencairan. Tombol tetap tersedia selama hold.
- Hak akses dan status diverifikasi lagi di service database berdasarkan ID transaksi, bukan hanya berdasarkan tombol yang terlihat. Penjual/outsider tidak dapat mengonfirmasi penerimaan atas nama pembeli.
- Tombol pengiriman/penerimaan hilang setelah statusnya tidak lagi sesuai. Panel selesai berhenti dipolling setelah pembaruan final. Telegram tetap menerima DM pembayaran dengan retry; panel tombol dalam tindak lanjut ini khusus Discord.

Saat verifikasi terakhir, transaksi user sudah DELIVERED. API Discord mengonfirmasi panel pembeli berisi tombol penerimaan, komplain, dan perbarui panel; panel penjual hanya komplain dan perbarui panel. Agent tidak menekan tombol penerimaan atau mengubah transaksi tersebut menjadi hold/selesai.

Validasi terkini: **9 unit test dan 25 skenario integrasi PostgreSQL lolos**, termasuk rollback jika insert antrean gagal, retry per penerima, lease worker, deduplikasi, digital tanpa resi, validasi pengiriman fisik, penolakan aksi pihak yang salah, adopsi pesan lama, dan pembaruan panel tanpa mengirim pesan baru. Pengujian integrasi tetap memakai schema disposable; verifikasi panel Discord dilakukan read-only setelah bot mengirim/mengedit pesan yang diminta.

## Tindak lanjut: akses admin lokal dan desain dashboard

Atas permintaan user, password lokal diubah ke nilai yang diminta dan mode `ADMIN_ALLOW_LOCAL_PASSWORD=true`. Pengecualian password pendek hanya berlaku non-production, dari koneksi loopback dengan hostname lokal dan tanpa forwarded headers. Session dari mode ini juga ditolak dari koneksi lain. Production tetap mensyaratkan password kuat. File .env sudah dimuat ulang oleh backend dan login melalui browser benar-benar berhasil, bukan hanya diverifikasi dari isi file.

Limiter login kini menghitung kegagalan saja dan mereset anggaran kegagalan setelah login berhasil. Login sah berulang tidak lagi menghabiskan kuota percobaan password.

Visual dashboard diganti: sidebar hijau gelap, latar hangat, aksen tembaga, tipografi yang lebih tenang, ringkasan dana terverifikasi, distribusi status berdasarkan data nyata, antrean tindakan, dan buku transaksi. Halaman login, sengketa, serta penarikan mengikuti desain yang sama. Data diperbarui otomatis setiap 30 detik; gangguan koneksi menampilkan pesan dan mempertahankan data terakhir. Tidak ada grafik/tren fiktif.

Build awal sempat gagal karena nama ikon tidak cocok dengan versi lucide-react yang terpasang; import sudah diperbaiki. Build akhir lolos. Halaman login, proses masuk, ringkasan, sengketa, dan penarikan sudah diperiksa pada browser; breakpoint ponsel serta menu responsif juga diperiksa. Dashboard dan aset JS/CSS merespons 200, demikian pula endpoint statistik dengan sesi sah. Screenshot hasil tersimpan di `scratch/portapay-admin-dashboard.png`.
