import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import cors from 'cors';
import session from 'express-session';

import foodRoutes from "./routes/foodRoutes.js";
import categoryRoutes from './routes/categoryRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import foodMenuRoutes from './routes/foodMenuRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import deliverRoutes from './routes/deliverRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reviewRouter from './routes/reviewRoutes.js';
import globalErrorHandler from './controllers/errorController.js';


const app = express();

app.use(helmet());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  max: 100, // max requests
  windowMs: 60 * 60 * 1000, // 1 hour window
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

app.use(express.json({ limit: '10kb' })); // Limit JSON body size to 10kb
app.use(mongoSanitize());

app.use(xss());
app.use(morgan('dev'));
app.use(express.static('public'));

app.use(express.static('public'));



app.use('/api/v1/foods', foodRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);
app.use('/api/v1/menus', foodMenuRoutes);
app.use('/api/v1/carts', cartRoutes);
app.use('/api/v1/deliveries', deliverRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/restaurants/:restaurantId/reviews', reviewRouter);

// Example route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'API is working 🚀' });
});
// Health check route
app.get('/', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is working 🚀' });
});

// 3) GLOBAL ERROR HANDLING
// app.all('*', (req, res, next) => {
//   const error = new Error(`Can't find ${req.originalUrl} on this server!`);
//   error.statusCode = 404;
//   error.status = 'fail';
//   next(error);
// });

app.use(globalErrorHandler);

export default app;
// app.use(globalErrorHandler);

