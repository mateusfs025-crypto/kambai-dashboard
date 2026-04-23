export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { connector, fields, date_from, date_to, account } = req.query;
  const API_KEY = 'af49eacb41a92fa489a714e8dd18c47d8114';

  if (!connector || !fields) {
    return res.status(400).json({ error: 'connector e fields são obrigatórios' });
  }

  try {
    const params = new URLSearchParams({
      api_key: API_KEY,
      fields: fields,
    });
    if (date_from) params.set('date_from', date_from);
    if (date_to)   params.set('date_to',   date_to);
    if (account)   params.append('accounts[]', account);

    const upstream = await fetch(
      `https://connectors.windsor.ai/${connector}?${params}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Windsor: ${upstream.status}` });
    }

    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
