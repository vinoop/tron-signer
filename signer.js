// signer.js — minimal Tron signer service
const express = require('express');
const bodyParser = require('body-parser');
const TronWeb = require('tronweb');

const APP_SECRET = process.env.SIGNER_SECRET || ''; // set in Render env
const PORT = process.env.PORT || 3000;

const app = express();
app.use(bodyParser.json({ limit: '8mb' }));

// Health
app.get('/', (req, res) => res.send('Tron signer alive'));

// Sign endpoint
app.post('/sign', async (req, res) => {
  try {
    // Authenticate with X-SIGNER-SECRET
    const headerSecret = (req.header('X-SIGNER-SECRET') || '').trim();
    if (!APP_SECRET || !headerSecret || headerSecret !== APP_SECRET) {
      return res.status(403).json({ error: 'invalid_signer_secret' });
    }

    // Accept many shapes
    const body = req.body || {};
    const privateKey = (body.privateKey || body.private_key || body.pk || '').trim();
    const txObj = body.transaction || body.tx || body.raw_data || null;
    const rawHex = body.raw_data_hex || body.txHex || body.transactionHex || null;

    if (!privateKey) {
      return res.status(400).json({ error: 'missing_parameters', message: 'private key required (privateKey or private_key)' });
    }

    let txToSign = txObj;
    if (!txToSign && rawHex) {
      // If only raw hex provided, create a minimal object. TronWeb can sign if raw_data_hex is provided.
      txToSign = { raw_data_hex: rawHex };
    }

    if (!txToSign) {
      return res.status(400).json({ error: 'missing_parameters', message: 'transaction or raw_data_hex required' });
    }

    // Create TronWeb with public node (no private key here)
    const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

    // tronWeb.trx.sign accepts a transaction object (or raw_data_hex)
    // It returns signed transaction (object with signature)
    const signed = await tronWeb.trx.sign(txToSign, privateKey);

    // Return signed object
    return res.json(signed);
  } catch (err) {
    console.error('Signer error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error', message: String(err && err.message ? err.message : err) });
  }
});

app.listen(PORT, () => console.log(`Signer listening on port ${PORT}`));
