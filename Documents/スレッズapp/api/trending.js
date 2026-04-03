export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.THREADS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'THREADS_TOKEN が設定されていません' });
  }

  const allPosts = [];
  const errors = [];

  // 1. ユーザー自身の投稿を取得
  try {
    const url = `https://graph.threads.net/v1.0/me/threads?fields=id,text,timestamp,permalink,like_count,replies_count&limit=25&access_token=${token}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.data && d.data.length > 0) {
      allPosts.push(...d.data.map(p => ({ ...p, source: 'own' })));
    } else if (d.error) {
      errors.push(`me/threads: ${d.error.message}`);
    }
  } catch (e) {
    errors.push(`me/threads exception: ${e.message}`);
  }

  // 2. キーワード検索も試みる（threads_keyword_search スコープが必要）
  const keywords = ['占い', '開運', '金運', '星座'];
  for (const kw of keywords) {
    try {
      const url = `https://graph.threads.net/v1.0/search?q=${encodeURIComponent(kw)}&type=THREADS&fields=id,text,timestamp,username,permalink,like_count,replies_count&limit=10&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.data && d.data.length > 0) {
        allPosts.push(...d.data.map(p => ({ ...p, keyword: kw })));
      }
    } catch (_) {}
  }

  // 重複除去・ソート
  const unique = [...new Map(allPosts.map(p => [p.id, p])).values()]
    .sort((a, b) => {
      const la = a.like_count || 0;
      const lb = b.like_count || 0;
      if (la !== lb) return lb - la;
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    })
    .slice(0, 20);

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).json({ posts: unique, total: unique.length, errors });
}
