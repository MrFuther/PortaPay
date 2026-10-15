'use strict'
module.exports = {
  async up(q, S) {
    const schema = q.sequelize.options.define?.schema || 'public'
    const table = { tableName: 'NotificationDeliveries', schema }
    await q.sequelize.transaction(async transaction => {
      await q.createTable(table, {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        transaction_id: { type: S.UUID, allowNull: false },
        user_id: { type: S.UUID, allowNull: false },
        role: { type: S.STRING, allowNull: false },
        platform: { type: S.STRING, allowNull: false },
        status: { type: S.STRING, allowNull: false, defaultValue: 'PENDING' },
        attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        next_attempt_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
        lease_until: { type: S.DATE, allowNull: true }, lease_token: { type: S.UUID, allowNull: true },
        sent_at: { type: S.DATE, allowNull: true }, last_error: { type: S.STRING, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false }
      }, { transaction })
      await q.addIndex(table, ['transaction_id', 'role'], { transaction, unique: true, name: 'payment_notification_recipient_unique' })
      await q.addIndex(table, ['status', 'next_attempt_at'], { transaction, name: 'payment_notification_due' })
    })
  },
  async down() { throw new Error('Retain delivery history; rollback requires a reviewed data backup.') }
}
