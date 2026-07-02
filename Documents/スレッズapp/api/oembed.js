function shortcodeToId(shortcode) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0);
  for (const char of shortcode) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    id = id * BigInt(64) + BigInt(idx);
  }
  return id.toString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url が必要です' });

  const token = process.env.THREADS_TOKEN;
  if (!token) return res.status(500).json({ error: 'THREADS_TOKEN が未設定です' });

  // URLからショートコードを抽出
  const match = url.match(/threads\.net\/@[^/]+\/post\/([A-Za-z0-9_-]+)/);
  if (!match) return res.status(400).json({ error: 'Threads投稿のURLを入力してください（例: https://www.threads.net/@username/post/XXXXX）' });

  const shortcode = match[1];
  const postId = shortcodeToId(shortcode);

  try {
    const apiUrl = `https://graph.threads.net/v1.0/${postId}?fields=id,text,username,timestamp&access_token=${token}`;
    const r = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.text) throw new Error('テキストが取得できませんでした');

    res.status(200).json({
      text: data.text,
      username: data.username || '',
      timestamp: data.timestamp || ''
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
