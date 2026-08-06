const { DataTypes } = require('sequelize')
const sequelize = require('../index')

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  telegram_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  discord_id: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  trust_score: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  total_deals: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  failed_deals: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  available_balance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true
})

module.exports = User