'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      telegram_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true
      },
      discord_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true
      },
      username: {
        type: Sequelize.STRING,
        allowNull: true
      },
      trust_score: {
        type: Sequelize.INTEGER,
        defaultValue: 100
      },
      total_deals: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      failed_deals: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      available_balance: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.createTable('Transactions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      seller_id: {
        type: Sequelize.STRING,
        allowNull: false
      },
      buyer_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      fee: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      fee_type: {
        type: Sequelize.ENUM('INCLUDE', 'EXCLUDE'),
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('DIGITAL', 'PHYSICAL'),
        allowNull: true
      },
      description: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM(
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
        type: Sequelize.ENUM('TELEGRAM', 'DISCORD'),
        allowNull: false
      },
      payment_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      payment_ref: {
        type: Sequelize.STRING,
        allowNull: true
      },
      resi_number: {
        type: Sequelize.STRING,
        allowNull: true
      },
      resi_expedition: {
        type: Sequelize.STRING,
        allowNull: true
      },
      is_hold_used: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      hold_expired_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Transactions');
    await queryInterface.dropTable('Users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Transactions_fee_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Transactions_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Transactions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Transactions_platform";');
  }
};
