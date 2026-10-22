const express = require('express');
const Project = require('../models/Project');
const { requireAuth } = require('../middleware/middleware');

const router = express.Router();
const MAX_IMAGE_DATA_LENGTH = 5 * 1024 * 1024;
const MAX_PROJECT_IMAGE_DATA = 9 * 1024 * 1024;
const MAX_THUMBNAIL_DATA_LENGTH = 256 * 1024;
const finishes = new Set(['matte', 'satin', 'glossy', 'textured']);
const isValidDesignSlug = (design) =>
  typeof design === 'string' && /^[a-z0-9-]{2,50}$/.test(design);

function isValidImageData(value) {
  return typeof value === 'string' &&
    value.length <= MAX_IMAGE_DATA_LENGTH &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isValidPolygons(polygons) {
  return Array.isArray(polygons) &&
    polygons.length <= 30 &&
    polygons.every((polygon) =>
      polygon &&
      typeof polygon.name === 'string' &&
      polygon.name.trim().length > 0 &&
      polygon.name.length <= 80 &&
      Array.isArray(polygon.points) &&
      polygon.points.length >= 3 &&
      polygon.points.length <= 500 &&
      polygon.points.every((point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 1200 &&
        point.y >= 0 &&
        point.y <= 600
      ) &&
      typeof polygon.color === 'string' &&
      /^#[\da-f]{6}$/i.test(polygon.color) &&
      Number.isFinite(polygon.opacity) &&
      polygon.opacity >= 0 &&
      polygon.opacity <= 1 &&
      finishes.has(polygon.finish) &&
      isValidDesignSlug(polygon.design)
    );
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const projects = await Project.find({ userId: req.user._id.toString() })
      .select('projectName thumbnailUrl polygons createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return res.json({
      projects: projects.map((project) => ({
        id: project._id.toString(),
        projectName: project.projectName,
        thumbnailUrl: project.thumbnailUrl,
        polygonCount: project.polygons.length,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  if (!/^[\da-f]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Project ID is invalid.' });
  }

  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user._id.toString(),
    }).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project was not found.' });
    }
    return res.json({
      project: {
        id: project._id.toString(),
        projectName: project.projectName,
        originalImageUrl: project.originalImageUrl,
        canvasImageUrl: project.canvasImageUrl || project.originalImageUrl,
        thumbnailUrl: project.thumbnailUrl,
        selectedColor: project.selectedColor || '#464feb',
        selectedDesign: project.selectedDesign || 'none',
        polygons: project.polygons,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { projectName, originalImageUrl, canvasImageUrl, thumbnailUrl, selectedColor, selectedDesign, polygons } = req.body ?? {};
  if (
    typeof projectName !== 'string' ||
    projectName.trim().length < 1 ||
    projectName.trim().length > 80 ||
    !isValidImageData(originalImageUrl) ||
    !isValidImageData(canvasImageUrl) ||
    !isValidImageData(thumbnailUrl) ||
    thumbnailUrl.length > MAX_THUMBNAIL_DATA_LENGTH ||
    originalImageUrl.length + canvasImageUrl.length > MAX_PROJECT_IMAGE_DATA ||
    typeof selectedColor !== 'string' ||
    !/^#[\da-f]{6}$/i.test(selectedColor) ||
    !isValidDesignSlug(selectedDesign) ||
    !isValidPolygons(polygons)
  ) {
    return res.status(400).json({
      message: 'Project details are invalid. Room and working images must be JPEG previews under 5 MB each, and polygon settings must be valid.',
    });
  }

  try {
    const project = await Project.create({
      userId: req.user._id.toString(),
      projectName: projectName.trim(),
      originalImageUrl,
      canvasImageUrl,
      thumbnailUrl,
      selectedColor,
      selectedDesign,
      polygons,
    });
    return res.status(201).json({
      project: {
        id: project._id.toString(),
        projectName: project.projectName,
        thumbnailUrl: project.thumbnailUrl,
        polygonCount: project.polygons.length,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  if (!/^[\da-f]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ message: 'Project ID is invalid.' });
  }

  try {
    const result = await Project.deleteOne({
      _id: req.params.id,
      userId: req.user._id.toString(),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Project was not found.' });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
