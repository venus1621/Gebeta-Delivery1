import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import cors from 'cors';

import foodRoutes from './routes/foodRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import foodMenuRoutes from './routes/foodMenuRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import deliverRoutes from './routes/deliverRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reviewRouter from './routes/reviewRoutes.js';
import globalErrorHandler from './controllers/errorController.js';

const app = express();

// 🔐 Set security headers
app.use(helmet());

// 🌐 Enable CORS (Update `origin` as needed)
app.use(cors({
  origin: 'https://v0-backend-login-page.vercel.app', // 🔁 CodeSandbox frontend
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 🛡️ Rate limiting
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

// 🧼 Body parser & sanitization
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// 📝 Logger (only in dev)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 📁 Static file serving
app.use(express.static('public'));

// 🚀 Routes
app.use('/api/v1/foods', foodRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);
app.use('/api/v1/menus', foodMenuRoutes);
app.use('/api/v1/carts', cartRoutes);
app.use('/api/v1/deliveries', deliverRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/restaurants/:restaurantId/reviews', reviewRouter);

// ✅ Health check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is working 🚀' });
});

// ❌ Handle unknown routes
// app.all('*', (req, res, next) => {
//   const err = new Error(`Can't find ${req.originalUrl} on this server!`);
//   err.statusCode = 404;
//   err.status = 'fail';
//   next(err);
// });

// 🔧 Global error handler
app.use(globalErrorHandler);

export default app;
