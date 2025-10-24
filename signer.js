// signer-debug.js  (temporary debug version)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TronWeb = require('tronweb');

const app = express();

// parse JSON and also raw text fallback
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.text({ type: '*/*', limit: '5mb' })); // fallback if content-type not json

// load env
const SECRET = process.env.SIGNER_SECRET || 'super_signer_secret_here';
const PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const TRONGRID = process.env.TRONGRID_BASE || 'https://api.shasta.trongrid.io';
const PORT = process.env.PORT || 3000;

// Basic health endpoint
app.get('/', (req, res) => res.json({ status: 'signer-debug-up' }));

// The debug /sign endpoint
app.post('/sign', async (req, res) => {
  try {
    // Log headers for debugging (Render logs)
    console.log('--- NEW /sign request ---');
    console.log('headers:', JSON.stringify(req.headers));

    // Try to get parsed body. If bodyParser.json worked, req.body is object.
    let body = req.body;
    if (!body || typeof body === 'string') {
      // if it's string, attempt to parse JSON
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          // If not JSON, attempt to read raw text from req (already in req.body)
          console.log('raw body string (non-json):', body);
          body = {};
        }
      } else {
        body = {};
      }
    }

    console.log('parsed body:', JSON.stringify(body));

    // Accept many possible field names used by different clients
    const from = body.from || body.from_address || body.address || body.source || body.sender;
    const to   = body.to   || body.to_address || body.company || body.destination || body.recipient;
    let amountSun = body.amountSun || body.amount_sun || body.trx_amount || body.trxAmount || body.amount || body.value;
    const tokenContract = body.tokenContract || body.token_contract || body.contract || body.token;
    const tokenAmount = body.tokenAmount || body.token_amount || body.token_amount_units || body.token_value || body.tokenValue;

    // Print what we resolved
    console.log('resolved -> from:', from, 'to:', to, 'amountSun:', amountSun, 'tokenContract:', tokenContract, 'tokenAmount:', tokenAmount);

    // If missing, respond with debug payload so caller can see what to change
    if (!from || !to || (!amountSun && !tokenContract)) {
      // Return the body we parsed so you can inspect keys and values
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'Required fields not found. See "received" for what the server parsed.',
        received: {
          rawHeaders: req.headers,
          parsedBody: body,
          resolved: { from, to, amountSun, tokenContract, tokenAmount }
        }
      });
    }

    // Normalize amountSun to number/string
    amountSun = typeof amountSun === 'string' ? amountSun.trim() : amountSun;

    // If you want to test signature path without actually broadcasting, respond with ok
    // (For debugging we will not sign/broadcast automatically)
    return res.json({
      status: 'debug_ok',
      message: 'Request parsed successfully (debug mode). Replace with signing logic after confirming fields.',
      resolved: { from, to, amountSun, tokenContract, tokenAmount }
    });

    // ---------- production signing code (commented out during debug) ----------
    // if (!PRIVATE_KEY) {
    //   return res.status(500).json({ error: 'missing_private_key' });
    // }
    // const tronWeb = new TronWeb({ fullHost: TRONGRID, privateKey: PRIVATE_KEY });
    // if (tokenContract && tokenAmount) {
    //   const contract = await tronWeb.contract().at(tokenContract);
    //   const txResult = await contract.transfer(to, tokenAmount).send();
    //   return res.json({ status: 'ok', result: txResult });
    // } else {
    //   const tx = await tronWeb.transactionBuilder.sendTrx(to, amountSun / 1e6, from);
    //   const signed = await tronWeb.trx.sign(tx, PRIVATE_KEY);
    //   const result = await tronWeb.trx.sendRawTransaction(signed);
    //   return res.json({ status: 'ok', result });
    // }

  } catch (err) {
    console.error('signer-debug error:', err);
    return res.status(500).json({ error: 'server_error', detail: err.toString() });
  }
});

// start
app.listen(PORT, () => console.log(`Signer DEBUG running on port ${PORT}`));
