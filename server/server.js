const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { generateContent } = require('./services/geminiService');
// Optional: import your auth verification middleware
// const { protect } = require('./middleware/authMiddleware');

connectDB();

const app = express();

// Security: Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 calls per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many AI requests. Please wait a moment.',
  },
});

// CORS Configuration
const allowedOrigins = [
  'https://budgettrackerz.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' })); // Guard against large payloads

// Rate Limiting
app.use(['/api/auth', '/auth'], authLimiter);

// AI Insights Controller
const handleInsights = async (req, res, next) => {
  try {
    const { transactions = [], budgets = [] } = req.body;

    // Validate inputs
    if (!Array.isArray(transactions) || !Array.isArray(budgets)) {
      return res.status(400).json({
        success: false,
        message: 'Transactions and budgets must be arrays.',
      });
    }

    const systemInstruction =
      "You are a friendly and smart financial advisor. Analyze the user's budgets and recent transactions, then give 2 to 3 concise, actionable spending tips.";

    const prompt = `Financial status summary:
Budgets: ${JSON.stringify(budgets.slice(0, 20))}
Transactions: ${JSON.stringify(transactions.slice(0, 50))}

Provide 2-3 brief, helpful spending tips.`;

    const reply = await generateContent(prompt, systemInstruction);

    return res.status(200).json({
      success: true,
      insights: reply,
    });
  } catch (error) {
    console.error('Error generating Gemini insights:', error);
    next(error);
  }
};

// Insights Endpoint (Protected with rate limiter, add protect middleware when ready)
app.post(['/api/insights/gemini', '/insights/gemini'], aiLimiter, handleInsights);

// Standard Routes
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/transactions', '/transactions'], transactionRoutes);
app.use(['/api/budgets', '/budgets'], budgetRoutes);
app.use(['/api/analytics', '/analytics'], analyticsRoutes);

// Health & Status
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API server is running',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});