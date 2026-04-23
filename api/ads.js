const KEY      = 'af49eacb41a92fa489a714e8dd18c47d8114';
const FB_ACC   = '2858329897589220';
const GADS_ACC = '159-714-9501';
const GA4_ACC  = '379550350';
const BASE     = 'https://connectors.windsor.ai';

async function get(connector, fields, account, extra) {
  const p = new URLSearchParams({ api_key: KEY, fields: fields.join(',') });
  p.append('accounts[]', account);
  Object.entries(extra).forEach(([k,v]) => p.set(k,v));
  const r = await fetch(`${BASE}/${connector}?${p}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.data || []);
}

function sumFB(rows) {
  const camps={};let spend=0,clicks=0,reach=0;
  (rows||[]).filter(r=>(r.spend||0)>0).forEach(r=>{
    const n=r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,ctr:0,cpc:0};
    camps[n].spend+=r.spend||0;camps[n].clicks+=r.clicks||0;
    camps[n].ctr=r.ctr||0;camps[n].cpc=r.cpc||0;
    spend+=r.spend||0;clicks+=r.clicks||0;reach+=r.reach||0;
  });
  return {totalSpend:spend,totalClicks:clicks,totalReach:reach,
    campaigns:Object.values(camps).sort((a,b)=>b.spend-a.spend)};
}

function sumG(rows) {
  const camps={};let spend=0,clicks=0,conv=0;
  (rows||[]).filter(r=>(r.spend||0)>0).forEach(r=>{
    const n=r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,conversions:0,cpc:0};
    camps[n].spend+=r.spend||0;camps[n].clicks+=r.clicks||0;
    camps[n].conversions+=r.conversions||0;camps[n].cpc=r.cpc||0;
    spend+=r.spend||0;clicks+=r.clicks||0;conv+=r.conversions||0;
  });
  return {totalSpend:spend,totalClicks:clicks,totalConversions:conv,
    campaigns:Object.values(camps).sort((a,b)=>b.spend-a.spend)};
}

function sumGA4(rows) {
  const ch={},byDay={};
  let rev=0,tx=0,sess=0,newu=0;
  (rows||[]).forEach(r=>{
    const src=(r.source||'').toLowerCase(),med=(r.medium||'').toLowerCase();
    let c='Outros';
    if(src==='facebook'&&(med==='cpc'||med==='dpa'))c='Facebook Ads';
    else if(src==='google'&&med==='cpc')c='Google Ads';
    else if(src.includes('instagram')||src.startsWith('ig'))c='Instagram';
    else if(src==='(direct)')c='Direto';
    else if(med==='organic')c='Orgânico';
    else if(src==='edrone'||med==='email')c='Email';
    if(!ch[c])ch[c]={name:c,revenue:0,transactions:0,sessions:0};
    ch[c].revenue+=r.totalrevenue||0;ch[c].transactions+=r.transactions||0;ch[c].sessions+=r.sessions||0;
    rev+=r.totalrevenue||0;tx+=r.transactions||0;sess+=r.sessions||0;newu+=r.newusers||0;
    if(r.date){const d=r.date.slice(0,10);if(!byDay[d])byDay[d]={date:d,revenue:0,transactions:0};byDay[d].revenue+=r.totalrevenue||0;byDay[d].transactions+=r.transactions||0;}
  });
  return {totalRevenue:rev,totalTransactions:tx,totalSessions:sess,totalNewUsers:newu,
    channels:Object.values(ch).sort((a,b)=>b.revenue-a.revenue),
    dailyTrend:Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))};
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  const { date, period } = req.query;
  try {
    if (date) {
      const [fbR,gR] = await Promise.allSettled([
        get('facebook',  ['campaign','spend','clicks','impressions','ctr','cpc','reach'],FB_ACC,  {date_from:date,date_to:date}),
        get('google_ads',['campaign','spend','clicks','ctr','cpc','conversions'],        GADS_ACC, {date_from:date,date_to:date})
      ]);
      return res.end(JSON.stringify({ok:true,date,
        fb:   sumFB(fbR.status==='fulfilled'?fbR.value:[]),
        gads: sumG(gR.status==='fulfilled'?gR.value:[])
      }));
    } else if (period) {
      const [fbR,gR,ga4R] = await Promise.allSettled([
        get('facebook',        ['date','campaign','spend','clicks','impressions','ctr','cpc'],          FB_ACC,  {date_preset:period}),
        get('google_ads',      ['date','campaign','spend','clicks','conversions','cpc'],                GADS_ACC,{date_preset:period}),
        get('googleanalytics4',['date','source','medium','sessions','transactions','totalrevenue','newusers'],GA4_ACC,{date_preset:period})
      ]);
      return res.end(JSON.stringify({ok:true,period,
        fb:   fbR.status==='fulfilled'?sumFB(fbR.value):null,
        gads: gR.status==='fulfilled'?sumG(gR.value):null,
        ga4:  ga4R.status==='fulfilled'?sumGA4(ga4R.value):null
      }));
    } else {
      return res.status(400).end(JSON.stringify({ok:false,error:'Faltou date ou period'}));
    }
  } catch(e) {
    return res.status(500).end(JSON.stringify({ok:false,error:e.message}));
  }
};
