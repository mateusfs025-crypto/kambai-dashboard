const KEY      = 'af49eacb41a92fa489a714e8dd18c47d8114';
const FB_ACC   = '2858329897589220';
const GADS_ACC = '159-714-9501';
const BASE     = 'https://connectors.windsor.ai';

async function fetchW(connector, fields, account, date) {
  const params = new URLSearchParams({
    api_key:   KEY,
    fields:    ['date', ...fields].join(','),
    date_from: date,
    date_to:   date
  });
  params.append('accounts[]', account);
  const res  = await fetch(`${BASE}/${connector}?${params.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${connector} ${res.status}: ${text.slice(0,200)}`);
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : (data.data || []);
  return rows.filter(r => (r.spend || 0) > 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const [fbResult, gadsResult] = await Promise.allSettled([
      fetchW('facebook',
        ['campaign','spend','impressions','clicks','ctr','cpc','reach','frequency'],
        FB_ACC, date),
      fetchW('google_ads',
        ['campaign','spend','impressions','clicks','ctr','cpc','conversions','cost_per_conversion'],
        GADS_ACC, date)
    ]);
    const fb   = fbResult.status   === 'fulfilled' ? fbResult.value   : [];
    const gads = gadsResult.status === 'fulfilled' ? gadsResult.value : [];
    const errors = [];
    if (fbResult.status   === 'rejected') errors.push('Meta: '   + fbResult.reason?.message);
    if (gadsResult.status === 'rejected') errors.push('Google: ' + gadsResult.reason?.message);
    res.status(200).json({ ok: true, date, fb, gads, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
