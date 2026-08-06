const express = require('express')
const router = express.Router()
const EscrowService = require('../services/escrow')

// Display a simple UI to simulate payment
router.get('/:id', async (req, res) => {
  const transactionId = req.params.id
  const trx = await EscrowService.getTransaction(transactionId)
  
  if (!trx) {
    return res.status(404).send('Transaksi tidak ditemukan.')
  }

  if (trx.status !== 'WAITING_PAYMENT') {
    return res.send(`Transaksi ini sudah dibayar atau tidak valid. Status saat ini: ${trx.status}`)
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mock Payment Gateway</title>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f9; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }
        h1 { color: #333; }
        .amount { font-size: 24px; font-weight: bold; color: #27ae60; margin: 1rem 0; }
        .btn { background: #3498db; color: white; border: none; padding: 12px 24px; border-radius: 4px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; width: 100%; box-sizing: border-box; }
        .btn:hover { background: #2980b9; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Simulasi Pembayaran</h1>
        <p>Anda sedang membayar transaksi:</p>
        <p><strong>${trx.description}</strong> (ID: ${trx.id})</p>
        <form action="/mock-pay/${trx.id}/process" method="POST">
          <button type="submit" class="btn">Simulasikan Pembayaran Sukses</button>
        </form>
      </div>
    </body>
    </html>
  `
  res.send(html)
})

// Process the mock payment
router.post('/:id/process', async (req, res) => {
  const transactionId = req.params.id
  const trx = await EscrowService.markAsPaid(transactionId)

  if (trx) {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Success</title>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #e8f8f5; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
          h1 { color: #27ae60; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Pembayaran Berhasil!</h1>
          <p>Status transaksi di database telah diupdate menjadi PAID.</p>
          <p>Silakan kembali ke aplikasi Discord/Telegram Anda.</p>
        </div>
      </body>
      </html>
    `
    res.send(html)
  } else {
    res.status(500).send('Gagal update status transaksi.')
  }
})

module.exports = router
