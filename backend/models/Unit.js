const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Satuan dan cara konversinya ke satuan dasar.
//   dasar = nilai * factor + offset_value
// offset_value ada karena suhu bukan sekadar perkalian.
const Unit = sequelize.define('Unit', {
  symbol: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  base_symbol: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  factor: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 1,
  },
  offset_value: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    defaultValue: 0,
  },
  // Satuan bawaan tidak boleh dihapus dari UI karena dipakai sebagai dasar konversi.
  is_system: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'units',
  timestamps: true,
  underscored: true,
});

module.exports = Unit;
