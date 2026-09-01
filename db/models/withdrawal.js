const { DataTypes } = require('sequelize')
const sequelize = require('../index')

const Withdrawal = sequelize.define('Withdrawal', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  account_number: {
    type: DataTypes.STRING,
    allowNull: false
  },
  account_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'),
    defaultValue: 'PENDING'
  },
  platform: {
    type: DataTypes.ENUM('TELEGRAM', 'DISCORD'),
    allowNull: false
  },
  admin_note: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true
})

module.exports = Withdrawal
