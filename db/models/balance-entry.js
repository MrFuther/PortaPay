const { DataTypes } = require('sequelize')
const sequelize = require('../index')
module.exports = sequelize.define('BalanceEntry', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  event_key: { type: DataTypes.STRING, allowNull: false, unique: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  balance_after: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
})
