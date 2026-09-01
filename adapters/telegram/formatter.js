const fmt = {
  help() {
    return (
      `👋 *Selamat datang di PortaPay BOT!*\n\n` +
      `Perintah yang tersedia:\n` +
      `🔹 /rekber <harga> <INC/EXC> <nama barang> — Buat sesi rekber\n` +
      `🔹 /join <id> — Join sesi sebagai pembeli\n` +
      `🔹 /kirim <ekspedisi> <nomor\\_resi> — Tandai barang dikirim\n` +
      `🔹 /terima — Lihat resi & konfirmasi terima barang\n` +
      `🔹 /konfirmasi — Selesaikan transaksi\n` +
      `🔹 /komplain — Ajukan komplain / bekukan transaksi\n` +
      `🔹 /withdraw <nominal> <metode> <rekening> <nama> — Tarik saldo\n` +
      `🔹 /status — Cek status transaksi aktif\n\n` +
      `⚠️ Setiap user hanya bisa punya 1 transaksi aktif.`
    )
  },

  sessionCreated(trx) {
    const totalAmount = trx.fee_type === 'EXCLUDE' ? Number(trx.amount) + Number(trx.fee) : Number(trx.amount)
    return (
      `✅ *Sesi Rekber Dibuat!*\n\n` +
      `📋 *ID Transaksi:*\n\`${trx.id}\`\n\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `💰 *Nominal:* Rp ${Number(trx.amount).toLocaleString('id-ID')}\n` +
      `🏷️ *Fee (${process.env.FEE_PERCENT}% - ${trx.fee_type}):* Rp ${Number(trx.fee).toLocaleString('id-ID')}\n\n` +
      `📨 Kirim ID transaksi ini ke pembeli\n` +
      `Pembeli ketik: /join ${trx.id}`
    )
  },

  paymentInstruction(trx, seller) {
    const totalAmount = trx.amount_with_code 
      ? Number(trx.amount_with_code) 
      : (trx.fee_type === 'EXCLUDE' ? Number(trx.amount) + Number(trx.fee) : Number(trx.amount))
    const uniqueCode = trx.unique_code || 0
    
    // Calculate win rate
    const totalDeals = seller ? seller.total_deals : 0
    const failedDeals = seller ? seller.failed_deals : 0
    const successfulDeals = totalDeals - failedDeals
    const winRate = totalDeals > 0 ? Math.round((successfulDeals / totalDeals) * 100) : 100
    const trustScore = seller ? seller.trust_score : 100

    const danaNum = process.env.PAYMENT_DANA_NUMBER || '081234567890'
    const seaNum = process.env.PAYMENT_SEABANK_NUMBER || '901234567890'
    const accName = process.env.PAYMENT_ACCOUNT_NAME || 'PortaPay Escrow'

    return (
      `💳 *Instruksi Pembayaran Transfer (n8n Auto-Check)*\n\n` +
      `👤 *Penjual:* ${seller ? seller.username : 'Unknown'}\n` +
      `⭐ *Trust Score:* ${trustScore} (Win Rate: ${winRate}% dari ${totalDeals} transaksi)\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `💰 *TOTAL TRANSFER (WAJIB PERSIS):*\n*Rp ${totalAmount.toLocaleString('id-ID')}*\n` +
      `🔑 *Kode Unik:* \`${uniqueCode}\` (Sudah termasuk)\n\n` +
      `🏦 *Rekening Pembayaran:*\n` +
      `📱 DANA: \`${danaNum}\`\n` +
      `🏦 SeaBank: \`${seaNum}\`\n` +
      `👤 a/n: ${accName}\n\n` +
      `⚠️ *PENTING:* Transfer *HARUS SAMA PERSIS* nominal di atas (termasuk 3 digit kode unik) agar n8n dapat mendeteksi mutasi secara otomatis!`
    )
  },

  delivered(trx) {
    return (
      `📦 *Barang Telah Dikirim!*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `🚚 *Ekspedisi:* ${trx.resi_expedition}\n` +
      `🔢 *Nomor Resi:* \`${trx.resi_number}\`\n\n` +
      `Ketik /terima untuk melihat detail resi dan konfirmasi penerimaan.`
    )
  },

  resiInfo(trx) {
    return (
      `📦 *Informasi Pengiriman*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `🚚 *Ekspedisi:* ${trx.resi_expedition}\n` +
      `🔢 *Nomor Resi:* \`${trx.resi_number}\`\n\n` +
      `Sudah menerima barang?\n` +
      `Ketik /konfirmasi untuk menyelesaikan transaksi.\n` +
      `Ketik /komplain jika ada masalah dengan barang.`
    )
  },

  dispute(trx, reason) {
    return (
      `⚠️ *Komplain Diajukan — Transaksi Di-Freeze!*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `💰 *Nominal:* Rp ${Number(trx.amount).toLocaleString('id-ID')}\n` +
      `📝 *Alasan:* ${reason || '_Tidak ada deskripsi_'}\n\n` +
      `🛑 Transaksi ini telah dibekukan (*FROZEN*). Timer otomatis dihentikan dan dana ditahan.\n` +
      `Silakan hubungi Admin untuk penanganan kasus ini.`
    )
  },

  completed(trx) {
    return (
      `🎉 *Transaksi Selesai!*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `💰 *Nominal:* Rp ${Number(trx.amount).toLocaleString('id-ID')}\n\n` +
      `Terima kasih telah menggunakan Rekber Bot!`
    )
  },

  status(trx) {
    const statusMap = {
      WAITING_BUYER: '⏳ Menunggu pembeli',
      WAITING_PAYMENT: '💳 Menunggu pembayaran',
      PAID: '✅ Pembayaran diterima',
      DELIVERED: '📦 Barang dikirim',
      COMPLETED_HOLDING: '🕒 Dalam Penahanan (Emergency Hold)',
      COMPLETED: '🎉 Selesai',
      DISPUTED: '⚠️ Dispute',
      FROZEN: '🧊 Dibekukan (FROZEN)',
      CANCELLED: '❌ Dibatalkan'
    }
    return (
      `📊 *Status Transaksi*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n` +
      `📦 *Barang:* ${trx.description}\n` +
      `💰 *Nominal:* Rp ${Number(trx.amount).toLocaleString('id-ID')}\n` +
      `🏷️ *Status:* ${statusMap[trx.status] || trx.status}`
    )
  },

  error(message) {
    return `❌ Error: ${message}`
  },

  withdrawRequested(withdrawal, newBalance) {
    return (
      `💸 *Pengajuan Penarikan Dana Berhasil*\n\n` +
      `📋 *ID Pengajuan:* \`${withdrawal.id}\`\n` +
      `💸 *Nominal Ditarik:* Rp ${Number(withdrawal.amount).toLocaleString('id-ID')}\n` +
      `🏦 *Tujuan:* ${withdrawal.bank_name} - \`${withdrawal.account_number}\`\n` +
      `👤 *Atas Nama:* ${withdrawal.account_name}\n` +
      `💰 *Saldo Tersisa:* Rp ${Number(newBalance).toLocaleString('id-ID')}\n` +
      `🏷️ *Status:* ⏳ PENDING (Menunggu Admin)`
    )
  }
}

module.exports = fmt