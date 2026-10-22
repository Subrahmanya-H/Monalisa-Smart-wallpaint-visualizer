const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[a-z0-9-]{2,50}$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, required: true, trim: true, maxlength: 180 },
    motif: {
      type: String,
      enum: ['solid', 'geometric', 'botanical', 'halloween', 'vintage', 'graffiti', 'gallery'],
      required: true,
    },
    baseColor: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    accentColor: { type: String, required: true, match: /^#[\da-f]{6}$/i },
    imageUrl: {
      type: String,
      default: '',
      validate: {
        validator: (value) => !value || /^https:\/\/[^\s]+$/i.test(value),
        message: 'Theme image URLs must use HTTPS.',
      },
    },
    isActive: { type: Boolean, default: true },
    isBuiltIn: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'themes' }
);

module.exports = mongoose.model('Theme', themeSchema);
