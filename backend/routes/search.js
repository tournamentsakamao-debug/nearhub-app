// Search Routes - Location-based Search - WORKING
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// SEARCH NEARBY PROVIDERS
// ============================================
router.post('/nearby', async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      category_id, 
      radius = 5,
      page = 1, 
      limit = 20 
    } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Latitude and longitude required' 
      });
    }

    const offset = (page - 1) * limit;
    const maxRadius = parseFloat(process.env.MAX_SEARCH_RADIUS_KM || 20);
    const searchRadius = Math.min(parseFloat(radius), maxRadius);

    let query = `
      SELECT 
        sp.provider_id,
        sp.name,
        sp.business_name,
        sp.phone,
        sp.description,
        sp.address,
        sp.city,
        sp.latitude,
        sp.longitude,
        sp.is_online,
        sp.is_verified,
        sp.average_rating,
        sp.total_ratings,
        sp.total_services_completed,
        sp.profile_pic,
        sc.category_name,
        sc.category_name_hindi,
        spl.plan_name,
        spl.show_top_listing,
        spl.highlight_name,
        spl.verified_badge,
        GROUP_CONCAT(DISTINCT b.badge_name) as badges,
        (6371 * acos(cos(radians(?)) * cos(radians(sp.latitude)) * 
         cos(radians(sp.longitude) - radians(?)) + 
         sin(radians(?)) * sin(radians(sp.latitude)))) AS distance
      FROM service_providers sp
      JOIN service_categories sc ON sp.category_id = sc.category_id
      LEFT JOIN subscription_plans spl ON sp.plan_id = spl.plan_id
      LEFT JOIN provider_badges pb ON sp.provider_id = pb.provider_id
      LEFT JOIN badges b ON pb.badge_id = b.badge_id
      WHERE sp.is_active = TRUE 
        AND sp.latitude IS NOT NULL 
        AND sp.longitude IS NOT NULL
    `;

    const queryParams = [latitude, longitude, latitude];

    if (category_id) {
      query += ` AND sp.category_id = ?`;
      queryParams.push(category_id);
    }

    query += `
      GROUP BY sp.provider_id
      HAVING distance <= ?
      ORDER BY 
        spl.show_top_listing DESC,
        sp.is_online DESC,
        sp.average_rating DESC,
        distance ASC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(searchRadius, parseInt(limit), parseInt(offset));

    const [providers] = await db.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT sp.provider_id) as total
      FROM service_providers sp
      WHERE sp.is_active = TRUE 
        AND sp.latitude IS NOT NULL 
        AND sp.longitude IS NOT NULL
        AND (6371 * acos(cos(radians(?)) * cos(radians(sp.latitude)) * 
             cos(radians(sp.longitude) - radians(?)) + 
             sin(radians(?)) * sin(radians(sp.latitude)))) <= ?
    `;

    const countParams = [latitude, longitude, latitude, searchRadius];

    if (category_id) {
      countQuery += ` AND sp.category_id = ?`;
      countParams.push(category_id);
    }

    const [countResult] = await db.query(countQuery, countParams);

    res.status(200).json({
      status: 'success',
      data: {
        providers: providers.map(p => ({
          ...p,
          distance: parseFloat(p.distance.toFixed(2))
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        },
        searchParams: {
          latitude,
          longitude,
          radius: searchRadius,
          category_id
        }
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ status: 'error', message: 'Search failed' });
  }
});

// ============================================
// SEARCH ROUTES (Auto/Toto)
// ============================================
router.post('/routes', async (req, res) => {
  try {
    const { from_location, to_location, latitude, longitude } = req.body;

    if (!from_location && !to_location && (!latitude || !longitude)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Location names or coordinates required' 
      });
    }

    let query = `
      SELECT 
        r.*,
        sp.name as driver_name,
        sp.phone,
        sp.average_rating,
        sp.total_ratings,
        sp.is_online,
        sp.latitude as current_latitude,
        sp.longitude as current_longitude
      FROM routes r
      JOIN service_providers sp ON r.provider_id = sp.provider_id
      WHERE r.is_active = TRUE AND sp.is_active = TRUE
    `;

    const queryParams = [];

    if (from_location || to_location) {
      if (from_location && to_location) {
        query += ` AND (r.from_location LIKE ? OR r.to_location LIKE ? OR 
                        r.from_location LIKE ? OR r.to_location LIKE ?)`;
        queryParams.push(`%${from_location}%`, `%${from_location}%`, 
                        `%${to_location}%`, `%${to_location}%`);
      } else if (from_location) {
        query += ` AND (r.from_location LIKE ? OR r.to_location LIKE ?)`;
        queryParams.push(`%${from_location}%`, `%${from_location}%`);
      } else {
        query += ` AND (r.from_location LIKE ? OR r.to_location LIKE ?)`;
        queryParams.push(`%${to_location}%`, `%${to_location}%`);
      }
    }

    query += ` ORDER BY sp.is_online DESC, sp.average_rating DESC`;

    const [routes] = await db.query(query, queryParams);

    // Calculate distance if coordinates provided
    if (latitude && longitude) {
      routes.forEach(route => {
        if (route.current_latitude && route.current_longitude) {
          const R = 6371;
          const dLat = (route.current_latitude - latitude) * Math.PI / 180;
          const dLon = (route.current_longitude - longitude) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(latitude * Math.PI / 180) * Math.cos(route.current_latitude * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          route.distance_from_user = (R * c).toFixed(2);
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        routes,
        total: routes.length
      }
    });

  } catch (error) {
    console.error('Route search error:', error);
    res.status(500).json({ status: 'error', message: 'Route search failed' });
  }
});

// ============================================
// GET ALL CATEGORIES
// ============================================
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await db.query(
      'SELECT * FROM service_categories WHERE is_active = TRUE ORDER BY category_name'
    );

    res.status(200).json({
      status: 'success',
      data: categories
    });

  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch categories' });
  }
});

// ============================================
// GET PROVIDER DETAILS
// ============================================
router.get('/provider/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [providers] = await db.query(`
      SELECT 
        sp.*,
        sc.category_name,
        sc.category_name_hindi,
        spl.plan_name,
        spl.show_top_listing,
        spl.highlight_name,
        spl.verified_badge,
        GROUP_CONCAT(DISTINCT b.badge_name) as badges
      FROM service_providers sp
      JOIN service_categories sc ON sp.category_id = sc.category_id
      LEFT JOIN subscription_plans spl ON sp.plan_id = spl.plan_id
      LEFT JOIN provider_badges pb ON sp.provider_id = pb.provider_id
      LEFT JOIN badges b ON pb.badge_id = b.badge_id
      WHERE sp.provider_id = ? AND sp.is_active = TRUE
      GROUP BY sp.provider_id
    `, [id]);

    if (providers.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Provider not found' 
      });
    }

    // Get ratings
    const [ratings] = await db.query(`
      SELECT r.*, u.name as user_name
      FROM ratings r
      JOIN users u ON r.user_id = u.user_id
      WHERE r.provider_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [id]);

    // Get routes (if auto/toto driver)
    const [routes] = await db.query(`
      SELECT * FROM routes 
      WHERE provider_id = ? AND is_active = TRUE
    `, [id]);

    res.status(200).json({
      status: 'success',
      data: {
        provider: providers[0],
        recent_ratings: ratings,
        routes: routes
      }
    });

  } catch (error) {
    console.error('Provider details error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch details' });
  }
});

module.exports = router;
