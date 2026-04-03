// ThreadsのショートコードからIDに変換（Instagram/Threads共通フォーマット）
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

  const token = process.env.THREADS_TOKEN;
  if (!token) return res.status(500).json({ error: 'THREADS_TOKEN が設定されていません' });

  const { accounts, since, until } = req.query;
  if (!accounts) return res.status(400).json({ error: 'accounts パラメータが必要です' });

  // accounts形式: "username" または "username:shortcode"
  const accountList = accounts.split(',').map(a => {
    const [username, shortcode] = a.trim().split(':');
    return { username, shortcode };
  }).filter(a => a.username);

  const allPosts = [];
  const errors = [];

  for (const account of accountList) {
    const { username, shortcode } = account;
    let userId = null;

    // 1. 数字ならそのままユーザーIDとして使う
    if (/^\d+$/.test(username)) {
      userId = username;
    }

    // 2. 投稿URLのショートコードからユーザーIDを取得
    if (!userId && shortcode) {
      try {
        const postId = shortcodeToId(shortcode);
        const r = await fetch(`https://graph.threads.net/v1.0/${postId}?fields=id,owner&access_token=${token}`);
        const d = await r.json();
        if (d.owner && d.owner.id) userId = d.owner.id;
      } catch (_) {}
    }

    // 3. @username 形式で直接アクセス
    if (!userId) {
      try {
        const r = await fetch(`https://graph.threads.net/v1.0/@${username}?fields=id&access_token=${token}`);
        const d = await r.json();
        if (d.id) userId = d.id;
      } catch (_) {}
    }

    // 4. username をそのまま試す
    if (!userId) {
      try {
        const r = await fetch(`https://graph.threads.net/v1.0/${username}?fields=id&access_token=${token}`);
        const d = await r.json();
        if (d.id) userId = d.id;
      } catch (_) {}
    }

    if (!userId) {
      errors.push(`@${username}: ユーザーIDの取得に失敗しました`);
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
        allPosts.push(...d.data.map(p => ({ ...p, username: p.username || username })));
      } else if (d.error) {
        errors.push(`@${username}: ${d.error.message}`);
      } else {
        errors.push(`@${username}: 指定期間内に投稿が見つかりませんでした`);
      }
    } catch (e) {
      errors.push(`@${username}: ${e.message}`);
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
