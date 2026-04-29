const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize } = require('./models');
const { startWebSocket } = require('./websocket/wsServer');
const { startModbusReader } = require('./services/modbusReader');
const { startDataLogger } = require('./services/dataLogger');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/dashboards', require('./routes/dashboards'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/alarms', require('./routes/alarms'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend build (untuk production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Start
const PORT = process.env.PORT || 3004;

sequelize.authenticate()
  .then(() => {
    console.log('Database connected');
    return sequelize.sync({ alter: false }); // Jangan alter di production
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`=================================`);
      console.log(`  EMS Backend running on port ${PORT}`);
      console.log(`=================================`);

      // Start WebSocket server
      startWebSocket();

      // Start Modbus reader (baca data dari power meter)
      startModbusReader();

      // Start data logger (simpan ke database tiap 15 menit)
      startDataLogger();
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });