'use strict'
module.exports = {
  async up(q, S) {
    const schema = q.sequelize.options.define?.schema || 'public'
    await q.sequelize.transaction(async transaction => {
      await q.addColumn({ tableName: 'Transactions', schema }, 'delivery_note', { type: S.TEXT, allowNull: true }, { transaction })
      const table = { tableName: 'TransactionPanels', schema }
      await q.createTable(table, {
        id: { type: S.UUID, allowNull: false, primaryKey: true }, transaction_id: { type: S.UUID, allowNull: false }, user_id: { type: S.UUID, allowNull: false }, role: { type: S.STRING, allowNull: false },
        message_id: { type: S.STRING, allowNull: true }, channel_id: { type: S.STRING, allowNull: true }, render_hash: { type: S.STRING, allowNull: true },
        active: { type: S.BOOLEAN, allowNull: false, defaultValue: true }, sync_after: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
        lease_until: { type: S.DATE, allowNull: true }, lease_token: { type: S.UUID, allowNull: true }, last_error: { type: S.STRING, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false }
      }, { transaction })
      await q.addIndex(table, ['transaction_id', 'role'], { transaction, unique: true, name: 'transaction_panel_recipient_unique' })
    })
  },
  async down() { throw new Error('Retain transaction panels and delivery evidence.') }
}
