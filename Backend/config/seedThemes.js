const Theme = require('../models/Theme');

const builtInThemes = [
  {
    slug: 'solid',
    name: 'Solid color',
    description: 'A clean, single-color wall finish.',
    motif: 'solid',
    baseColor: '#e9d5b1',
    accentColor: '#ffffff',
  },
  {
    slug: 'geometric',
    name: 'Modern geometric',
    description: 'An original, crisp diagonal accent pattern.',
    motif: 'geometric',
    baseColor: '#7895b8',
    accentColor: '#ffffff',
  },
  {
    slug: 'botanical',
    name: 'Botanical garden',
    description: 'A calm, hand-drawn leaf-inspired wall motif.',
    motif: 'botanical',
    baseColor: '#c4d2b1',
    accentColor: '#416b48',
  },
  {
    slug: 'halloween',
    name: 'Harvest night',
    description: 'An original pumpkin-and-stars seasonal pattern.',
    motif: 'halloween',
    baseColor: '#39283f',
    accentColor: '#ff9c36',
  },
  {
    slug: 'vintage',
    name: 'Monalisa vintage',
    description: 'A warm, ornate gallery-inspired damask motif.',
    motif: 'vintage',
    baseColor: '#b28b54',
    accentColor: '#f1dcae',
  },
  {
    slug: 'graffiti',
    name: 'Urban mural',
    description: 'An original, energetic spray-paint-inspired design.',
    motif: 'graffiti',
    baseColor: '#403060',
    accentColor: '#ff765e',
  },
  {
    slug: 'gallery',
    name: 'Art gallery',
    description: 'A refined, minimal arch-and-frame wall pattern.',
    motif: 'gallery',
    baseColor: '#ded4c5',
    accentColor: '#6a5747',
  },
];

async function seedThemes() {
  for (const theme of builtInThemes) {
    await Theme.updateOne(
      { slug: theme.slug },
      { $setOnInsert: { ...theme, isBuiltIn: true, isActive: true } },
      { upsert: true }
    );
  }
}

module.exports = seedThemes;
