const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const polygonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    points: { type: [pointSchema], required: true },
    color: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    opacity: { type: Number, required: true, min: 0, max: 1 },
    finish: {
      type: String,
      enum: ['matte', 'satin', 'glossy', 'textured'],
      default: 'matte',
    },
    design: {
      type: String,
      default: 'solid',
      match: /^[a-z0-9-]{2,50}$/,
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    projectName: { type: String, required: true, trim: true, maxlength: 80 },
    originalImageUrl: { type: String, required: true },
    canvasImageUrl: { type: String, required: true },
    finalImageUrl: { type: String },
    thumbnailUrl: { type: String, required: true },
    selectedColor: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    selectedDesign: { type: String, default: 'solid', match: /^[a-z0-9-]{2,50}$/ },
    polygons: { type: [polygonSchema], default: [] },
  },
  { timestamps: true, collection: 'projects' }
);

projectSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Project', projectSchema);