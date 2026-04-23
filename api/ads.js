const KEY      = 'af49eacb41a92fa489a714e8dd18c47d8114';
const FB_ACC   = '2858329897589220';
const GADS_ACC = '159-714-9501';
const GA4_ACC  = '379550350';
const BASE     = 'https://connectors.windsor.ai';

async function fetchW(connector, fields, account, dateOpts) {
  const params = new URLSearchParams({ api_key: KEY, fields: fields.join(',') });
  params.append('accounts[]', account);
  if (dateOpts.date_from) { params.set('date_from', dateOpts.date_from); params.set('date_to', dateOpts.date_to); }
  if (dateOpts.date_preset) params.set('date_preset', dateOpts.date_preset);
  const res  = await fetch(`${BASE}/${connector}?${params}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${connector} ${res.status}`);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : (data.data || []);
}

function aggregateGA4(rows) {
  const ch = { 'Facebook Ads':{r:0,t:0,s:0}, 'Google Ads':{r:0,t:0,s:0},
    'Instagram':{r:0,t:0,s:0}, 'Direto':{r:0,t:0,s:0},
    'Orgânico':{r:0,t:0,s:0}, 'Email':{r:0,t:0,s:0}, 'Outros':{r:0,t:0,s:0} };
  const byDay = {};
  let totRev=0, totTx=0, totSess=0, totNew=0;
  (rows||[]).forEach(r => {
    const src = (r.source||'').toLowerCase(), med = (r.medium||'').toLowerCase();
    const rev=r.totalrevenue||0, tx=r.transactions||0, sess=r.sessions||0, nu=r.newusers||0;
    totRev+=rev; totTx+=tx; totSess+=sess; totNew+=nu;
    let c;
    if (src==='facebook'&&(med==='cpc'||med==='dpa')) c='Facebook Ads';
    else if (src==='google'&&med==='cpc') c='Google Ads';
    else if (src.includes('instagram')||src==='l.instagram.com'||src.startsWith('ig')) c='Instagram';
    else if (src==='(direct)') c='Direto';
    else if (med==='organic') c='Orgânico';
    else if (src==='edrone'||med==='email') c='Email';
    else c='Outros';
    ch[c].r+=rev; ch[c].t+=tx; ch[c].s+=sess;
    if (r.date) {
      const d = (r.date||'').slice(0,10);
      if (!byDay[d]) byDay[d]={date:d,revenue:0,transactions:0};
      byDay[d].revenue+=rev; byDay[d].transactions+=tx;
    }
  });
  return {
    totalRevenue:totRev, totalTransactions:totTx, totalSessions:totSess, totalNewUsers:totNew,
    channels: Object.entries(ch).map(([name,v])=>({name,revenue:v.r,transactions:v.t,sessions:v.s})).sort((a,b)=>b.revenue-a.revenue),
    dailyTrend: Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))
  };
}

function aggregateFB(rows) {
  const camps={};
  let spend=0,clicks=0,impr=0,ctrSum=0,ctrN=0;
  (rows||[]).forEach(r=>{
    const n=r.campaign||'(sem nome)';
    if(!camps[n]) camps[n]={name:n,spend:0,clicks:0,impressions:0,ctr:0};
    camps[n].spend+=r.spend||0; camps[n].clicks+=r.clicks||0; camps[n].impressions+=r.impressions||0;
    spend+=r.spend||0; clicks+=r.clicks||0; impr+=r.impressions||0;
    if(r.ctr){ctrSum+=r.ctr;ctrN++;}
  });
  const campaigns=Object.values(camps).map(c=>({...c,ctr:c.clicks&&c.impressions?c.clicks/c.impressions:0,cpc:c.clicks?c.spend/c.clicks:0})).sort((a,b)=>b.spend-a.spend);
  return {totalSpend:spend,totalClicks:clicks,totalImpressions:impr,avgCTR:ctrN?ctrSum/ctrN:0,campaigns};
}

function aggregateGAds(rows) {
  const camps={};
  let spend=0,clicks=0,conv=0;
  (rows||[]).forEach(r=>{
    const n=r.campaign||'(sem nome)';
    if(!camps[n]) camps[n]={name:n,spend:0,clicks:0,conversions:0,cpcSum:0,cpcN:0};
    camps[n].spend+=r.spend||0; camps[n].clicks+=r.clicks||0; camps[n].conversions+=r.conversions||0;
    if(r.cpc){camps[n].cpcSum+=r.cpc;camps[n].cpcN++;}
    spend+=r.spend||0; clicks+=r.clicks||0; conv+=r.conversions||0;
  });
  return {totalSpend:spend,totalClicks:clicks,totalConversions:conv,
    campaigns:Object.values(camps).map(c=>({...c,cpc:c.cpcN?c.cpcSum/c.cpcN:0})).sort((a,b)=>b.spend-a.spend)};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET');
  const { date, period } = req.query;
  try {
    if (date) {
      const [fbR,gR] = await Promise.allSettled([
        fetchW('facebook',['campaign','spend','impressions','clicks','ctr','cpc','reach','frequency'],FB_ACC,{date_from:date,date_to:date}),
        fetchW('google_ads',['campaign','spend','impressions','clicks','ctr','cpc','conversions','cost_per_conversion'],GADS_ACC,{date_from:date,date_to:date})
      ]);
      const fb   = (fbR.status==='fulfilled' ? fbR.value : []).filter(r=>(r.spend||0)>0);
      const gads = (gR.status==='fulfilled'  ? gR.value : []).filter(r=>(r.spend||0)>0);
      res.status(200).json({ok:true,date,fb,gads});
    } else if (period) {
      const [fbR,gR,ga4R] = await Promise.allSettled([
        fetchW('facebook',['date','campaign','spend','impressions','clicks','ctr','cpc'],FB_ACC,{date_preset:period}),
        fetchW('google_ads',['date','campaign','spend','clicks','conversions','cpc'],GADS_ACC,{date_preset:period}),
        fetchW('googleanalytics4',['date','source','medium','sessions','transactions','totalrevenue','newusers'],GA4_ACC,{date_preset:period})
      ]);
      const fb   = fbR.status==='fulfilled'  ? aggregateFB(fbR.value)  : null;
      const gads = gR.status==='fulfilled'   ? aggregateGAds(gR.value) : null;
      const ga4  = ga4R.status==='fulfilled' ? aggregateGA4(ga4R.value): null;
      res.status(200).json({ok:true,period,fb,gads,ga4});
    } else {
      res.status(400).json({ok:false,error:'Parâmetro date ou period obrigatório'});
    }
  } catch(e) {
    res.status(500).json({ok:false,error:e.message});
  }
};
