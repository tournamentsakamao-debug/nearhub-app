// User Routes - COMPLETE
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyUser } = require('../middleware/auth');

// Update user location
router.put('/:id/location', verifyUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    
    await db.query('UPDATE users SET current_latitude = ?, current_longitude = ?, updated_at = NOW() WHERE user_id = ?',
      [latitude, longitude, id]);
    
    res.status(200).json({ status: 'success', message: 'Location updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Update failed' });
  }
});

// Add rating
router.post('/ratings', verifyUser, async (req, res) => {
  try {
    const { provider_id, user_id, rating, review } = req.body;
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ status: 'error', message: 'Rating must be between 1-5' });
    }
    
    await db.query(
      'INSERT INTO ratings (provider_id, user_id, rating, review) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = ?, review = ?',
      [provider_id, user_id, rating, review, rating, review]
    );
    
    res.status(201).json({ status: 'success', message: 'Rating submitted' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to submit rating' });
  }
});

module.exports = router;
