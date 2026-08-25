import express from 'express';
import fs from 'fs';
import path from 'path';

/** OBS shader presets: JSON files with { id, name, obsShaderParams } */
export const obsPresetRoutes = express.Router();

const PRESETS_DIR = path.join(process.cwd(), 'presets', 'obs');

obsPresetRoutes.get('/', (_req, res) => {
  try {
    const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith('.json'));
    const presets = files.map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, f), 'utf8'));
        return { id: data.id ?? f.replace('.json', ''), name: data.name ?? f };
      } catch {
        return null;
      }
    }).filter(Boolean);
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

obsPresetRoutes.get('/:id', (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const file = path.join(PRESETS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
