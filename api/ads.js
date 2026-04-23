const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const WINDSOR_KEY    = 'af49eacb41a92fa489a714e8dd18c47d8114';
const FB_ACC         = '2858329897589220';
const GADS_ACC       = '159-714-9501';
const GA4_ACC        = '379550350';

async function askWindsor(prompt) {
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
      system: `You are a data analyst. Use Windsor.ai MCP tools to fetch data and return ONLY valid JSON. No markdown, no explanation, just the JSON object.`,
      messages: [{ role: 'user', content: prompt }],
      mcp_servers: [{
        type: 'url',
        url: 'https://mcp.windsor.ai',
        name: 'windsor-mcp',
        authorization_token: WINDSOR_KEY
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0,200)}`);
  }

  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Sem JSON: ' + text.slice(0,300));
  return JSON.parse(match[0]);
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
      const result = await askWindsor(
        `Use Windsor.ai MCP to fetch data for date ${date}.
Call get_data twice:
1. connector="facebook" accounts=["${FB_ACC}"] date_from="${date}" date_to="${date}" fields=["campaign","spend","clicks","impressions","ctr","cpc","reach","frequency"]
2. connector="google_ads" accounts=["${GADS_ACC}"] date_from="${date}" date_to="${date}" fields=["campaign","spend","clicks","ctr","cpc","conversions"]

Return ONLY:
{"fb_rows":[{"campaign":"","spend":0,"clicks":0,"impressions":0,"ctr":0,"cpc":0,"reach":0}],"gads_rows":[{"campaign":"","spend":0,"clicks":0,"conversions":0,"cpc":0}]}`
      );
      return res.end(JSON.stringify({ok:true, date,
        fb:   sumFB(result.fb_rows||[]),
        gads: sumG(result.gads_rows||[])
      }));

    } else if (period) {
      const result = await askWindsor(
        `Use Windsor.ai MCP to fetch data for period "${period}".
Call get_data three times:
1. connector="facebook" accounts=["${FB_ACC}"] date_preset="${period}" fields=["date","campaign","spend","clicks","impressions","ctr","cpc"]
2. connector="google_ads" accounts=["${GADS_ACC}"] date_preset="${period}" fields=["date","campaign","spend","clicks","conversions","cpc"]
3. connector="googleanalytics4" accounts=["${GA4_ACC}"] date_preset="${period}" fields=["date","source","medium","sessions","transactions","totalrevenue","newusers"]

Return ONLY:
{"fb_rows":[{"date":"","campaign":"","spend":0,"clicks":0,"ctr":0,"cpc":0}],"gads_rows":[{"date":"","campaign":"","spend":0,"clicks":0,"conversions":0,"cpc":0}],"ga4_rows":[{"date":"","source":"","medium":"","sessions":0,"transactions":0,"totalrevenue":0,"newusers":0}]}`
      );
      return res.end(JSON.stringify({ok:true, period,
        fb:   sumFB(result.fb_rows||[]),
        gads: sumG(result.gads_rows||[]),
        ga4:  sumGA4(result.ga4_rows||[])
      }));

    } else {
      return res.status(400).end(JSON.stringify({ok:false,error:'Faltou date ou period'}));
    }
  } catch(e) {
    return res.status(500).end(JSON.stringify({ok:false,error:e.message}));
  }
};
