import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { getAuthenticatedUser, requireAuthenticatedUser } from '../middleware/authenticatedUser';
import { MAX_LABEL_IMAGE_BYTES, scanNutritionLabel } from '../services/nutritionLabelScan';
import { isHttpError } from './myFoodsUtils';

const router = express.Router();
const SCAN_RATE_WINDOW_MS = 60_000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LABEL_IMAGE_BYTES, files: 1, fields: 0, parts: 2 }
}).single('image');

router.use(requireAuthenticatedUser);
router.post('/scan', rateLimit({
  windowMs: SCAN_RATE_WINDOW_MS,
  limit: 6,
  keyGenerator: (req) => String(getAuthenticatedUser(req).id),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many label scans. Try again in a minute.' }
}), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  upload(req, res, async (error: unknown) => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ message: tooLarge
        ? 'Choose a label photo smaller than 8 MB.'
        : 'Upload one label photo in the image field.' });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a label photo.' });
    try {
      return res.json(await scanNutritionLabel(req.file.buffer));
    } catch (err) {
      if (isHttpError(err)) return res.status(err.statusCode).json({ message: err.message });
      return res.status(500).json({ message: 'The label could not be read. Try another photo or enter the details manually.' });
    }
  });
});

export default router;
