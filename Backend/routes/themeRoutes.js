const express = require('express');
const Theme = require('../models/Theme');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const themes = await Theme.find({ isActive: true })
      .select('slug name description motif baseColor accentColor imageUrl isBuiltIn')
      .sort({ isBuiltIn: -1, name: 1 })
      .lean();
    return res.json({
      themes: themes.map(({ _id, ...theme }) => ({ id: _id.toString(), ...theme })),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
