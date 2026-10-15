'use strict'
module.exports = {
  async up(q, S) {
    const schema = q.sequelize.options.define?.schema || 'public'
    const table = name => ({ tableName: name, schema })
    await q.sequelize.transaction(async transaction => {
      const options = { transaction }
      const fields = {
        payment_issued_at: { type: S.DATE, allowNull: true },
        payment_expires_at: { type: S.DATE, allowNull: true },
        paid_at: { type: S.DATE, allowNull: true },
        funded_amount: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        settled_at: { type: S.DATE, allowNull: true },
        dispute_reason: { type: S.TEXT, allowNull: true },
        disputed_from: { type: S.STRING, allowNull: true }
      }
      const existingColumns = await q.describeTable(table('Transactions'), options)
      for (const [key, value] of Object.entries(fields)) {
        if (!existingColumns[key]) await q.addColumn(table('Transactions'), key, value, options)
      }
      const common = () => ({
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false }
      })
      if (!await q.tableExists(table('PaymentEvents'), options)) await q.createTable(table('PaymentEvents'), {
        ...common(), provider: { type: S.STRING, allowNull: false }, event_id: { type: S.STRING, allowNull: false },
        transaction_id: { type: S.UUID, allowNull: false, unique: true },
        amount: { type: S.DECIMAL(12, 2), allowNull: false }, occurred_at: { type: S.DATE, allowNull: false }
      }, options)
      const paymentIndexes = await q.showIndex(table('PaymentEvents'), options)
      if (!paymentIndexes.some(index => index.unique && index.fields.map(f => f.attribute).join(',') === 'provider,event_id')) await q.addIndex(table('PaymentEvents'), ['provider', 'event_id'], { ...options, unique: true })
      if (!await q.tableExists(table('BalanceEntries'), options)) await q.createTable(table('BalanceEntries'), {
        ...common(), user_id: { type: S.UUID, allowNull: false }, event_key: { type: S.STRING, allowNull: false, unique: true },
        amount: { type: S.DECIMAL(12, 2), allowNull: false }, balance_after: { type: S.DECIMAL(12, 2), allowNull: false }
      }, options)
      const indexes = await q.showIndex(table('Transactions'), options)
      if (!indexes.some(index => index.name === 'transactions_waiting_amount_unique')) await q.addIndex(table('Transactions'), ['amount_with_code'], { ...options, name: 'transactions_waiting_amount_unique', unique: true, where: { status: 'WAITING_PAYMENT' } })
      // Never infer historical funding from status alone. Existing funds need reconciliation.
      const [constraints] = await q.sequelize.query('SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=:schema AND c.conname=:name', { ...options, replacements: { schema, name: 'users_balance_nonnegative' } })
      if (!constraints.length) await q.addConstraint(table('Users'), { ...options, fields: ['available_balance'], type: 'check', name: 'users_balance_nonnegative', where: { available_balance: { [S.Op.gte]: 0 } } })
    })
  },
  async down() { throw new Error('Financial audit data must be retained. Restore from a reviewed backup instead.') }
}
