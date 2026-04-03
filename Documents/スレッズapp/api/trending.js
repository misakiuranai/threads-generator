export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.THREADS_TOKEN;
  if (!token) return res.status(500).json({ error: 'THREADS_TOKEN が設定されていません' });

  const { accounts, since, until } = req.query;
  if (!accounts) return res.status(400).json({ error: 'accounts パラメータが必要です' });

  const accountList = accounts.split(',').map(a => a.trim()).filter(Boolean);
  const allPosts = [];
  const errors = [];

  for (const account of accountList) {
    let userId = null;

    // 数字ならそのままユーザーIDとして使う
    if (/^\d+$/.test(account)) {
      userId = account;
    } else {
      // 方法1: @username 形式で直接アクセス
      try {
        const r1 = await fetch(`https://graph.threads.net/v1.0/@${account}?fields=id,username&access_token=${token}`);
        const d1 = await r1.json();
        if (d1.id) { userId = d1.id; }
      } catch (_) {}

      // 方法2: username をそのまま ID として試す
      if (!userId) {
        try {
          const r2 = await fetch(`https://graph.threads.net/v1.0/${account}?fields=id,username&access_token=${token}`);
          const d2 = await r2.json();
          if (d2.id) { userId = d2.id; }
        } catch (_) {}
      }
    }

    if (!userId) {
      errors.push(`@${account}: ユーザーIDが取得できませんでした。数字のIDを直接入力してください`);
      continue;
    }

    // 投稿を取得（期間フィルター付き）
    try {
      let url = `https://graph.threads.net/v1.0/${userId}/threads?fields=id,text,timestamp,permalink,like_count,replies_count,username&limit=50&access_token=${token}`;
      if (since) url += `&since=${since}`;
      if (until) url += `&until=${until}`;

      const r = await fetch(url);
      const d = await r.json();
      if (d.data && d.data.length > 0) {
        allPosts.push(...d.data.map(p => ({ ...p, username: p.username || account })));
      } else if (d.error) {
        errors.push(`@${account}: ${d.error.message}`);
      } else {
        errors.push(`@${account}: 指定期間内に投稿が見つかりませんでした`);
      }
    } catch (e) {
      errors.push(`@${account}: ${e.message}`);
    }
  }

  // いいね順にソート
  const sorted = allPosts
    .filter(p => p.text && p.text.length > 0)
    .sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
    .slice(0, 30);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ posts: sorted, total: sorted.length, errors });
}
