// signer.js  — production safe
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TronWeb = require('tronweb');

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));

const SECRET = process.env.SIGNER_SECRET;
const PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const TRONGRID = process.env.TRONGRID_BASE || 'https://api.trongrid.io';
const PORT = process.env.PORT || 3000;

if (!SECRET || !PRIVATE_KEY) {
  console.error('Missing SIGNER_SECRET or SIGNER_PRIVATE_KEY in environment. Exiting.');
  process.exit(1);
}

const tronWeb = new TronWeb({ fullHost: TRONGRID, privateKey: PRIVATE_KEY });

// health
app.get('/', (req, res) => res.json({ status: 'signer-up' }));

app.post('/sign', async (req, res) => {
  try {
    // auth
    if (req.header('X-SIGNER-SECRET') !== SECRET) {
      return res.status(403).json({ error: 'invalid_signer_secret' });
    }

    // accept many names (backwards compat)
    const body = req.body || {};
    const from = body.from || body.from_address;
    const to   = body.to   || body.to_address || body.company;
    let amountSun = body.amountSun || body.amount_sun || body.trx_amount || body.trxAmount;
    const tokenContract = body.tokenContract || body.token_contract;
    const tokenAmount = body.tokenAmount || body.token_amount;

    if (!from || !to || (!amountSun && !tokenContract)) {
      return res.status(400).json({ error: 'missing_parameters' });
    }

    // normalize
    if (typeof amountSun === 'string') amountSun = amountSun.trim();

    // TRC20 transfer
    if (tokenContract && tokenAmount) {
      try {
        const contract = await tronWeb.contract().at(tokenContract);
        // tokenAmount must be in smallest units (string or number)
        const tx = await contract.transfer(to, tokenAmount).send();
        // contract.transfer returns tx info or txid depending on node/contract; normalize
        return res.json({ status: 'ok', type: 'trc20', tx: tx });
      } catch (err) {
        console.error('TRC20 send error:', err && err.toString ? err.toString() : err);
        return res.status(500).json({ error: 'trc20_error', detail: err.toString ? err.toString() : String(err) });
      }
    }

    // TRX transfer
    try {
      const amountTRX = Number(amountSun) / 1e6;
      const tx = await tronWeb.transactionBuilder.sendTrx(to, amountTRX, from);
      const signed = await tronWeb.trx.sign(tx, PRIVATE_KEY);
      const result = await tronWeb.trx.sendRawTransaction(signed);

      // result often contains {result: true, txid: '...'} or other structure
      return res.json({ status: 'ok', type: 'trx', result: result });
    } catch (err) {
      console.error('TRX send error:', err && err.toString ? err.toString() : err);
      return res.status(500).json({ error: 'trx_error', detail: err.toString ? err.toString() : String(err) });
    }

  } catch (err) {
    console.error('signer unexpected error:', err);
    return res.status(500).json({ error: 'server_error', detail: err.toString ? err.toString() : String(err) });
  }
});

app.listen(PORT, () => console.log(`Signer running on port ${PORT}`));
