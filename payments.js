'use strict';
/* Coin top-ups through a MOCK payment gateway (test mode only: no real money moves).
   The client API mirrors Razorpay Standard Checkout so the real SDK can replace it later:
     order = await TriundPay.server.createOrder({ amount, currency, receipt })      // backend: POST /orders
     const rzp = new TriundPay.Checkout({ key, amount, currency, name, description, order_id, prefill, handler, modal });
     rzp.on('payment.failed', fn); rzp.open();
     handler({ razorpay_payment_id, razorpay_order_id, razorpay_signature })
     ok = await TriundPay.server.verify(response)                                   // backend: HMAC-SHA256(order_id|payment_id, secret)
   Going live: load the gateway's checkout script on your own domain, replace TriundPay.Checkout with it, and move
   server.createOrder / server.verify (and the coin credit) to the backend; the secret must never be in the browser.
   Test inputs: UPI success@test / failure@test (any other valid UPI ID succeeds), card 4111 1111 1111 1111 succeeds and
   4000 0000 0000 0002 is declined, net banking offers both outcomes. */
window.TriundPay = (function () {
  const MOCK_KEY = 'test_key_mock', MOCK_SECRET = 'mock_secret_do_not_ship';
  const rid = (p, n) => p + '_' + Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 57]).join('');
  async function hmac(msg) {
    if (!crypto.subtle) return 'nosubtle_' + msg.length;
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(MOCK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- stand-in for the backend ---------- */
  const orders = new Map();
  const server = {
    async createOrder({ amount, currency = 'INR', receipt, notes }) {
      await wait(350);
      const o = { id: rid('order', 14), entity: 'order', amount, amount_paid: 0, currency, receipt, notes: notes || {}, status: 'created', created_at: Math.floor(Date.now() / 1000) };
      orders.set(o.id, o); return o;
    },
    async verify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
      await wait(200);
      const ok = (await hmac(razorpay_order_id + '|' + razorpay_payment_id)) === razorpay_signature;
      const o = orders.get(razorpay_order_id); if (ok && o) { o.status = 'paid'; o.amount_paid = o.amount; }
      return ok && !!o;
    }
  };

  /* ---------- checkout modal ---------- */
  const css = document.createElement('style');
  css.textContent = `
#payModal{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px;font:14px/1.4 system-ui,sans-serif}
#payModal .pm{background:#fff;color:#1d2433;border-radius:12px;width:100%;max-width:380px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
#payModal .ph{padding:16px 18px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
#payModal .ph b{display:block;font-size:16px}#payModal .ph small{opacity:.85}
#payModal .amt{font-size:22px;font-weight:700;white-space:nowrap}
#payModal .test{background:#fff3cd;color:#7a5a00;font-size:12px;padding:6px 18px;font-weight:600}
#payModal .pb{padding:16px 18px;display:grid;gap:10px}
#payModal .tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#payModal .tabs button{border:1px solid #d6dbe4;background:#f6f8fb;border-radius:8px;padding:8px 4px;font-weight:600;color:#1d2433}
#payModal .tabs button[aria-pressed="true"]{border-color:#2f6fd6;background:#eaf1ff;color:#1f4fa8}
#payModal label{font-size:12px;color:#5b6577;display:grid;gap:4px}
#payModal input,#payModal select{border:1px solid #cfd6e2;border-radius:8px;padding:10px;font-size:15px;color:#1d2433;background:#fff}
#payModal .hint{font-size:12px;color:#6b7486}
#payModal .go{border:0;border-radius:8px;padding:12px;font-weight:700;font-size:15px;color:#fff}
#payModal .go:disabled{opacity:.6}
#payModal .x{background:none;border:0;color:#fff;font-size:22px;line-height:1;padding:0 2px}
#payModal .res{text-align:center;padding:10px 0;display:grid;gap:6px}
#payModal .res .big{font-size:40px}`;
  document.head.appendChild(css);

  function Checkout(opts) {
    this.o = opts; this.ev = {};
  }
  Checkout.prototype.on = function (name, fn) { this.ev[name] = fn; return this; };
  Checkout.prototype.open = function () {
    const o = this.o, self = this, color = (o.theme && o.theme.color) || '#2f6fd6';
    const m = document.createElement('div'); m.id = 'payModal';
    const inr = (o.amount / 100).toLocaleString('en-IN', { style: 'currency', currency: o.currency || 'INR' });
    m.innerHTML = `<div class="pm" role="dialog" aria-label="Test checkout">
      <div class="ph" style="background:${color}"><span><b>${o.name || ''}</b><small>${o.description || ''}</small></span><span style="text-align:right"><span class="amt">${inr}</span><br><button type="button" class="x" aria-label="Close">×</button></span></div>
      <div class="test">TEST MODE · mock payment gateway · no real money is charged</div>
      <div class="pb" id="pmBody">
        <div class="tabs"><button type="button" data-m="upi" aria-pressed="true">UPI</button><button type="button" data-m="card" aria-pressed="false">Card</button><button type="button" data-m="nb" aria-pressed="false">Net banking</button></div>
        <div id="pmForm"></div>
        <button type="button" class="go" id="pmGo" style="background:${color}">Pay ${inr}</button>
        <div class="hint">Order ${o.order_id}</div>
      </div></div>`;
    document.body.appendChild(m);
    let method = 'upi';
    const form = () => {
      const f = m.querySelector('#pmForm');
      if (method === 'upi') f.innerHTML = `<label>UPI ID<input id="pmVpa" placeholder="name@bank" value="success@test" autocomplete="off"></label><div class="hint">Test: success@test pays, failure@test fails.</div>`;
      else if (method === 'card') f.innerHTML = `<label>Card number<input id="pmCard" inputmode="numeric" value="4111 1111 1111 1111"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Expiry<input value="12/30"></label><label>CVV<input value="123" inputmode="numeric"></label></div><div class="hint">Test: 4111 1111 1111 1111 pays, 4000 0000 0000 0002 is declined.</div>`;
      else f.innerHTML = `<label>Bank<select id="pmBank"><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Punjab National Bank</option></select></label>
        <label>Test outcome<select id="pmNbOut"><option value="ok">Bank approves</option><option value="fail">Bank declines</option></select></label>`;
    };
    form();
    m.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { method = b.dataset.m; m.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); form(); }));
    const close = (dismissed) => { m.remove(); if (dismissed && o.modal && o.modal.ondismiss) o.modal.ondismiss(); };
    m.querySelector('.x').addEventListener('click', () => close(true));
    m.querySelector('#pmGo').addEventListener('click', async () => {
      let fail = null;
      if (method === 'upi') { const v = m.querySelector('#pmVpa').value.trim().toLowerCase(); if (!/^[\w.\-]{2,}@[a-z]{2,}$/.test(v)) { alert('Enter a valid UPI ID, e.g. success@test'); return; } if (v === 'failure@test') fail = 'Payment declined by the UPI app (test).'; }
      else if (method === 'card') { const n = m.querySelector('#pmCard').value.replace(/\s/g, ''); if (!/^\d{16}$/.test(n)) { alert('Enter a 16-digit card number'); return; } if (n !== '4111111111111111') fail = 'Card declined by the issuing bank (test).'; }
      else if (m.querySelector('#pmNbOut').value === 'fail') fail = 'The bank declined the payment (test).';
      const body = m.querySelector('#pmBody');
      body.innerHTML = `<div class="res"><div class="big">⏳</div><b>Processing payment…</b><span class="hint">${method === 'upi' ? 'Approve the request in your UPI app (simulated).' : 'Talking to the bank (simulated).'}</span></div>`;
      await wait(1400);
      const payment_id = rid('pay', 14);
      if (fail) {
        body.innerHTML = `<div class="res"><div class="big">✕</div><b>Payment failed</b><span class="hint">${fail}</span><button type="button" class="go" style="background:${color}">Close</button></div>`;
        body.querySelector('button').addEventListener('click', () => close(true));
        if (self.ev['payment.failed']) self.ev['payment.failed']({ error: { code: 'BAD_REQUEST_ERROR', description: fail, source: method, step: 'payment_authorization', reason: 'payment_failed', metadata: { order_id: o.order_id, payment_id } } });
        return;
      }
      const signature = await hmac(o.order_id + '|' + payment_id);
      body.innerHTML = `<div class="res"><div class="big">✓</div><b>Payment successful</b><span class="hint">${payment_id}</span></div>`;
      await wait(900); close(false);
      if (o.handler) o.handler({ razorpay_payment_id: payment_id, razorpay_order_id: o.order_id, razorpay_signature: signature });
    });
  };
  return { server, Checkout, key: MOCK_KEY, testMode: true };
})();
