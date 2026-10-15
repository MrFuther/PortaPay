const { DataTypes } = require('sequelize')
const sequelize = require('../index')
module.exports = sequelize.define('NotificationDelivery', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  transaction_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  platform: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PENDING' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  next_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lease_until: { type: DataTypes.DATE, allowNull: true },
  lease_token: { type: DataTypes.UUID, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  last_error: { type: DataTypes.STRING, allowNull: true }
}, { indexes: [
  { unique: true, fields: ['transaction_id', 'role'], name: 'payment_notification_recipient_unique' },
  { fields: ['status', 'next_attempt_at'], name: 'payment_notification_due' }
] })
