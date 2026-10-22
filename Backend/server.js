require('dotenv').config();

const express = require('express');
const path = require('node:path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const seedThemes = require('./config/seedThemes');

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:4200';

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '11mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication requests. Please try again later.' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'monalisa_paints' });
});
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/themes', require('./routes/themeRoutes'));
app.use('/api/projects', require('./routes/projectroutes'));
app.use('/api/uploads', require('./routes/uploadRoutes'));

if (process.env.NODE_ENV === 'production') {
  const frontendDirectory = path.resolve(__dirname, '..', 'dist', 'smt-wall-paint-vis');
  app.use(express.static(frontendDirectory));
  app.get(/^(?!\/api(?:\/|$)).*/i, (req, res, next) => {
    res.sendFile(path.join(frontendDirectory, 'index.html'), (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === 11000) {
    return res.status(409).json({ message: 'A record with that value already exists.' });
  }
  if (error.name === 'MulterError') {
    const isThemeImage = req.originalUrl.startsWith('/api/admin/themes/image');
    const maxSize = isThemeImage ? '5 MB' : '8 MB';
    return res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? `Images must be ${maxSize} or smaller.` : error.message,
    });
  }
  if (error.message === 'Only JPEG, PNG, and WebP images are supported.' ||
      error.message === 'Theme artwork must be JPEG, PNG, or WebP.') {
    return res.status(400).json({ message: error.message });
  }

  console.error('Request failed:', error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }

  await connectDB();
  await seedThemes();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('API startup failed:', error.message);
  process.exitCode = 1;
});