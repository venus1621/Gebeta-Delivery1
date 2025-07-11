import express from 'express';
import multer from 'multer';
import { protect, restrictTo } from '../controllers/authController.js';
import * as restaurantController from '../controllers/restaurantController.js';

const router = express.Router();

// Use memory storage for buffer (for Cloudinary)
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// ✅ STATIC routes first — put BEFORE the dynamic '/:id'
router.get('/distance-from-coords', restaurantController.getRestaurantsWithDistanceFromCoords);
router.get('/stats/cuisine', restaurantController.getRestaurantStats);
router.get('/nearby', restaurantController.getNearbyRestaurants);
router.get('/top-5-rated', restaurantController.aliasTopRestaurants, restaurantController.getAllRestaurants);

// GET all and POST restaurant
router
  .route('/')
  .get(restaurantController.getAllRestaurants)
  .post(
    protect,
    upload.single('image'),
    restaurantController.createRestaurant
  );

// ✅ DYNAMIC route last
router
  .route('/:id')
  .get(restaurantController.getRestaurant)
  .patch(
    protect,
    restrictTo('manager', 'admin'),
    upload.single('image'),
    restaurantController.updateRestaurant
  )
  .delete(
    protect,
    restrictTo('manager', 'admin'),
    restaurantController.deleteRestaurant
  );

export default router;
