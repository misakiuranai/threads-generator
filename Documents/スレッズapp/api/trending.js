export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.THREADS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'THREADS_TOKEN が設定されていません' });
  }

  const keywords = ['占い', '開運', '金運', '星座', '運勢'];
  const allPosts = [];

  // キーワード検索（threads_keyword_search スコープが必要）
  for (const kw of keywords) {
    try {
      const url = `https://graph.threads.net/v1.0/search?q=${encodeURIComponent(kw)}&type=THREADS&fields=id,text,timestamp,username,permalink,like_count,replies_count&limit=10&access_token=${token}`;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (d.data && d.data.length > 0) {
          allPosts.push(...d.data.map(p => ({ ...p, keyword: kw })));
        }
      }
    } catch (_) {}
  }

  // 検索結果がない場合はユーザー自身の投稿にフォールバック
  if (allPosts.length === 0) {
    try {
      const url = `https://graph.threads.net/v1.0/me/threads?fields=id,text,timestamp,permalink,like_count,replies_count&limit=25&access_token=${token}`;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (d.data) allPosts.push(...d.data.map(p => ({ ...p, source: 'own' })));
      }
    } catch (_) {}
  }

  // 重複除去・ソート（like_count順、なければ新着順）
  const unique = [...new Map(allPosts.map(p => [p.id, p])).values()]
    .filter(p => p.text && p.text.length > 10)
    .sort((a, b) => {
      const la = a.like_count || 0;
      const lb = b.like_count || 0;
      if (la !== lb) return lb - la;
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    })
    .slice(0, 20);

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json({ posts: unique, total: unique.length });
}
