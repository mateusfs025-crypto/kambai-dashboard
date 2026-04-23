const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const FB_ACC   = '2858329897589220';
const GADS_ACC = '159-714-9501';
const GA4_ACC  = '379550350';

async function askClaude(prompt) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: `You are a data analyst with Windsor.ai MCP access. Return ONLY valid JSON, no markdown, no explanation.`,
      messages: [{ role: 'user', content: prompt }],
      mcp_servers: [{ type: 'url', url: 'https://mcp.windsor.ai', name: 'windsor-mcp' }]
    })
  });
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Sem JSON na resposta: ' + text.slice(0,200));
  return JSON.parse(match[0]);
}

function aggregateGA4(rows) {
  const ch = { 'Facebook Ads':{r:0,t:0,s:0},'Google Ads':{r:0,t:0,s:0},
    'Instagram':{r:0,t:0,s:0},'Direto':{r:0,t:0,s:0},
    'Orgânico':{r:0,t:0,s:0},'Email':{r:0,t:0,s:0},'Outros':{r:0,t:0,s:0} };
  const byDay={};
  let totRev=0,totTx=0,totSess=0,totNew=0;
  (rows||[]).forEach(r=>{
    const src=(r.source||'').toLowerCase(),med=(r.medium||'').toLowerCase();
    const rev=r.totalrevenue||0,tx=r.transactions||0,sess=r.sessions||0,nu=r.newusers||0;
    totRev+=rev;totTx+=tx;totSess+=sess;totNew+=nu;
    let c;
    if(src==='facebook'&&(med==='cpc'||med==='dpa'))c='Facebook Ads';
    else if(src==='google'&&med==='cpc')c='Google Ads';
    else if(src.includes('instagram')||src.startsWith('ig'))c='Instagram';
    else if(src==='(direct)')c='Direto';
    else if(med==='organic')c='Orgânico';
    else if(src==='edrone'||med==='email')c='Email';
    else c='Outros';
    ch[c].r+=rev;ch[c].t+=tx;ch[c].s+=sess;
    if(r.date){const d=r.date.slice(0,10);if(!byDay[d])byDay[d]={date:d,revenue:0,transactions:0};byDay[d].revenue+=rev;byDay[d].transactions+=tx;}
  });
  return {
    totalRevenue:totRev,totalTransactions:totTx,totalSessions:totSess,totalNewUsers:totNew,
    channels:Object.entries(ch).map(([name,v])=>({name,revenue:v.r,transactions:v.t,sessions:v.s})).sort((a,b)=>b.revenue-a.revenue),
    dailyTrend:Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))
  };
}

function aggregateFB(rows) {
  const camps={};let spend=0,clicks=0,reach=0;
  (rows||[]).filter(r=>(r.spend||0)>0).forEach(r=>{
    const n=r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,impressions:0,ctr:0,cpc:0};
    camps[n].spend+=r.spend||0;camps[n].clicks+=r.clicks||0;camps[n].impressions+=r.impressions||0;
    camps[n].ctr=r.ctr||0;camps[n].cpc=r.cpc||0;
    spend+=r.spend||0;clicks+=r.clicks||0;reach+=r.reach||0;
  });
  return {totalSpend:spend,totalClicks:clicks,totalReach:reach,
    campaigns:Object.values(camps).sort((a,b)=>b.spend-a.spend)};
}

function aggregateGAds(rows) {
  const camps={};let spend=0,clicks=0,conv=0;
  (rows||[]).filter(r=>(r.spend||0)>0).forEach(r=>{
    const n=r.campaign||'?';
    if(!camps[n])camps[n]={name:n,spend:0,clicks:0,conversions:0,cpc:0};
    camps[n].spend+=r.spend||0;camps[n].clicks+=r.clicks||0;camps[n].conversions+=r.conversions||0;camps[n].cpc=r.cpc||0;
    spend+=r.spend||0;clicks+=r.clicks||0;conv+=r.conversions||0;
  });
  return {totalSpend:spend,totalClicks:clicks,totalConversions:conv,
    campaigns:Object.values(camps).sort((a,b)=>b.spend-a.spend)};
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  const { date, period } = req.query;

  try {
    if (date) {
      const result = await askClaude(`Fetch Windsor.ai data for date ${date}.
Use these MCP calls:
1. connector="facebook" account="${FB_ACC}" fields=["campaign","spend","clicks","impressions","ctr","cpc","reach","frequency"] date_from="${date}" date_to="${date}"
2. connector="google_ads" account="${GADS_ACC}" fields=["campaign","spend","clicks","ctr","cpc","conversions"] date_from="${date}" date_to="${date}"

Return ONLY this JSON:
{"fb_rows":[{"campaign":"","spend":0,"clicks":0,"impressions":0,"ctr":0,"cpc":0,"reach":0}],"gads_rows":[{"campaign":"","spend":0,"clicks":0,"conversions":0,"cpc":0}]}`);

      return res.end(JSON.stringify({ok:true, date,
        fb:   aggregateFB(result.fb_rows||[]),
        gads: aggregateGAds(result.gads_rows||[])
      }));

    } else if (period) {
      const result = await askClaude(`Fetch Windsor.ai data for period "${period}".
Use these MCP calls:
1. connector="facebook" account="${FB_ACC}" fields=["date","campaign","spend","clicks","impressions","ctr","cpc"] date_preset="${period}"
2. connector="google_ads" account="${GADS_ACC}" fields=["date","campaign","spend","clicks","conversions","cpc"] date_preset="${period}"
3. connector="googleanalytics4" account="${GA4_ACC}" fields=["date","source","medium","sessions","transactions","totalrevenue","newusers"] date_preset="${period}"

Return ONLY this JSON:
{"fb_rows":[{"date":"","campaign":"","spend":0,"clicks":0,"ctr":0,"cpc":0}],"gads_rows":[{"date":"","campaign":"","spend":0,"clicks":0,"conversions":0,"cpc":0}],"ga4_rows":[{"date":"","source":"","medium":"","sessions":0,"transactions":0,"totalrevenue":0,"newusers":0}]}`);

      return res.end(JSON.stringify({ok:true, period,
        fb:   aggregateFB(result.fb_rows||[]),
        gads: aggregateGAds(result.gads_rows||[]),
        ga4:  aggregateGA4(result.ga4_rows||[])
      }));

    } else {
      return res.status(400).end(JSON.stringify({ok:false,error:'Faltou date ou period'}));
    }
  } catch(e) {
    return res.status(500).end(JSON.stringify({ok:false,error:e.message}));
  }
};
