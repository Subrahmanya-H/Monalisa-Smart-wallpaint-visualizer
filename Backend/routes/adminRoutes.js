const express = require('express');
const User = require('../models/user');
const Project = require('../models/Project');
const Theme = require('../models/Theme');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { requireAuth, requireAdmin } = require('../middleware/middleware');

const router = express.Router();
const themeImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Theme artwork must be JPEG, PNG, or WebP.'));
    }
    return callback(null, true);
  },
});
const motifs = new Set(['solid', 'geometric', 'botanical', 'halloween', 'vintage', 'graffiti', 'gallery']);
const themeFields = 'slug name description motif baseColor accentColor imageUrl isActive isBuiltIn createdAt updatedAt';

function normalizeThemeInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const motif = typeof body?.motif === 'string' ? body.motif : '';
  const baseColor = typeof body?.baseColor === 'string' ? body.baseColor : '';
  const accentColor = typeof body?.accentColor === 'string' ? body.accentColor : '';
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const isActive = body?.isActive !== false;

  if (
    name.length < 2 ||
    name.length > 60 ||
    description.length < 3 ||
    description.length > 180 ||
    !motifs.has(motif) ||
    !/^#[\da-f]{6}$/i.test(baseColor) ||
    !/^#[\da-f]{6}$/i.test(accentColor) ||
    (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl))
  ) {
    return { error: 'Enter a valid theme name, description, motif, two hex colors, and optional HTTPS image URL.' };
  }

  const slug = name.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  if (slug.length < 2) {
    return { error: 'Theme name must produce a valid URL-safe theme ID.' };
  }

  return { value: { name, description, motif, baseColor, accentColor, imageUrl, isActive, slug } };
}

router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find()
      .select('name email role createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({
      users: users.map(({ _id, name, email, role, createdAt }) => ({
        id: _id.toString(),
        name,
        email,
        role: role === 'admin' ? 'admin' : 'customer',
        createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/projects', async (req, res, next) => {
  try {
    const projects = await Project.aggregate([
      { $sort: { updatedAt: -1 } },
      { $limit: 200 },
      {
        $addFields: {
          ownerObjectId: {
            $convert: { input: '$userId', to: 'objectId', onError: null, onNull: null },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerObjectId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          projectName: 1,
          thumbnailUrl: 1,
          selectedColor: 1,
          updatedAt: 1,
          polygonCount: { $size: { $ifNull: ['$polygons', []] } },
          ownerName: { $ifNull: ['$owner.name', 'Unknown user'] },
          ownerEmail: { $ifNull: ['$owner.email', ''] },
        },
      },
    ]);

    return res.json({
      projects: projects.map(({ _id, ...project }) => ({ id: _id.toString(), ...project })),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/projects/:id', async (req, res, next) => {
  if (!/^[\da-f]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Project ID is invalid.' });
  }

  try {
    const result = await Project.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Project was not found.' });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/themes', async (req, res, next) => {
  try {
    const themes = await Theme.find().select(themeFields).sort({ isBuiltIn: -1, name: 1 }).lean();
    return res.json({
      themes: themes.map(({ _id, ...theme }) => ({ id: _id.toString(), ...theme })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/themes/image', themeImageUpload.single('image'), async (req, res, next) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({ message: 'Theme image uploads need Cloudinary credentials. You can still create a theme without an image.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Choose an image to upload.' });
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'monalisa-paints/themes', resource_type: 'image' },
        (error, uploadResult) => {
          if (error) {
            reject(error);
          } else if (uploadResult) {
            resolve(uploadResult);
          } else {
            reject(new Error('Cloudinary returned no upload result.'));
          }
        }
      );
      stream.end(req.file.buffer);
    });
    return res.status(201).json({ url: result.secure_url });
  } catch (error) {
    return next(error);
  }
});

router.post('/themes', async (req, res, next) => {
  const normalized = normalizeThemeInput(req.body);
  if (normalized.error) {
    return res.status(400).json({ message: normalized.error });
  }

  try {
    const theme = await Theme.create(normalized.value);
    const result = theme.toObject();
    return res.status(201).json({
      theme: { id: result._id.toString(), ...result },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/themes/:id', async (req, res, next) => {
  if (!/^[\da-f]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Theme ID is invalid.' });
  }
  const normalized = normalizeThemeInput(req.body);
  if (normalized.error) {
    return res.status(400).json({ message: normalized.error });
  }

  try {
    const existing = await Theme.findById(req.params.id).select('slug').lean();
    if (!existing) {
      return res.status(404).json({ message: 'Theme was not found.' });
    }
    const theme = await Theme.findByIdAndUpdate(
      req.params.id,
      { $set: { ...normalized.value, slug: existing.slug } },
      { new: true, runValidators: true }
    ).select(themeFields).lean();
    if (!theme) {
      return res.status(404).json({ message: 'Theme was not found.' });
    }
    return res.json({
      theme: { id: theme._id.toString(), ...theme },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/themes/:id', async (req, res, next) => {
  if (!/^[\da-f]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Theme ID is invalid.' });
  }

  try {
    const theme = await Theme.findById(req.params.id).select('isBuiltIn').lean();
    if (!theme) {
      return res.status(404).json({ message: 'Theme was not found.' });
    }
    if (theme.isBuiltIn) {
      return res.status(400).json({ message: 'Built-in themes cannot be deleted. Disable them instead.' });
    }
    await Theme.deleteOne({ _id: req.params.id });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
