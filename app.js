const express = require('express');
const cors = require('cors');
const path = require('path');


const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const clientRoutes = require('./src/routes/client.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));


// Route Definitions
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
