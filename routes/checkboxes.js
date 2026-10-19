import express from 'express';
import Joi from 'joi';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { recordCheckboxChange } from '../auth/index.js';

const router = express.Router();

const checkboxChangeSchema = Joi.object({
  index: Joi.number().integer().min(0).max(999999).required(),
  checked: Joi.boolean().required(),
});

const batchChangeSchema = Joi.array().items(checkboxChangeSchema).min(1).max(100);

router.post('/change', authMiddleware, async (req, res) => {
  try {
    const { error, value } = checkboxChangeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { index, checked } = value;
    await recordCheckboxChange(req.user.userId, index, checked);

    res.json({ success: true });
  } catch (err) {
    console.error('Checkbox change error:', err);
    res.status(500).json({ error: 'Failed to record change' });
  }
});

router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const { error, value } = batchChangeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    for (const change of value) {
      await recordCheckboxChange(req.user.userId, change.index, change.checked);
    }

    res.json({ success: true, count: value.length });
  } catch (err) {
    console.error('Batch checkbox change error:', err);
    res.status(500).json({ error: 'Failed to record changes' });
  }
});

router.get('/stats', optionalAuthMiddleware, async (req, res) => {
  try {
    res.json({ 
      totalChecked: 0, // Will be populated from Redis in main app
      total: 1000000,
      userChanges: req.user ? 'Available in dashboard' : 'Login to track your changes'
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;