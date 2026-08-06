'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Transactions', 'amount_with_code', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true
    });

    await queryInterface.addColumn('Transactions', 'unique_code', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Transactions', 'unique_code');
    await queryInterface.removeColumn('Transactions', 'amount_with_code');
  }
};
