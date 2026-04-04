function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function cleanHtml(html) {
  return html
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function parseRSS(xml, username, since, until) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = cleanHtml(extractTag(item, 'title'));
    const desc = cleanHtml(extractTag(item, 'description'));
    const pubDate = extractTag(item, 'pubDate');
    const link = extractTag(item, 'link');
    const text = desc.length > title.length ? desc : title;
    if (!text || text.length < 5) continue;

    const ts = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0;
    if (since && ts < parseInt(since)) continue;
    if (until && ts > parseInt(until)) continue;

    items.push({
      id: link || `${username}-${ts}`,
      text,
      timestamp: pubDate ? new Date(pubDate).toISOString() : '',
      permalink: link || '',
      username,
      like_count: null,
      replies_count: null,
      source: 'rss'
    });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { accounts, since, until } = req.query;
  if (!accounts) return res.status(400).json({ error: 'accounts パラメータが必要です' });

  const accountList = accounts.split(',').map(a => {
    const username = a.trim().split(':')[0].replace(/^@/, '');
    return username;
  }).filter(Boolean);

  const allPosts = [];
  const errors = [];

  for (const username of accountList) {
    let fetched = false;

    // RSSHub経由でThreads公開投稿を取得
    const rssHosts = [
      `https://rsshub.app/threads/user/${username}`,
      `https://rss.shab.fun/threads/user/${username}`
    ];

    for (const rssUrl of rssHosts) {
      try {
        const r = await fetch(rssUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThreadsGenerator/1.0)' },
          signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) continue;
        const xml = await r.text();
        if (!xml.includes('<item>')) continue;
        const items = parseRSS(xml, username, since, until);
        if (items.length > 0) {
          allPosts.push(...items);
          fetched = true;
          break;
        }
      } catch (_) {}
    }

    if (!fetched) {
      errors.push(`@${username}: 投稿の取得に失敗しました（非公開アカウントか取得できない場合があります）`);
    }
  }

  // 新着順でソート（いいね数がない場合）
  const sorted = allPosts
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 30);

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  res.status(200).json({ posts: sorted, total: sorted.length, errors });
}
