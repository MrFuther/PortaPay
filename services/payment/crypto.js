const crypto = require('crypto')

const CryptoService = {
  generateSignature(data, privateKey) {
    return crypto.createHmac('sha256', privateKey)
      .update(data)
      .digest('hex')
  },

  verifyCallbackSignature(jsonBody, signature, privateKey) {
    const expectedSignature = crypto.createHmac('sha256', privateKey)
      .update(jsonBody)
      .digest('hex')
    return expectedSignature === signature
  }
}

module.exports = CryptoService
