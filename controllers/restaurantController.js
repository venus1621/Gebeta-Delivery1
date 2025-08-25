import Restaurant from '../models/restaurantModel.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import APIFeatures from '../utils/apiFeatures.js';
import User from '../models/userModel.js';
import axios from 'axios';
import NodeGeocoder from 'node-geocoder';
import cloudinary from '../utils/cloudinary.js'; 
import streamifier from 'streamifier';
import filterObj from '../utils/filterObj.js';
import mongoose from 'mongoose';

// Alias for top 5 rated restaurants
export const aliasTopRestaurants = (req, res, next) => {
  req.query.limit = '5';
  req.query.sort = '-ratingAverage,deliveryRadiusMeters';
  req.query.fields = 'name,location,ratingAverage,cuisineTypes,deliveryRadiusMeters';
  next();
};
const geocoder = NodeGeocoder({
  provider: 'openstreetmap'
});


export const getRestaurantsWithDistanceFromCoords = catchAsync(async (req, res, next) => {
  const { lng, lat } = req.query;

  if (!lng || !lat) {
    return next(new AppError('Please provide longitude (lng) and latitude (lat) in query.', 400));
  }

  const userCoords = [parseFloat(lng), parseFloat(lat)];

  // Fetch all active restaurants
  const restaurants = await Restaurant.find({ active: true });

  // Map over restaurants and get distance & duration from OSRM
  const results = await Promise.all(
    restaurants.map(async (restaurant) => {
      const restCoords = restaurant.location.coordinates; // [lng, lat]

      try {
        // OSRM route API to get driving distance and duration
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userCoords[0]},${userCoords[1]};${restCoords[0]},${restCoords[1]}?overview=false`;
        const response = await axios.get(osrmUrl);

        const route = response.data.routes?.[0];
        const distance = route?.distance || null; // meters
        const duration = route?.duration || null; // seconds

        return {
          ...restaurant.toObject(),
          distanceMeters: distance ? Math.round(distance) : null,
          durationMinutes: duration ? Math.round(duration / 60) : null
        };
      } catch (error) {
        console.error('OSRM Error:', error.message);
        return {
          ...restaurant.toObject(),
          distanceMeters: null,
          durationMinutes: null
        };
      }
    })
  );

  // Sort by nearest distance first
  const sorted = results.filter(r => r.distanceMeters !== null)
                        .sort((a, b) => a.distanceMeters - b.distanceMeters);

  res.status(200).json({
    status: 'success',
    results: sorted.length,
    data: sorted
  });
});
// Get all restaurants with filtering, sorting, pagination & search
export const getAllRestaurants = catchAsync(async (req, res, next) => {
  // Create an instance of APIFeatures with the base query and request query
  const features = new APIFeatures(Restaurant.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // Execute the query and populate the manager data
  const restaurants = await features.query.populate('managerId');

  // Send response
  res.status(200).json({
    status: 'success',
    results: restaurants.length,
    data: {
      restaurants,
    },
  });
});


// Get one restaurant by ID
export const getRestaurant = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return next(new AppError('No restaurant found with that ID', 404));
  }

  // Get all food menus for this restaurant
  const foodMenus = await mongoose.model('FoodMenu').find({ 
    restaurantId: restaurant._id,
    active: true 
  });

  // Get all foods from these menus
  const menuIds = foodMenus.map(menu => menu._id);
  const foods = await mongoose.model('Food').find({ 
    menuId: { $in: menuIds },
    status: 'Available'
  }).populate('categoryId');

  // Group foods by category
  const foodsByCategory = {};
  foods.forEach(food => {
    const categoryName = food.categoryId?.categoryName || 'Uncategorized';
    if (!foodsByCategory[categoryName]) {
      foodsByCategory[categoryName] = {
        categoryId: food.categoryId?._id,
        categoryName: categoryName,
        description: food.categoryId?.description || '',
        foods: []
      };
    }
    
    foodsByCategory[categoryName].foods.push({
      _id: food._id,
      foodName: food.foodName,
      price: food.price,
      ingredients: food.ingredients,
      instructions: food.instructions,
      cookingTimeMinutes: food.cookingTimeMinutes,
      rating: food.rating,
      imageCover: food.imageCover,
      isFeatured: food.isFeatured,
      status: food.status,
      menuId: food.menuId
    });
  });

  // Convert to array and sort categories
  const categories = Object.values(foodsByCategory).sort((a, b) => 
    a.categoryName.localeCompare(b.categoryName)
  );

  // Sort foods within each category by name
  categories.forEach(category => {
    category.foods.sort((a, b) => a.foodName.localeCompare(b.foodName));
  });

  res.status(200).json({
    status: 'success',
    data: { 
      restaurant,
      categories,
      totalCategories: categories.length,
      totalFoods: foods.length
    }
  });
});

// Alternative: Get restaurant with categories and foods using aggregation pipeline (more efficient)
export const getRestaurantWithMenu = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return next(new AppError('No restaurant found with that ID', 404));
  }

  // Use aggregation pipeline for better performance
  const result = await mongoose.model('Food').aggregate([
    // Match foods from this restaurant's menus
    {
      $lookup: {
        from: 'foodmenus',
        localField: 'menuId',
        foreignField: '_id',
        as: 'menu'
      }
    },
    {
      $unwind: '$menu'
    },
    {
      $match: {
        'menu.restaurantId': new mongoose.Types.ObjectId(req.params.id),
        'menu.active': true,
        status: 'Available'
      }
    },
    // Lookup category information
    {
      $lookup: {
        from: 'foodcategories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category'
      }
    },
    {
      $unwind: '$category'
    },
    // Group by category
    {
      $group: {
        _id: '$categoryId',
        categoryName: { $first: '$category.categoryName' },
        categoryDescription: { $first: '$category.description' },
        foods: {
          $push: {
            _id: '$_id',
            foodName: '$foodName',
            price: '$price',
            ingredients: '$ingredients',
            instructions: '$instructions',
            cookingTimeMinutes: '$cookingTimeMinutes',
            rating: '$rating',
            imageCover: '$imageCover',
            isFeatured: '$isFeatured',
            status: '$status',
            menuId: '$menuId'
          }
        }
      }
    },
    // Sort categories and foods
    {
      $sort: { categoryName: 1 }
    },
    {
      $addFields: {
        foods: {
          $sortArray: {
            input: '$foods',
            sortBy: { foodName: 1 }
          }
        }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: { 
      restaurant,
      categories: result,
      totalCategories: result.length,
      totalFoods: result.reduce((sum, cat) => sum + cat.foods.length, 0)
    }
  });
});

// Create new restaurant
// export const createRestaurant = catchAsync(async (req, res, next) => {
//   const { manager } = req.body;

//   // 1. Validate manager ID
//   if (!manager) {
//     return next(new AppError('A manager ID must be provided to create a restaurant.', 400));
//   }

//   const managerUser = await User.findById(manager);
//   if (!managerUser) {
//     return next(new AppError('Manager ID does not exist.', 400));
//   }

//   // Optional: Check role of manager
//   if (managerUser.role !== 'Manager' && managerUser.role !== 'Admin') {
//     return next(new AppError('Only users with the role "Manager" or "Admin" can manage a restaurant.', 403));
//   }

//   // 2. Create the restaurant
//   const newRestaurant = await Restaurant.create(req.body);

//   res.status(201).json({
//     status: 'success',
//     data: {
//       restaurant: newRestaurant
//     }
//   });
// });

export const createRestaurant = catchAsync(async (req, res, next) => {
  const {
    name,
    license,
    manager, // phone number
    cuisineTypes = [],
    deliveryRadiusMeters,
    openHours,
    isDeliveryAvailable = false,
    isOpenNow = false,
    description,
   
  } = req.body;

  // 1. Validate Manager
  if (!manager) {
    return next(new AppError('Manager phone number is required to create a restaurant.', 400));
  }

  const managerUser = await User.findOne({ phone: manager });

  if (!managerUser || !['Manager', 'Admin'].includes(managerUser.role)) {
    return next(new AppError('Only users with role "Manager" or "Admin" can manage a restaurant.', 403));
  }

  // // 2. Validate and Format Location
  // if (!location || !location.address || !location.coordinates) {
  //   return next(new AppError('Location must include an address and coordinates.', 400));
  // }

  // const [longitude, latitude] = location.coordinates.map(coord => parseFloat(coord));

  // if (
  //   location.coordinates.length !== 2 ||
  //   isNaN(longitude) ||
  //   isNaN(latitude)
  // ) {
  //   return next(new AppError('Coordinates must be an array of valid numbers: [longitude, latitude].', 400));
  // }

  // const parsedLocation = {
  //   type: 'Point',
  //   coordinates: [longitude, latitude],
  //   address: location.address,
  //   description: location.description || ''
  // };

  // 3. Create Restaurant
  const newRestaurant = await Restaurant.create({
    name,
    license,
    managerId: managerUser._id,
    cuisineTypes,
    deliveryRadiusMeters,
    openHours,
    isDeliveryAvailable,
    isOpenNow,
    description,

  });

  // 4. Respond
  res.status(201).json({
    status: 'success',
    data: {
      restaurant: newRestaurant
    }
  });
});
// Update restaurant by ID
export const updateRestaurant = catchAsync(async (req, res, next) => {
  // Optional: Prevent password updates via this route
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('This route is not for password updates.', 400));
  }
  if (req.file) {
  const uploadFromBuffer = (fileBuffer, publicId) => {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'restaurant_images',
          public_id: publicId,
          overwrite: true,
          resource_type: 'image'
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      streamifier.createReadStream(fileBuffer).pipe(stream);
    });
  };

  const publicId = req.params.id.toString(); // restaurant ID as image name
  const result = await uploadFromBuffer(req.file.buffer, publicId);

  req.body.imageCover = result.secure_url;  // <-- changed to match filterObj
}

// filter allowed fields for update
const filteredBody = filterObj(
  req.body,
  'name',
  'location',
  'cuisineTypes',
  'description',
  'imageCover',  // must match the field above
  'deliveryRadiusMeters',
  'openHours',
  'isDeliveryAvailable',
  'isOpenNow',
  'address',
  'deliveryradiusMeters',
  
);

  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true
  });

  if (!restaurant) {
    return next(new AppError('No restaurant found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      restaurant
    }
  });
});

// Delete restaurant by ID
export const deleteRestaurant = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findByIdAndDelete(req.params.id);

  if (!restaurant) {
    return next(new AppError('No restaurant found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});
export const getRestaurantsByManagerId = catchAsync(async (req, res, next) => {
  const { managerId } = req.params;

  if (!managerId) {
    return next(new AppError('Manager ID is required.', 400));
  }

  const restaurants = await Restaurant.find({ managerId });

  if (!restaurants.length) {
    return next(new AppError('No restaurants found for the given manager ID.', 404));
  }

  res.status(200).json({
    status: 'success',
    results: restaurants.length,
    data: {
      restaurants
    }
  });
});
// Get restaurants nearby within a radius (meters)
export const getNearbyRestaurants = catchAsync(async (req, res, next) => {
  const { lat, lng, distance } = req.query;

  if (!lat || !lng) {
    return next(new AppError('Please provide latitude and longitude in query', 400));
  }

  const maxDistance = distance ? parseInt(distance) : 3000; // default 3km radius

  const restaurants = await Restaurant.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)]
        },
        $maxDistance: maxDistance
      }
    }
  });

  res.status(200).json({
    status: 'success',
    results: restaurants.length,
    data: { restaurants }
  });
});

// Aggregate stats by cuisine type
export const getRestaurantStats = catchAsync(async (req, res, next) => {
  const stats = await Restaurant.aggregate([
    { $unwind: '$cuisineTypes' },
    {
      $group: {
        _id: '$cuisineTypes',
        numRestaurants: { $sum: 1 },
        avgRating: { $avg: '$ratingAverage' },
        minDeliveryRadius: { $min: '$deliveryRadiusMeters' },
        maxDeliveryRadius: { $max: '$deliveryRadiusMeters' }
      }
    },
    { $sort: { numRestaurants: -1 } }
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

export const assignRestaurantManager = catchAsync(async (req, res, next) => {
  const { phone, restaurantId } = req.body;

  if (!phone || !restaurantId) {
    return next(new AppError('Phone number and restaurant ID are required', 400));
  }

  // 1. Find user by phone number
  const user = await User.findOne({ phone });

  if (!user) {
    return next(new AppError('No user found with that phone number', 404));
  }

  // 2. Ensure user has Manager role
  if (user.role !== 'Manager') {
    return next(new AppError('User is not a Manager', 400));
  }

  // 3. Update restaurant with new manager
  const restaurant = await Restaurant.findByIdAndUpdate(
    restaurantId,
    { managerId: user._id },
    { new: true, runValidators: true }
  );

  if (!restaurant) {
    return next(new AppError('Restaurant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: `Manager assigned to ${restaurant.name}`,
    data: {
      restaurant
    }
  });
});










// import Restaurant from '../models/Restaurant.js';

// // CREATE a restaurant
// export const createRestaurant = async (req, res) => {
//   try {
//     const restaurant = await Restaurant.create(req.body);
//     res.status(201).json({ status: 'success', data: restaurant });
//   } catch (err) {
//     res.status(400).json({ status: 'fail', message: err.message });
//   }
// };

// // READ all restaurants
// export const getAllRestaurants = async (req, res) => {
//   try {
//     const restaurants = await Restaurant.find().populate('managerId');
//     res.status(200).json({ status: 'success', results: restaurants.length, data: restaurants });
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({ status: 'error', message: err.message });
//   }
// };

// // READ one restaurant by ID
// export const getRestaurant = async (req, res) => {
//   try {
//     const restaurant = await Restaurant.findById(req.params.id).populate('managerId');
//     if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

//     res.status(200).json({ status: 'success', data: restaurant });
//   } catch (err) {
//     res.status(500).json({ status: 'error', message: err.message });
//   }
// };

// // UPDATE a restaurant
// export const updateRestaurant = async (req, res) => {
//   try {
//     const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, {
//       new: true,
//       runValidators: true
//     });
//     if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

//     res.status(200).json({ status: 'success', data: restaurant });
//   } catch (err) {
//     res.status(400).json({ status: 'fail', message: err.message });
//   }
// };

// // DELETE a restaurant
// export const deleteRestaurant = async (req, res) => {
//   try {
//     const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
//     if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

//     res.status(204).json({ status: 'success', data: null });
//   } catch (err) {
//     res.status(500).json({ status: 'error', message: err.message });
//   }
// };



