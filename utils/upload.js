import multer from 'multer';

// Store file in memory (buffer) so we can upload directly to Cloudinary
const multerStorage = multer.memoryStorage();

// Filter to accept only images
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

export default upload;
