// src/controllers/paymentsController.js
const { query, getClient } = require('../db');
const crypto = require('crypto');

// ── Config CinetPay ──────────────────────────────────────────────
const CINETPAY_API     = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_CHECK   = 'https://api-checkout.cinetpay.com/v2/payment/check';
const SITE_ID          = process.env.CINETPAY_SITE_ID;
const API_KEY          = process.env.CINETPAY_API_KEY;
const PLATFORM_FEE_PCT = parseFloat(process.env.PLATFORM_FEE_PCT || '5'); // 5% de commission

// URL de retour après paiement (front public)
const RETURN_URL  = process.env.FRONTEND_URL || 'http://localhost:3000';
const WEBHOOK_URL = process.env.BACKEND_URL  || 'http://localhost:5000';

// ─── POST /api/payments/cinetpay/initiate ────────────────────────
// Crée la transaction + retourne l'URL CinetPay
async function initiate(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { registration_id } = req.body;
    if (!registration_id) {
      return res.status(400).json({ success: false, error: 'registration_id obligatoire' });
    }

    // Récupérer l'inscription
    const regResult = await client.query(`
      SELECT r.*, tt.name AS ticket_name, tt.price,
             e.title AS event_title, e.organizer_id,
             o.name AS organizer_name
      FROM registrations r
      JOIN ticket_types tt ON tt.id = r.ticket_type_id
      JOIN events e ON e.id = r.event_id
      JOIN organizers o ON o.id = e.organizer_id
      WHERE r.id = $1
    `, [registration_id]);

    if (!regResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Inscription introuvable' });
    }

    const reg = regResult.rows[0];

    // Vérifier que le paiement est bien dû
    if (reg.status === 'CONFIRMED' || reg.status === 'MANUAL') {
      return res.status(400).json({ success: false, error: 'Cette inscription est déjà confirmée' });
    }

    if (parseFloat(reg.amount_paid) === 0) {
      return res.status(400).json({ success: false, error: 'Ce billet est gratuit, aucun paiement requis' });
    }

    // Vérifier pas de transaction PENDING déjà en cours
    const existingTx = await client.query(`
      SELECT id, payment_token FROM transactions
      WHERE registration_id = $1 AND status = 'PENDING'
        AND created_at > NOW() - INTERVAL '30 minutes'
    `, [registration_id]);

    // Calculer les frais de plateforme
    const amount        = parseFloat(reg.amount_paid);
    const platformFee   = Math.round(amount * PLATFORM_FEE_PCT / 100);
    const netAmount     = amount - platformFee;

    // Générer un transaction_id unique
    const txId = 'EVX-PAY-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Créer la transaction en DB
    const txResult = await client.query(`
      INSERT INTO transactions (
        registration_id, event_id, organizer_id, provider,
        transaction_id, amount, currency, status, metadata
      ) VALUES ($1,$2,$3,'CINETPAY',$4,$5,$6,'PENDING',$7)
      ON CONFLICT (transaction_id) DO NOTHING
      RETURNING *
    `, [
      reg.id, reg.event_id, reg.organizer_id,
      txId, amount, 'XAF',
      JSON.stringify({
        event_title: reg.event_title,
        ticket_name: reg.ticket_name,
        participant: `${reg.first_name} ${reg.last_name}`,
        email: reg.email,
        platform_fee: platformFee,
        net_amount: netAmount,
      }),
    ]);

    // Appel API CinetPay
    const cinetpayPayload = {
      apikey:           API_KEY,
      site_id:          SITE_ID,
      transaction_id:   txId,
      amount:           Math.round(amount),
      currency:         'XAF',
      alternative_currency: '',
      description:      `${reg.ticket_name} — ${reg.event_title}`,
      customer_id:      reg.id,
      customer_name:    reg.last_name,
      customer_surname: reg.first_name,
      customer_email:   reg.email,
      customer_phone_number: reg.phone || '',
      customer_address: '',
      customer_city:    '',
      customer_country: 'CM',
      customer_state:   'CM',
      customer_zip_code: '',
      notify_url:  `${WEBHOOK_URL}/api/payments/cinetpay/webhook`,
      return_url:  `${RETURN_URL}/evolyx-public.html#confirm/${reg.ticket_code}`,
      channels:    'ALL',        // MTN, ORANGE, WAVE, etc.
      metadata:    reg.ticket_code,
      lang:        'fr',
    };

    const cpRes = await fetch(CINETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cinetpayPayload),
    });

    const cpData = await cpRes.json();

    if (cpData.code !== '201') {
      await client.query('ROLLBACK');
      console.error('CinetPay error:', cpData);
      return res.status(502).json({
        success: false,
        error: 'Erreur CinetPay : ' + (cpData.message || 'Paiement impossible pour le moment'),
        cinetpay_code: cpData.code,
      });
    }

    // Sauvegarder le payment_token CinetPay
    await client.query(
      `UPDATE transactions SET payment_token = $1 WHERE id = $2`,
      [cpData.data?.payment_token, txResult.rows[0].id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        transaction_id:  txId,
        payment_url:     cpData.data?.payment_url,
        payment_token:   cpData.data?.payment_token,
        amount,
        currency:        'XAF',
        registration_id: reg.id,
        ticket_code:     reg.ticket_code,
      },
      message: 'Redirection vers CinetPay...',
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/payments/cinetpay/webhook ─────────────────────────
// CinetPay appelle cette route après paiement
// ⚠️  Route publique — pas d'auth — vérifier la signature
async function webhook(req, res, next) {
  const client = await getClient();
  try {
    const { cpm_trans_id, cpm_site_id, cpm_result, cpm_amount, cpm_currency } = req.body;

    console.log('CinetPay webhook reçu:', req.body);

    // Vérifier que le site_id correspond
    if (cpm_site_id !== SITE_ID) {
      console.warn('Webhook CinetPay: site_id invalide', cpm_site_id);
      return res.status(200).send('OK'); // toujours 200 pour CinetPay
    }

    // Vérifier la transaction en DB
    const txResult = await client.query(
      `SELECT t.*, r.ticket_code, r.first_name, r.last_name, r.email, r.event_id
       FROM transactions t
       JOIN registrations r ON r.id = t.registration_id
       WHERE t.transaction_id = $1`,
      [cpm_trans_id]
    );

    if (!txResult.rows.length) {
      console.warn('Webhook CinetPay: transaction introuvable', cpm_trans_id);
      return res.status(200).send('OK');
    }

    const tx = txResult.rows[0];

    // Éviter double traitement
    if (tx.status === 'SUCCESS') {
      return res.status(200).send('OK');
    }

    await client.query('BEGIN');

    if (cpm_result === '00') {
      // ✅ Paiement réussi — vérification supplémentaire via API CinetPay
      const verif = await verifyCinetPay(cpm_trans_id);

      if (verif.status === 'SUCCESS') {
        // Mettre à jour la transaction
        await client.query(`
          UPDATE transactions
          SET status = 'SUCCESS',
              payment_method = $1,
              webhook_received_at = NOW(),
              updated_at = NOW(),
              metadata = metadata || $2::jsonb
          WHERE id = $3
        `, [
          verif.payment_method || 'MOBILE_MONEY',
          JSON.stringify({ verified_amount: verif.amount, payment_date: verif.payment_date }),
          tx.id,
        ]);

        // Confirmer l'inscription
        await client.query(`
          UPDATE registrations
          SET status = 'CONFIRMED',
              payment_method = $1,
              paid_at = NOW(),
              updated_at = NOW()
          WHERE id = $2
        `, [verif.payment_method || 'MOBILE_MONEY', tx.registration_id]);

        // Mettre à jour les frais plateforme
        const platformFee = Math.round(parseFloat(tx.amount) * PLATFORM_FEE_PCT / 100);
        await client.query(`
          UPDATE registrations
          SET platform_fee = $1, net_amount = $2
          WHERE id = $3
        `, [platformFee, tx.amount - platformFee, tx.registration_id]);

        console.log(`✅ Paiement confirmé: ${tx.ticket_code} — ${tx.amount} XAF`);

        // TODO: envoyer email de confirmation avec billet PDF
      }
    } else {
      // ❌ Paiement échoué ou annulé
      await client.query(`
        UPDATE transactions
        SET status = $1, webhook_received_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [cpm_result === '01' ? 'CANCELLED' : 'FAILED', tx.id]);

      await client.query(`
        UPDATE registrations SET status = 'PENDING', updated_at = NOW() WHERE id = $1
      `, [tx.registration_id]);

      console.log(`❌ Paiement échoué: ${tx.ticket_code} — code: ${cpm_result}`);
    }

    await client.query('COMMIT');
    res.status(200).send('OK'); // CinetPay attend toujours 200

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Webhook error:', err);
    res.status(200).send('OK'); // toujours 200 même en cas d'erreur
  } finally {
    client.release();
  }
}

// ─── Vérification CinetPay (après webhook) ───────────────────────
async function verifyCinetPay(transactionId) {
  try {
    const r = await fetch(CINETPAY_CHECK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey:         API_KEY,
        site_id:        SITE_ID,
        transaction_id: transactionId,
      }),
    });
    const d = await r.json();
    if (d.code === '00' && d.data?.status === 'ACCEPTED') {
      return {
        status:         'SUCCESS',
        amount:         d.data.amount,
        payment_method: d.data.payment_method,
        payment_date:   d.data.payment_date,
      };
    }
    return { status: 'FAILED' };
  } catch (e) {
    console.error('CinetPay verify error:', e);
    return { status: 'FAILED' };
  }
}

// ─── GET /api/payments/cinetpay/verify/:transactionId ────────────
// Vérification manuelle (front peut poller après retour CinetPay)
async function verify(req, res, next) {
  try {
    const { transactionId } = req.params;

    const txResult = await query(`
      SELECT t.*, r.ticket_code, r.status AS reg_status,
             r.first_name, r.last_name, r.email
      FROM transactions t
      JOIN registrations r ON r.id = t.registration_id
      WHERE t.transaction_id = $1
    `, [transactionId]);

    if (!txResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Transaction introuvable' });
    }

    const tx = txResult.rows[0];

    // Si encore PENDING → vérifier en live sur CinetPay
    if (tx.status === 'PENDING') {
      const verif = await verifyCinetPay(transactionId);
      if (verif.status === 'SUCCESS') {
        // Mettre à jour en DB
        await query(`UPDATE transactions SET status='SUCCESS', updated_at=NOW() WHERE id=$1`, [tx.id]);
        await query(`UPDATE registrations SET status='CONFIRMED', paid_at=NOW() WHERE id=$1`, [tx.registration_id]);
        tx.status = 'SUCCESS';
        tx.reg_status = 'CONFIRMED';
      }
    }

    res.json({
      success: true,
      data: {
        transaction_id:  tx.transaction_id,
        status:          tx.status,
        amount:          tx.amount,
        currency:        tx.currency,
        payment_method:  tx.payment_method,
        ticket_code:     tx.ticket_code,
        registration_status: tx.reg_status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/payments/status/:registrationId ────────────────────
// Statut paiement pour une inscription (front polle cette route)
async function getStatus(req, res, next) {
  try {
    const { registrationId } = req.params;

    const result = await query(`
      SELECT
        r.id, r.status, r.ticket_code, r.amount_paid, r.paid_at,
        r.first_name, r.last_name,
        t.transaction_id, t.status AS tx_status,
        t.payment_method, t.amount AS tx_amount, t.created_at AS tx_created_at
      FROM registrations r
      LEFT JOIN transactions t ON t.registration_id = r.id
        AND t.status IN ('SUCCESS','PENDING')
      WHERE r.id = $1
      ORDER BY t.created_at DESC
      LIMIT 1
    `, [registrationId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Inscription introuvable' });
    }

    const row = result.rows[0];

    res.json({
      success: true,
      data: {
        registration_id:  row.id,
        registration_status: row.status,
        ticket_code:      row.ticket_code,
        amount_paid:      row.amount_paid,
        paid_at:          row.paid_at,
        transaction: row.transaction_id ? {
          id:             row.transaction_id,
          status:         row.tx_status,
          payment_method: row.payment_method,
          amount:         row.tx_amount,
          created_at:     row.tx_created_at,
        } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/payments/history ───────────────────────────────────
// Historique transactions de l'organisateur connecté
async function getHistory(req, res, next) {
  try {
    const organizerId = req.organizer.id;
    const { page = 1, limit = 20, status, eventId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE t.organizer_id = $1';
    const params = [organizerId];
    let idx = 2;

    if (status) { where += ` AND t.status = $${idx++}`; params.push(status); }
    if (eventId) { where += ` AND t.event_id = $${idx++}`; params.push(eventId); }

    const countRes = await query(`SELECT COUNT(*) FROM transactions t ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await query(`
      SELECT
        t.id, t.transaction_id, t.amount, t.currency, t.status,
        t.provider, t.payment_method, t.created_at, t.webhook_received_at,
        t.metadata->>'platform_fee' AS platform_fee,
        t.metadata->>'net_amount' AS net_amount,
        r.first_name, r.last_name, r.email, r.ticket_code,
        e.title AS event_title
      FROM transactions t
      JOIN registrations r ON r.id = t.registration_id
      JOIN events e ON e.id = t.event_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total/parseInt(limit)) },
        summary: {
          total_amount: result.rows.filter(t=>t.status==='SUCCESS').reduce((s,t)=>s+parseFloat(t.amount),0),
          total_fees:   result.rows.filter(t=>t.status==='SUCCESS').reduce((s,t)=>s+parseFloat(t.platform_fee||0),0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { initiate, webhook, verify, getStatus, getHistory };