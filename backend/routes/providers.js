// Provider Routes - COMPLETE
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyProvider } = require('../middleware/auth');

// Toggle online status
router.put('/:id/status', verifyProvider, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_online } = req.body;
    
    await db.query('UPDATE service_providers SET is_online = ? WHERE provider_id = ?', [is_online, id]);
    res.status(200).json({ status: 'success', message: 'Status updated', data: { is_online } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Update failed' });
  }
});

// Update location
router.put('/:id/location', verifyProvider, async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    
    await db.query('UPDATE service_providers SET latitude = ?, longitude = ?, updated_at = NOW() WHERE provider_id = ?',
      [latitude, longitude, id]);
    
    res.status(200).json({ status: 'success', message: 'Location updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Update failed' });
  }
});

// Add route (for auto/toto drivers)
router.post('/routes', verifyProvider, async (req, res) => {
  try {
    const { provider_id, route_name, from_location, to_location, from_latitude, from_longitude, to_latitude, to_longitude, estimated_fare } = req.body;
    
    const [result] = await db.query(
      'INSERT INTO routes (provider_id, route_name, from_location, to_location, from_latitude, from_longitude, to_latitude, to_longitude, estimated_fare) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [provider_id, route_name, from_location, to_location, from_latitude, from_longitude, to_latitude, to_longitude, estimated_fare]
    );
    
    res.status(201).json({ status: 'success', message: 'Route added', data: { route_id: result.insertId } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to add route' });
  }
});

// Get provider routes
router.get('/:id/routes', async (req, res) => {
  try {
    const { id } = req.params;
    const [routes] = await db.query('SELECT * FROM routes WHERE provider_id = ? AND is_active = TRUE', [id]);
    res.status(200).json({ status: 'success', data: routes });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch routes' });
  }
});

module.exports = router;
