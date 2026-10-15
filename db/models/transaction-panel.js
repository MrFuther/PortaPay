const { DataTypes } = require('sequelize')
const sequelize = require('../index')
module.exports = sequelize.define('TransactionPanel', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  transaction_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  message_id: { type: DataTypes.STRING, allowNull: true },
  channel_id: { type: DataTypes.STRING, allowNull: true },
  render_hash: { type: DataTypes.STRING, allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sync_after: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lease_until: { type: DataTypes.DATE, allowNull: true },
  lease_token: { type: DataTypes.UUID, allowNull: true },
  last_error: { type: DataTypes.STRING, allowNull: true }
}, { indexes: [{ name: 'transaction_panel_recipient_unique', unique: true, fields: ['transaction_id', 'role'] }] })
