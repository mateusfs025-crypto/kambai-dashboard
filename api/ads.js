const KEY      = 'af49eacb41a92fa489a714e8dd18c47d8114';
const GADS_ACC = '159-714-9501';
const GA4_ACC  = '379550350';
const FB_ACC   = '2858329897589220';
const BASE     = 'https://connectors.windsor.ai';
const META_BASE = 'https://graph.facebook.com/v19.0';

async function fetchMeta(date) {
  const token = process.env.METATOKEN;
  const fields = 'campaign_name,spend,clicks,impressions,ctr,cpc,cpm,reach,frequency,purchase_roas';
  const url = `${META_BASE}/act_${FB_ACC}/insights?fields=${fields}&time_range={"since":"${date}","until":"${date}"}&level=campaign&limit=100&access_token=${token}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error('Meta API: ' + d.error.message);
  return (d.data || []);
}

async function fetchMetaPeriod(dateFrom, dateTo) {
  const token = process.env.METATOKEN;
  const fields = 'campaign_name,spend,clicks,impressions,ctr,cpc,cpm,reach,frequency,purchase_roas';
  const url = `${META_BASE}/act_${FB_ACC}/insights?fields=${fields}&time_range={"since":"${dateFrom}","until":"${dateTo}"}&level=campaign&limit=100&access_token=${token}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error('Meta API: ' + d.error.message);
  return (d.data || []);
}

async function get(connector, fields, account, extra) {
  const p = new URLSearchParams({ api_key: KEY, fields: fields.join(',') });
  p.append('accounts[]', account);
  Object.entries(extra).forEach(([k,v]) => p.set(k,v));
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch(`${BASE}/${connector}?${p}`, { signal: ctrl.signal });
  const d = await r.json();
  return Array.isArray(d) ? d : (d.data || []);
}

function extractMetaRoas(v) {
  if (!v || !Array.isArray(v)) return null;
  const item = v.find(r => r.action_type === 'omni_purchase');
  return item ? parseFloat(item.value) : null;
}

function sumFB(rows) {
  const camps={};let spend=0,clicks=0,reach=0,impr=0;
  (rows||[]).filter(r=>(parseFloat(r.spend)||0)>0).forEach(r=>{
    const n=r.campaign_name||r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,ctr:0,cpc:0,cpm:0,reach:0,frequency:0,roas:null};
    camps[n].spend+=parseFloat(r.spend)||0;camps[n].clicks+=parseFloat(r.clicks)||0;
    camps[n].ctr=parseFloat(r.ctr)||0;camps[n].cpc=parseFloat(r.cpc)||0;
    camps[n].cpm=parseFloat(r.cpm)||0;camps[n].reach+=parseFloat(r.reach)||0;
    camps[n].frequency=parseFloat(r.frequency)||0;
    camps[n].roas=extractMetaRoas(r.purchase_roas);
    spend+=parseFloat(r.spend)||0;clicks+=parseFloat(r.clicks)||0;
    reach+=parseFloat(r.reach)||0;impr+=parseFloat(r.impressions)||0;
  });
  const fbRoasAvg=Object.values(camps).filter(c=>c.roas).length
    ?Object.values(camps).filter(c=>c.roas).reduce((s,c)=>s+c.roas,0)/Object.values(camps).filter(c=>c.roas).length:null;
  return {totalSpend:spend,totalClicks:clicks,totalReach:reach,totalImpressions:impr,avgRoas:fbRoasAvg,
    campaigns:Object.values(camps).sort((a,b)=>b.spend-a.spend)};
}

function sumG(rows) {
  const camps={};let spend=0,clicks=0,conv=0,convVal=0;
  (rows||[]).filter(r=>(parseFloat(r.spend)||0)>0).forEach(r=>{
    const n=r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,conversions:0,conversionValue:0,cpc:0,roas:null};
    camps[n].spend+=parseFloat(r.spend)||0;camps[n].clicks+=parseFloat(r.clicks)||0;
    camps[n].conversions+=parseFloat(r.conversions)||0;
    camps[n].conversionValue+=parseFloat(r.conversion_value)||0;
    camps[n].cpc=parseFloat(r.cpc)||0;
    spend+=parseFloat(r.spend)||0;clicks+=parseFloat(r.clicks)||0;
    conv+=parseFloat(r.conversions)||0;convVal+=parseFloat(r.conversion_value)||0;
  });
  const totalRoas=spend>0&&convVal>0?convVal/spend:null;
  return {totalSpend:spend,totalClicks:clicks,totalConversions:conv,totalConversionValue:convVal,totalRoas,
    campaigns:Object.values(camps).map(c=>({...c,roas:c.conversionValue>0&&c.spend>0?c.conversionValue/c.spend:null})).sort((a,b)=>b.spend-a.spend)};
}

function sumGA4(rows) {
  const ch={},byDay={};let rev=0,tx=0,sess=0,newu=0;
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
    ch[c].revenue+=parseFloat(r.totalrevenue)||0;ch[c].transactions+=parseFloat(r.transactions)||0;ch[c].sessions+=parseFloat(r.sessions)||0;
    rev+=parseFloat(r.totalrevenue)||0;tx+=parseFloat(r.transactions)||0;sess+=parseFloat(r.sessions)||0;newu+=parseFloat(r.newusers)||0;
    if(r.date){const d=r.date.slice(0,10);if(!byDay[d])byDay[d]={date:d,revenue:0,transactions:0};byDay[d].revenue+=parseFloat(r.totalrevenue)||0;byDay[d].transactions+=parseFloat(r.transactions)||0;}
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
      const [metaR, gR] = await Promise.allSettled([
        fetchMeta(date),
        get('google_ads',['date','campaign','spend','clicks','ctr','cpc','conversions','conversion_value','roas'],GADS_ACC,{date_preset:'last_3dT'})
      ]);
      const metaRows = metaR.status==='fulfilled' ? metaR.value : [];
      const gAll     = gR.status==='fulfilled'    ? gR.value   : [];
      const todayG   = gAll.filter(r=>(r.date||'').slice(0,10)===date&&(parseFloat(r.spend)||0)>0);

      return res.end(JSON.stringify({ok:true, date,
        fb:   sumFB(metaRows),
        gads: sumG(todayG.length ? todayG : gAll)
      }));

    } else if (period) {
      const days = period==='last_7d' ? 7 : 30;
      const dateTo   = new Date(); dateTo.setDate(dateTo.getDate()-1);
      const dateFrom = new Date(); dateFrom.setDate(dateFrom.getDate()-days);
      const fmt = d => d.toISOString().slice(0,10);

      const [metaR, gR, ga4R] = await Promise.allSettled([
        fetchMetaPeriod(fmt(dateFrom), fmt(dateTo)),
        get('google_ads',      ['date','campaign','spend','clicks','ctr','cpc','conversions','conversion_value','roas'],GADS_ACC,{date_preset:period}),
        get('googleanalytics4',['date','source','medium','sessions','transactions','totalrevenue','newusers'],          GA4_ACC, {date_preset:period})
      ]);

      return res.end(JSON.stringify({ok:true, period,
        fb:   metaR.status==='fulfilled'  ? sumFB(metaR.value)  : null,
        gads: gR.status==='fulfilled'     ? sumG(gR.value)      : null,
        ga4:  ga4R.status==='fulfilled'   ? sumGA4(ga4R.value)  : null
      }));

    } else {
      return res.status(400).end(JSON.stringify({ok:false,error:'Faltou date ou period'}));
    }
  } catch(e) {
    return res.status(500).end(JSON.stringify({ok:false,error:e.message}));
  }
};
