'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Withdrawals', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      bank_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      account_number: {
        type: Sequelize.STRING,
        allowNull: false
      },
      account_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'),
        defaultValue: 'PENDING'
      },
      platform: {
        type: Sequelize.ENUM('TELEGRAM', 'DISCORD'),
        allowNull: false
      },
      admin_note: {
        type: Sequelize.STRING,
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
    await queryInterface.dropTable('Withdrawals');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Withdrawals_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Withdrawals_platform";');
  }
};
