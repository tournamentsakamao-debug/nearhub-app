// Admin Routes - Dashboard & Management - COMPLETE
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(verifyAdmin);

// Dashboard Overview
router.get('/dashboard/overview', async (req, res) => {
  try {
    const [counts] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = TRUE) as total_users,
        (SELECT COUNT(*) FROM service_providers WHERE is_active = TRUE) as total_providers,
        (SELECT COUNT(*) FROM service_providers WHERE is_online = TRUE) as online_providers,
        (SELECT COUNT(*) FROM payment_records WHERE status = 'pending') as pending_payments,
        (SELECT SUM(amount) FROM payment_records WHERE status = 'approved') as total_revenue,
        (SELECT SUM(amount) FROM payment_records WHERE status = 'approved' AND MONTH(approved_at) = MONTH(CURRENT_DATE())) as monthly_revenue
    `);

    res.status(200).json({ status: 'success', data: counts[0] });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Dashboard load failed' });
  }
});

// Live Tracking
router.get('/dashboard/live-tracking', async (req, res) => {
  try {
    const { city, category_id } = req.query;
    let query = `SELECT sp.*, sc.category_name FROM service_providers sp 
                 JOIN service_categories sc ON sp.category_id = sc.category_id
                 WHERE sp.is_active = TRUE AND sp.latitude IS NOT NULL`;
    const params = [];
    
    if (city) { query += ` AND sp.city = ?`; params.push(city); }
    if (category_id) { query += ` AND sp.category_id = ?`; params.push(category_id); }
    
    const [providers] = await db.query(query, params);
    res.status(200).json({ status: 'success', data: { providers, total: providers.length } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Tracking failed' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    
    if (search) { query += ` AND (name LIKE ? OR phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const [users] = await db.query(query, params);
    res.status(200).json({ status: 'success', data: { users } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to load users' });
  }
});

// Ban/Unban user
router.post('/users/:user_id/ban', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { action, reason } = req.body;
    const isActive = action === 'unban';
    
    await db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [isActive, user_id]);
    await db.query('INSERT INTO activity_logs (user_type, user_id, action, description) VALUES (?, ?, ?, ?)',
      ['admin', req.adminId, `${action}_user`, `User ${user_id} ${action}ned. Reason: ${reason || 'N/A'}`]);
    
    res.status(200).json({ status: 'success', message: `User ${action}ned successfully` });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Action failed' });
  }
});

// Get all providers
router.get('/providers', async (req, res) => {
  try {
    const { search, city, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT sp.*, sc.category_name, spl.plan_name FROM service_providers sp 
                 LEFT JOIN service_categories sc ON sp.category_id = sc.category_id
                 LEFT JOIN subscription_plans spl ON sp.plan_id = spl.plan_id WHERE 1=1`;
    const params = [];
    
    if (search) { query += ` AND (sp.name LIKE ? OR sp.phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (city) { query += ` AND sp.city = ?`; params.push(city); }
    if (status === 'active') query += ` AND sp.is_active = TRUE`;
    if (status === 'inactive') query += ` AND sp.is_active = FALSE`;
    
    query += ` ORDER BY sp.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const [providers] = await db.query(query, params);
    res.status(200).json({ status: 'success', data: { providers } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to load providers' });
  }
});

// Ban/Unban provider
router.post('/providers/:provider_id/ban', async (req, res) => {
  try {
    const { provider_id } = req.params;
    const { action, reason } = req.body;
    const isActive = action === 'unban';
    
    await db.query('UPDATE service_providers SET is_active = ?, is_online = ? WHERE provider_id = ?', [isActive, false, provider_id]);
    await db.query('INSERT INTO activity_logs (user_type, user_id, action, description) VALUES (?, ?, ?, ?)',
      ['admin', req.adminId, `${action}_provider`, `Provider ${provider_id} ${action}ned. Reason: ${reason || 'N/A'}`]);
    
    res.status(200).json({ status: 'success', message: `Provider ${action}ned successfully` });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Action failed' });
  }
});

// Fraud detection
router.get('/fraud-detection', async (req, res) => {
  try {
    const [suspicious] = await db.query(`
      SELECT sp.*, COUNT(r.rating_id) as low_ratings 
      FROM service_providers sp
      LEFT JOIN ratings r ON sp.provider_id = r.provider_id AND r.rating <= 2
      WHERE sp.is_active = TRUE
      GROUP BY sp.provider_id
      HAVING sp.average_rating < 3.0 OR low_ratings >= 5
      ORDER BY sp.average_rating ASC LIMIT 50
    `);
    
    const [duplicates] = await db.query(`
      SELECT phone, COUNT(*) as count, GROUP_CONCAT(name) as names
      FROM service_providers GROUP BY phone HAVING count > 1
    `);
    
    res.status(200).json({ status: 'success', data: { suspicious, duplicates } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Fraud detection failed' });
  }
});

// Update settings
router.put('/settings', async (req, res) => {
  try {
    const { upi_id, qr_code_url, support_phone, support_email } = req.body;
    const updates = [];
    
    if (upi_id) updates.push(['upi_id', upi_id]);
    if (qr_code_url) updates.push(['qr_code_url', qr_code_url]);
    if (support_phone) updates.push(['support_phone', support_phone]);
    if (support_email) updates.push(['support_email', support_email]);
    
    for (const [key, value] of updates) {
      await db.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
    }
    
    res.status(200).json({ status: 'success', message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Update failed' });
  }
});

module.exports = router;
