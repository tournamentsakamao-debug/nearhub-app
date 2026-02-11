// Payment Routes - COMPLETE & WORKING
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { body, validationResult } = require('express-validator');
const { verifyAdmin } = require('../middleware/auth');

// ============================================
// GET SUBSCRIPTION PLANS
// ============================================
router.get('/plans', async (req, res) => {
  try {
    const [plans] = await db.query(
      'SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price ASC'
    );

    res.status(200).json({
      status: 'success',
      data: plans
    });

  } catch (error) {
    console.error('Plans error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch plans' });
  }
});

// ============================================
// GET PAYMENT INFO (UPI/QR)
// ============================================
router.get('/payment-info', async (req, res) => {
  try {
    const [settings] = await db.query(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('upi_id', 'qr_code_url')"
    );

    const paymentInfo = {};
    settings.forEach(s => {
      paymentInfo[s.setting_key] = s.setting_value;
    });

    res.status(200).json({
      status: 'success',
      data: {
        upi_id: paymentInfo.upi_id || process.env.UPI_ID,
        qr_code_url: paymentInfo.qr_code_url || process.env.PAYMENT_QR_CODE_PATH,
        instructions: [
          '1. Scan QR code ya UPI ID use karein',
          '2. Plan ka amount transfer karein',
          '3. Payment successful hone ke baad UTR number copy karein',
          '4. Neeche form me UTR number dale aur submit karein',
          '5. Admin verify karega aur account activate ho jayega (24 hours)'
        ]
      }
    });

  } catch (error) {
    console.error('Payment info error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch payment info' });
  }
});

// ============================================
// SUBMIT PAYMENT
// ============================================
router.post('/submit', [
  body('provider_id').isInt(),
  body('plan_id').isInt(),
  body('utr_number').notEmpty(),
  body('amount').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { provider_id, plan_id, utr_number, amount, payment_method = 'UPI' } = req.body;

    // Check provider exists
    const [providers] = await db.query(
      'SELECT provider_id, name FROM service_providers WHERE provider_id = ?',
      [provider_id]
    );

    if (providers.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Provider not found' });
    }

    // Check plan exists
    const [plans] = await db.query(
      'SELECT plan_id, price FROM subscription_plans WHERE plan_id = ?',
      [plan_id]
    );

    if (plans.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Plan not found' });
    }

    // Validate amount
    if (parseFloat(amount) !== parseFloat(plans[0].price)) {
      return res.status(400).json({ 
        status: 'error', 
        message: `Amount mismatch. Expected ₹${plans[0].price}` 
      });
    }

    // Check UTR already used
    const [existingPayment] = await db.query(
      'SELECT payment_id FROM payment_records WHERE utr_number = ?',
      [utr_number]
    );

    if (existingPayment.length > 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'This UTR number already submitted' 
      });
    }

    // Insert payment record
    const [result] = await db.query(
      `INSERT INTO payment_records 
       (provider_id, plan_id, amount, utr_number, payment_method, status) 
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [provider_id, plan_id, amount, utr_number, payment_method]
    );

    res.status(201).json({
      status: 'success',
      message: 'Payment submitted! Admin will verify within 24 hours.',
      data: {
        payment_id: result.insertId,
        utr_number,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Payment submission error:', error);
    res.status(500).json({ status: 'error', message: 'Payment submission failed' });
  }
});

// ============================================
// CHECK PAYMENT STATUS
// ============================================
router.get('/status/:provider_id', async (req, res) => {
  try {
    const { provider_id } = req.params;

    const [payments] = await db.query(
      `SELECT 
        pr.*,
        spl.plan_name,
        spl.price
      FROM payment_records pr
      JOIN subscription_plans spl ON pr.plan_id = spl.plan_id
      WHERE pr.provider_id = ?
      ORDER BY pr.submitted_at DESC
      LIMIT 1`,
      [provider_id]
    );

    if (payments.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'No payment record found' 
      });
    }

    const payment = payments[0];
    let statusMessage = '';

    switch(payment.status) {
      case 'pending':
        statusMessage = 'Payment verification pending. Jaldi approve hoga.';
        break;
      case 'approved':
        statusMessage = 'Payment approved! Account active hai.';
        break;
      case 'rejected':
        statusMessage = 'Payment rejected. Support se contact karein.';
        break;
    }

    res.status(200).json({
      status: 'success',
      data: {
        ...payment,
        statusMessage
      }
    });

  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to check status' });
  }
});

// ============================================
// ADMIN: GET PENDING PAYMENTS
// ============================================
router.get('/admin/pending', verifyAdmin, async (req, res) => {
  try {
    const [payments] = await db.query(
      `SELECT 
        pr.*,
        sp.name as provider_name,
        sp.phone as provider_phone,
        sp.business_name,
        spl.plan_name
      FROM payment_records pr
      JOIN service_providers sp ON pr.provider_id = sp.provider_id
      JOIN subscription_plans spl ON pr.plan_id = spl.plan_id
      WHERE pr.status = 'pending'
      ORDER BY pr.submitted_at DESC`
    );

    res.status(200).json({
      status: 'success',
      data: {
        payments,
        total: payments.length
      }
    });

  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch payments' });
  }
});

// ============================================
// ADMIN: APPROVE/REJECT PAYMENT
// ============================================
router.post('/admin/verify/:payment_id', verifyAdmin, [
  body('action').isIn(['approve', 'reject']),
  body('admin_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { payment_id } = req.params;
    const { action, admin_id, notes } = req.body;

    // Get payment details
    const [payments] = await db.query(
      'SELECT provider_id, plan_id, amount FROM payment_records WHERE payment_id = ?',
      [payment_id]
    );

    if (payments.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Payment not found' });
    }

    const payment = payments[0];

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Update payment status
      await db.query(
        `UPDATE payment_records 
         SET status = ?, approved_at = NOW(), approved_by = ?, admin_notes = ?
         WHERE payment_id = ?`,
        [action === 'approve' ? 'approved' : 'rejected', admin_id, notes || null, payment_id]
      );

      // If approved, activate provider
      if (action === 'approve') {
        const subscriptionStart = new Date();
        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

        await db.query(
          `UPDATE service_providers 
           SET 
             is_active = TRUE,
             plan_id = ?,
             subscription_start_date = ?,
             subscription_end_date = ?
           WHERE provider_id = ?`,
          [
            payment.plan_id, 
            subscriptionStart.toISOString().split('T')[0],
            subscriptionEnd.toISOString().split('T')[0],
            payment.provider_id
          ]
        );
      }

      await db.query('COMMIT');

      res.status(200).json({
        status: 'success',
        message: action === 'approve' ? 'Payment approved!' : 'Payment rejected',
        data: {
          payment_id,
          action,
          provider_id: payment.provider_id
        }
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
});

module.exports = router;
