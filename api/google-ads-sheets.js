const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRSMIOGrAgUGPoG1di7PY8mlUnmrZ1c0bkJYCTC2eTYm0G92ob548FNqI6WhNFFk5Ykc8sJDSRNUuHG/pub?gid=0&single=true&output=csv';

let cache = { data: null, ts: 0 };
const TTL = 10 * 60 * 1000;

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQ = !inQ;
      else if (line[i] === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = (vals[i] || '').replace(/"/g,'').trim());
    return row;
  });
}

function n(v) { return parseFloat((v||'').replace(',','.')) || 0; }

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (cache.data && (Date.now() - cache.ts) < TTL) {
    return res.end(JSON.stringify({ ok: true, cached: true, ...cache.data }));
  }

  try {
    const r = await fetch(CSV_URL);
    if (!r.ok) throw new Error('Erro CSV: ' + r.status);
    const text = await r.text();
    const rows = parseCSV(text).filter(r => r.campaign);

    if (!rows.length) throw new Error('Planilha vazia ou sem dados');

    const camps = {}, byDay = {};
    let totSpend=0, totImpr=0, totClicks=0, totConv=0, totConvVal=0;

    rows.forEach(r => {
      const camp    = r.campaign || '(sem nome)';
      const date    = (r.date || '').slice(0, 10);
      const spend   = n(r.cost);
      const impr    = n(r.impressions);
      const clicks  = n(r.clicks);
      const conv    = n(r.conversions);
      const convVal = n(r.conversion_value);

      totSpend   += spend;
      totImpr    += impr;
      totClicks  += clicks;
      totConv    += conv;
      totConvVal += convVal;

      if (!camps[camp]) camps[camp] = { name:camp, spend:0, impressions:0, clicks:0, conversions:0, conversionValue:0 };
      camps[camp].spend           += spend;
      camps[camp].impressions     += impr;
      camps[camp].clicks          += clicks;
      camps[camp].conversions     += conv;
      camps[camp].conversionValue += convVal;

      if (date) {
        if (!byDay[date]) byDay[date] = { date, spend:0, clicks:0, conversions:0, conversionValue:0 };
        byDay[date].spend           += spend;
        byDay[date].clicks          += clicks;
        byDay[date].conversions     += conv;
        byDay[date].conversionValue += convVal;
      }
    });

    const campaigns = Object.values(camps).map(c => ({
      ...c,
      cpc:  c.clicks > 0      ? c.spend / c.clicks           : 0,
      ctr:  c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpa:  c.conversions > 0 ? c.spend / c.conversions      : 0,
      roas: c.spend > 0       ? c.conversionValue / c.spend  : 0,
    })).sort((a, b) => b.spend - a.spend);

    const summary = {
      spend: totSpend, impressions: totImpr, clicks: totClicks,
      conversions: totConv, conversionValue: totConvVal,
      cpc:  totClicks > 0 ? totSpend / totClicks           : 0,
      ctr:  totImpr > 0   ? (totClicks / totImpr) * 100    : 0,
      cpa:  totConv > 0   ? totSpend / totConv             : 0,
      roas: totSpend > 0  ? totConvVal / totSpend          : 0,
    };

    const dailyTrend = Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date));

    const result = { summary, campaigns, dailyTrend };
    cache = { data: result, ts: Date.now() };
    return res.end(JSON.stringify({ ok: true, cached: false, ...result }));

  } catch(e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: e.message }));
  }
};
