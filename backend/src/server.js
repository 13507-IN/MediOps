import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import net from 'net';
import connectDB from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import predictionRoutes from './routes/predictionRoutes.js';
import diseaseMedicineRoutes from './routes/diseaseMedicineRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';
import allocationRoutes from './routes/allocationRoutes.js';
import { startAqiScheduler } from './jobs/aqiScheduler.js';
import autoRoutes from './routes/autoRoutes.js';

// Load environment variables
dotenv.config({ path: '../../.env' });

if (!process.env.WEATHER_API_KEY) {
  process.env.WEATHER_API_KEY = 'd3f36f311e87f456b2c011ac4475c83a';
}

if (!process.env.AIR_VISUAL_API_KEY) {
  process.env.AIR_VISUAL_API_KEY = 'ed2e8938-381b-41b5-8afb-23c2fc5fa19c';
}

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 5000;

// DB Connection
connectDB();

// AQI Scheduler
startAqiScheduler();

/* ---------------------------------------------------
   ✅ FIXED CORS — Render + Vercel Compatible
--------------------------------------------------- */

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://medi-ops-ten.vercel.app"
];


app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* --------------------------------------------------- */
console.log('Allowed Origins for CORS:', allowedOrigins);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Healthcare Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/disease-medicine', diseaseMedicineRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/allocations', allocationRoutes);

// 404
app.use(express.raw({ type: "*/*", limit: "50mb" }));
app.use("/api/auto", autoRoutes);


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File size exceeds the maximum limit',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Port Scanner
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// Start Server
async function startServer() {
  try {
    const availablePort = await findAvailablePort(PORT);
    
    const server = app.listen(availablePort, () => {
      console.log(`

                                                        
   🏥 Healthcare Backend Server                        
                                                        
   🚀 Server running on port ${availablePort}                      
   🌍 Environment: ${process.env.NODE_ENV || 'development'}                    
   📡 API Base URL: http://localhost:${availablePort}              
   🌤️ Weather API: ${process.env.WEATHER_API_KEY ? '✅ Configured' : '❌ Not configured'}     
                                                        

      `);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});
