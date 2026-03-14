const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';

// Pillar → concrete visual search queries (from v4.1 Section 17C)
const PILLAR_VISUALS = {
  gym: ['person lifting weights gym morning', 'empty barbell rack sunrise', 'athlete training alone'],
  discipline: ['morning routine desk notebook coffee', 'person writing alone minimal desk', 'person focused work alone'],
  consistency: ['daily habit tracker notebook filled', 'running shoes morning road', 'calendar checkmarks routine'],
  sacrifice: ['athlete training alone late night', 'empty room late night desk', 'person exhausted after workout'],
  pain: ['person exhausted after workout floor', 'runner pushing through fatigue', 'sweat hard work training'],
  motivation: ['person looking at horizon sunrise', 'before after fitness progress', 'person standing mountain top'],
  life: ['person alone window city night', 'crossroads path choice', 'person walking alone street'],
  problems: ['person standing rain determined', 'storm clouds clearing sky', 'cracked road still standing'],
  dreams: ['person looking at horizon city rooftop', 'night sky stars person', 'open road sunrise journey'],
  yolo: ['person laughing candid outdoor', 'jumping cliff water adventure', 'spontaneous road trip friends'],
};

function getSearchQuery(pillars) {
  for (const pillar of pillars) {
    const queries = PILLAR_VISUALS[pillar];
    if (queries) {
      return queries[Math.floor(Math.random() * queries.length)];
    }
  }
  return 'person determined focused real photo';
}

async function searchWikimedia(query) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srnamespace: '6',
    srsearch: query,
    srqiprofile: 'popular_inclinks',
    format: 'json',
    srlimit: '5',
  });

  const res = await fetch(`${WIKIMEDIA_API}?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const titles = (data.query?.search || []).map((r) => r.title);
  if (titles.length === 0) return [];

  // Get image info for each result
  const infoParams = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    format: 'json',
  });

  const infoRes = await fetch(`${WIKIMEDIA_API}?${infoParams}`);
  if (!infoRes.ok) return [];

  const infoData = await infoRes.json();
  const pages = Object.values(infoData.query?.pages || {});

  return pages
    .filter((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return false;
      const isImage = info.mime === 'image/jpeg' || info.mime === 'image/png';
      const isLargeEnough = info.width >= 800;
      return isImage && isLargeEnough;
    })
    .map((p) => {
      const info = p.imageinfo[0];
      return {
        url: info.url,
        mime: info.mime,
        width: info.width,
        height: info.height,
        title: p.title.replace('File:', ''),
      };
    });
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

export async function fetchImageForPost(post) {
  const query = getSearchQuery(post.pillar || []);
  console.log(`  Image search: "${query}"`);

  const candidates = await searchWikimedia(query);
  if (candidates.length === 0) {
    console.log('  No suitable images found, posting text-only.');
    return null;
  }

  // Pick the first viable candidate
  const picked = candidates[0];
  console.log(`  Found: ${picked.title} (${picked.width}x${picked.height})`);

  const buffer = await downloadImage(picked.url);
  if (!buffer) {
    console.log('  Image download failed, posting text-only.');
    return null;
  }

  return {
    buffer,
    mimeType: picked.mime,
    attribution: picked.title,
    url: picked.url,
    searchQuery: query,
  };
}
