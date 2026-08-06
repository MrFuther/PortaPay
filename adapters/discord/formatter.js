const formatter = {
  sessionCreated(trx) {
    const totalAmount = trx.fee_type === 'EXCLUDE' ? Number(trx.amount) + Number(trx.fee) : Number(trx.amount)
    const typeLabel = trx.type === 'DIGITAL' ? '💻 Digital (Tanpa Resi)' : '📦 Fisik (Perlu Resi)'
    const feeLabel = trx.fee_type === 'EXCLUDE' ? 'Exclude' : 'Include'
    return {
      embeds: [{
        title: '✅ Sesi Rekber Dibuat!',
        color: 0x00b894,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '🏷️ Jenis', value: typeLabel, inline: true },
          { name: '💰 Nominal', value: `Rp ${Number(trx.amount).toLocaleString('id-ID')}`, inline: true },
          { name: '💸 Fee', value: `Rp ${Number(trx.fee).toLocaleString('id-ID')} (${feeLabel})`, inline: true },
          { name: '📨 Info', value: `Kirim ID transaksi ke pembeli\nPembeli ketik: \`/join id:${trx.id}\`` }
        ],
        timestamp: new Date()
      }]
    }
  },

  paymentInstruction(trx, seller) {
    const totalAmount = trx.amount_with_code 
      ? Number(trx.amount_with_code) 
      : (trx.fee_type === 'EXCLUDE' ? Number(trx.amount) + Number(trx.fee) : Number(trx.amount))
    const uniqueCode = trx.unique_code || 0
    const typeLabel = trx.type === 'DIGITAL' ? '💻 Digital (Tanpa Resi)' : '📦 Fisik (Perlu Resi)'
    
    // Calculate win rate
    const totalDeals = seller ? seller.total_deals : 0
    const failedDeals = seller ? seller.failed_deals : 0
    const successfulDeals = totalDeals - failedDeals
    const winRate = totalDeals > 0 ? Math.round((successfulDeals / totalDeals) * 100) : 100
    const trustScore = seller ? seller.trust_score : 100

    const danaNum = process.env.PAYMENT_DANA_NUMBER || '081234567890'
    const seaNum = process.env.PAYMENT_SEABANK_NUMBER || '901234567890'
    const accName = process.env.PAYMENT_ACCOUNT_NAME || 'PortaPay Escrow'

    return {
      embeds: [{
        title: '💳 Instruksi Pembayaran Transfer (n8n Auto-Check)',
        color: 0x0984e3,
        fields: [
          { name: '👤 Penjual', value: `${seller ? seller.username : 'Unknown'}` },
          { name: '⭐ Trust Score', value: `${trustScore} (Win Rate: ${winRate}% dari ${totalDeals} transaksi)`, inline: true },
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '🏷️ Jenis', value: typeLabel, inline: true },
          { name: '💰 TOTAL TRANSFER (WAJIB PERSIS)', value: `**Rp ${totalAmount.toLocaleString('id-ID')}**`, inline: false },
          { name: '🔑 Kode Unik', value: `\`${uniqueCode}\` (Sudah termasuk di nominal total)`, inline: true },
          { 
            name: '🏦 Rekening Pembayaran', 
            value: `📱 **DANA:** \`${danaNum}\`\n🏦 **SeaBank:** \`${seaNum}\`\n👤 **a/n:** ${accName}`, 
            inline: false 
          },
          { name: '⚠️ PENTING', value: 'Transfer **HARUS SAMA PERSIS** nominal di atas (termasuk 3 digit kode unik) agar n8n dapat mendeteksi mutasi secara otomatis!' }
        ],
        timestamp: new Date()
      }]
    }
  },

  delivered(trx) {
    return {
      embeds: [{
        title: '📦 Barang Telah Dikirim!',
        color: 0xfdcb6e,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📨 Info', value: `Ketik \`/terima ${trx.id}\` jika barang sudah diterima.` }
        ],
        timestamp: new Date()
      }]
    }
  },

  completed(trx) {
    return {
      embeds: [{
        title: '🎉 Transaksi Selesai!',
        color: 0x6c5ce7,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '💰 Nominal', value: `Rp ${Number(trx.amount).toLocaleString('id-ID')}`, inline: true },
          { name: '🙏 Info', value: 'Terima kasih telah menggunakan Rekber Bot!' }
        ],
        timestamp: new Date()
      }]
    }
  },

  status(trx) {
    const statusMap = {
      WAITING_BUYER: '⏳ Menunggu pembeli',
      WAITING_PAYMENT: '💳 Menunggu pembayaran',
      PAID: '✅ Pembayaran diterima',
      DELIVERED: '📦 Barang dikirim',
      COMPLETED: '🎉 Selesai',
      DISPUTED: '⚠️ Dispute',
      CANCELLED: '❌ Dibatalkan'
    }
    return {
      embeds: [{
        title: '📊 Status Transaksi',
        color: 0x636e72,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '💰 Nominal', value: `Rp ${Number(trx.amount).toLocaleString('id-ID')}`, inline: true },
          { name: '🏷️ Status', value: statusMap[trx.status] || trx.status }
        ],
        timestamp: new Date()
      }]
    }
  },

  resiInfo(trx) {
    return {
      embeds: [{
        title: '📦 Informasi Pengiriman',
        color: 0xfdcb6e,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '🚚 Ekspedisi', value: trx.resi_expedition, inline: true },
          { name: '🔢 Nomor Resi', value: `\`${trx.resi_number}\`` },
          { name: '✅ Konfirmasi', value: 'Ketik `/konfirmasi` jika barang sudah diterima.' },
          { name: '⚠️ Dispute', value: 'Ketik `/dispute` jika ada masalah.' }
        ],
        timestamp: new Date()
      }]
    }
  },

  dispute(trx) {
    return {
      embeds: [{
        title: '⚠️ Dispute Transaksi',
        color: 0xe17055,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📨 Info', value: 'Hubungi admin dengan menyertakan ID transaksi di atas.' }
        ],
        timestamp: new Date()
      }]
    }
  },

  cancelled(trx) {
    return {
      embeds: [{
        title: '❌ Sesi Rekber Dibatalkan',
        color: 0xd63031,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${trx.id}\`` },
          { name: '📦 Barang', value: trx.description, inline: true },
          { name: '💰 Nominal', value: `Rp ${Number(trx.amount).toLocaleString('id-ID')}`, inline: true },
          { name: '📨 Info', value: 'Sesi telah dibatalkan. Kamu bisa membuat sesi baru dengan `/rekber`.' }
        ],
        timestamp: new Date()
      }]
    }
  },

  error(message) {
    return {
      embeds: [{
        title: '❌ Error',
        description: message,
        color: 0xd63031
      }]
    }
  },

  help() {
    return {
      embeds: [{
        title: '👋 Selamat datang di Rekber Bot!',
        color: 0x00b894,
        fields: [
          { name: '🔹 /rekber <nominal> <deskripsi>', value: 'Buat sesi rekber (pilih fee & jenis via tombol)' },
          { name: '🔹 /join <id>', value: 'Join sesi sebagai pembeli' },
          { name: '🔹 /cancel', value: 'Batalkan sesi rekber (sebelum pembeli join)' },
          { name: '🔹 /kirim <ekspedisi> <nomor_resi>', value: 'Tandai barang sudah dikirim' },
          { name: '🔹 /terima', value: 'Konfirmasi barang diterima' },
          { name: '🔹 /statustransaksi', value: 'Cek status transaksi' }
        ],
        timestamp: new Date()
      }]
    }
  }
}

module.exports = formatter