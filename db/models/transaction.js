const { DataTypes } = require('sequelize')
const sequelize = require('../index')

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  seller_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  buyer_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  fee_type: {
    type: DataTypes.ENUM('INCLUDE', 'EXCLUDE'),
    allowNull: false,
    defaultValue: 'EXCLUDE'
  },
  type: {
    type: DataTypes.ENUM('DIGITAL', 'PHYSICAL'),
    allowNull: true
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM(
      'WAITING_BUYER',
      'WAITING_PAYMENT',
      'PAID',
      'DELIVERED',
      'COMPLETED_HOLDING',
      'COMPLETED',
      'DISPUTED',
      'FROZEN',
      'CANCELLED'
    ),
    defaultValue: 'WAITING_BUYER'
  },
  platform: {
    type: DataTypes.ENUM('TELEGRAM', 'DISCORD'),
    allowNull: false
  },
  payment_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  payment_ref: {
    type: DataTypes.STRING,
    allowNull: true
  },
  amount_with_code: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  unique_code: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  payment_issued_at: { type: DataTypes.DATE, allowNull: true },
  payment_expires_at: { type: DataTypes.DATE, allowNull: true },
  paid_at: { type: DataTypes.DATE, allowNull: true },
  funded_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  settled_at: { type: DataTypes.DATE, allowNull: true },
  dispute_reason: { type: DataTypes.TEXT, allowNull: true },
  delivery_note: { type: DataTypes.TEXT, allowNull: true },
  disputed_from: { type: DataTypes.STRING, allowNull: true },
  resi_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resi_expedition: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_hold_used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hold_expired_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [{ name: 'transactions_waiting_amount_unique', unique: true, fields: ['amount_with_code'], where: { status: 'WAITING_PAYMENT' } }]
})

module.exports = Transaction
