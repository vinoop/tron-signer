// signer.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TronWeb = require('tronweb');

const app = express();
app.use(bodyParser.json());

// load environment variables
const SECRET = process.env.SIGNER_SECRET || 'super_signer_secret_here';
const PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const TRONGRID = process.env.TRONGRID_BASE || 'https://api.shasta.trongrid.io';
const PORT = process.env.PORT || 3000;

if (!PRIVATE_KEY) {
  console.error('Missing SIGNER_PRIVATE_KEY in env');
  process.exit(1);
}

const tronWeb = new TronWeb({ fullHost: TRONGRID, privateKey: PRIVATE_KEY });

app.post('/sign', async (req, res) => {
  if (req.header('X-SIGNER-SECRET') !== SECRET) {
    return res.status(403).json({ error: 'invalid_signer_secret' });
  }

  const { from, to, amountSun, tokenContract, tokenAmount } = req.body;
  if (!from || !to || (!amountSun && !tokenContract)) {
    return res.status(400).json({ error: 'missing_parameters' });
  }

  try {
    if (tokenContract && tokenAmount) {
      // TRC20 (like USDT)
      const contract = await tronWeb.contract().at(tokenContract);
      const txid = await contract.transfer(to, tokenAmount).send();
      return res.json({ status: 'ok', result: { txid } });
    } else {
      // TRX transfer
      const tx = await tronWeb.transactionBuilder.sendTrx(to, amountSun / 1e6, from);
      const signed = await tronWeb.trx.sign(tx, PRIVATE_KEY);
      const result = await tronWeb.trx.sendRawTransaction(signed);
      return res.json({ status: 'ok', result });
    }
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.listen(PORT, () => console.log(`Signer running on port ${PORT}`));
