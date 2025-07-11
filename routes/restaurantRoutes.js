import express from 'express';
import multer from 'multer';
import { protect, restrictTo } from '../controllers/authController.js';
import * as restaurantController from '../controllers/restaurantController.js';

const router = express.Router();

// Use memory storage for buffer (for Cloudinary)
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// Public route: Get all, get by ID, filter by distance
router
  .route('/')
  .get(restaurantController.getAllRestaurants)
  .post(
    protect,
    restrictTo('manager', 'admin'),
    upload.single('image'),
    restaurantController.createRestaurant
  );

router.get('/distance-from-coords', restaurantController.getRestaurantsWithDistanceFromCoords);
router.get('/stats/cuisine', restaurantController.getRestaurantStats);
router.get('/nearby', restaurantController.getNearbyRestaurants);
router.get('/top-5-rated', restaurantController.aliasTopRestaurants, restaurantController.getAllRestaurants);

router
  .route('/:id')
  .get(restaurantController.getRestaurant)
  .patch(
    protect,
    restrictTo('manager', 'admin'),
    upload.single('image'), // Upload image as 'image'
    restaurantController.updateRestaurant
  )
  .delete(
    protect,
    restrictTo('manager', 'admin'),
    restaurantController.deleteRestaurant
  );

export default router;
