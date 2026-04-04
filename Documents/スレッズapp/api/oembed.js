export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url が必要です' });

  try {
    const oembedUrl = `https://www.threads.net/api/oembed/?url=${encodeURIComponent(url)}&omit_script=true`;
    const r = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThreadsGenerator/1.0)' }
    });
    if (!r.ok) throw new Error(`oEmbed失敗: ${r.status}`);
    const data = await r.json();

    // HTMLからテキストを抽出
    let text = (data.html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    res.status(200).json({
      text,
      author: data.author_name || '',
      authorUrl: data.author_url || ''
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
