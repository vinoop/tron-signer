// signer.js  — production safe (updated with robust TRC20 send + better logging)
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

// ----------------------
// Helper: robust TRC20 transfer
// Builds triggerSmartContract, signs, broadcasts.
// ----------------------
async function sendTrc20(from, to, tokenContract, tokenAmount) {
  if (!tokenAmount) throw new Error('tokenAmount empty');
  // feeLimit in SUN (100_000_000 = 100 TRX) — tune lower after testing
  const feeLimit = 100_000_000;

  // Convert contract address to hex without 0x
  const contractHex = tronWeb.address.toHex(tokenContract).replace(/^0x/, '');

  // Function selector: transfer(address,uint256)
  const functionSelector = 'transfer(address,uint256)';

  const params = [
    { type: 'address', value: to },
    { type: 'uint256', value: tokenAmount.toString() }
  ];

  // triggerSmartContract returns an object with `transaction` (unsigned)
  const txObj = await tronWeb.transactionBuilder.triggerSmartContract(
    contractHex,
    functionSelector,
    { feeLimit: feeLimit },
    params,
    from
  );

  if (!txObj || !txObj.transaction) {
    throw new Error('triggerSmartContract returned no transaction object: ' + JSON.stringify(txObj));
  }

  // sign
  const signed = await tronWeb.trx.sign(txObj.transaction, PRIVATE_KEY);
  if (!signed) throw new Error('Signing failed');

  // broadcast
  const broadcast = await tronWeb.trx.sendRawTransaction(signed);
  return broadcast;
}

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
    const tokenContract = body.tokenContract || body.token_contract || body.contract;
    const tokenAmount = body.tokenAmount || body.token_amount || body.amount_in_base || body.amount;

    if (!from || !to || (!amountSun && !tokenContract)) {
      return res.status(400).json({ error: 'missing_parameters' });
    }

    // normalize
    if (typeof amountSun === 'string') amountSun = amountSun.trim();

    // TRC20 transfer (use robust helper)
    if (tokenContract && tokenAmount) {
      try {
        // Optional safety check: ensure signer private key corresponds to `from`
        // If your architecture uses the signer hot wallet to sign only its own address, skip this.
        try {
          const signerAddr = tronWeb.address.fromPrivateKey(PRIVATE_KEY);
          if (signerAddr && signerAddr !== from) {
            // It's okay if signer is signing for other addresses only if you intentionally provided their key.
            // If you want to enforce signer only signs for its own address, uncomment next lines:
            // return res.status(403).json({ error: 'forbidden', detail: 'signer key does not match from address' });
            // For now we log a warning:
            console.warn('Warning: signer private key address %s does not match request from %s', signerAddr, from);
          }
        } catch (e) {
          // ignore address-from-key check failures
        }

        const result = await sendTrc20(from, to, tokenContract, tokenAmount);
        // result often contains { result: true, txid: "..." } or boolean; return it raw
        return res.json({ status: 'ok', type: 'trc20', result });
      } catch (err) {
        // Improved error logging and return
        try {
          console.error('TRC20 send error - full:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        } catch (e) {
          console.error('TRC20 send error (string):', String(err));
        }
        const detail = err && err.message ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
        return res.status(500).json({ error: 'trc20_error', detail });
      }
    }

    // TRX transfer
    try {
      const amountTRX = Number(amountSun) / 1e6;
      const tx = await tronWeb.transactionBuilder.sendTrx(to, amountTRX, from);
      const signed = await tronWeb.trx.sign(tx, PRIVATE_KEY);
      const result = await tronWeb.trx.sendRawTransaction(signed);

      return res.json({ status: 'ok', type: 'trx', result: result });
    } catch (err) {
      try {
        console.error('TRX send error - full:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      } catch (e) {
        console.error('TRX send error (string):', String(err));
      }
      const detail = err && err.message ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
      return res.status(500).json({ error: 'trx_error', detail });
    }

  } catch (err) {
    console.error('signer unexpected error:', err && err.stack ? err.stack : err);
    const detail = err && err.message ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
    return res.status(500).json({ error: 'server_error', detail });
  }
});

app.listen(PORT, () => console.log(`Signer running on port ${PORT}`));
