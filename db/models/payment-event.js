const { DataTypes } = require('sequelize')
const sequelize = require('../index')
module.exports = sequelize.define('PaymentEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  provider: { type: DataTypes.STRING, allowNull: false },
  event_id: { type: DataTypes.STRING, allowNull: false },
  transaction_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  occurred_at: { type: DataTypes.DATE, allowNull: false }
}, { indexes: [{ unique: true, fields: ['provider', 'event_id'] }] })
