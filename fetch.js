// Prépare la page du jour : data/AAAA-MM-JJ.json + data/index.json
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, 'data');
const key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const seed = Math.floor(new Date(key).getTime() / 864e5);
const UA = { 'User-Agent': 'journal-design/1.0 (projet personnel)' };
const get = async (u, t = 'json') => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + u); return t === 'json' ? r.json() : r.text(); };
const safe = async (name, fn) => { try { return await fn(); } catch (e) { console.log('Échec', name, e.message); return []; } };

const THEMES = [['architecture', 'Architecture'], ['furniture', 'Design · Mobilier'], ['ceramic', 'Métiers d\u2019art · Céramique'], ['glass', 'Métiers d\u2019art · Verre'], ['textile', 'Métiers d\u2019art · Textile'], ['poster', 'Graphisme'], ['metalwork', 'Métiers d\u2019art · Métal'], ['drawing architecture', 'Architecture · Dessin'], ['jewelry', 'Objets · Bijou'], ['woodwork', 'Métiers d\u2019art · Bois']];

async function wikiSummary(name) {
  for (const l of ['fr', 'en']) {
    try {
      const s = await get(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`);
      if (s.type === 'standard' && s.extract) return { text: s.extract, link: s.content_urls.desktop.page, lang: l };
    } catch (e) {}
  }
  return null;
}

async function met() {
  const [q, label] = THEMES[seed % THEMES.length];
  const s = await get(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(q)}`);
  const ids = s.objectIDs || [];
  if (!ids.length) return [];
  for (let t = 0; t < 10; t++) {
    const o = await get(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[(seed * 7919 + t * 131) % ids.length]}`);
    if (!o.primaryImageSmall || !o.title) continue;
    const who = o.artistDisplayName || o.culture || '';
    const w = o.artistDisplayName ? await wikiSummary(o.artistDisplayName) : null;
    return [{ type: 'oeuvre', kicker: label, title: o.title, creator: who, year: o.objectDate || '', medium: o.medium || '', image: o.primaryImageSmall, link: o.objectURL, credit: 'The Metropolitan Museum of Art (domaine public)', extract: w && w.text, extractLink: w && w.link, extractSrc: w && 'Wikipédia (' + w.lang + ')' }];
  }
  return [];
}

const clean = h => h.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '\u2019').replace(/&#8230;/g, '…').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? clean(m[1]) : ''; };
const FEEDS = [['Dezeen', 'https://www.dezeen.com/feed/'], ['Designboom', 'https://www.designboom.com/feed/'], ['ArchDaily', 'https://www.archdaily.com/feed']];

function seenLinks() {
  const out = new Set();
  try { for (const d of JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'))).slice(-10)) for (const c of JSON.parse(fs.readFileSync(path.join(DATA, d + '.json'))).cards) if (c.link) out.add(c.link); } catch (e) {}
  return out;
}
async function rss() {
  const seen = seenLinks(), out = [];
  for (const [name, url] of FEEDS) {
    try {
      const xml = await get(url, 'text');
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
      for (const it of items) {
        const link = tag(it, 'link');
        if (!link || seen.has(link)) continue;
        const d = tag(it, 'description');
        out.push({ type: 'actu', kicker: 'Actualité · ' + name, title: tag(it, 'title'), extract: d.length > 420 ? d.slice(0, 420).replace(/\s\S*$/, '') + '…' : d, link, credit: name });
        break;
      }
    } catch (e) { console.log('Échec flux', name, e.message); }
  }
  return out;
}

function tip() {
  const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'tips.json'), 'utf8'));
  const o = t[seed % t.length];
  return [{ type: 'astuce', kicker: 'Astuce ' + o.app, ...o, credit: 'Adobe', link: 'https://helpx.adobe.com/fr/' + (o.app === 'Photoshop' ? 'photoshop' : 'illustrator') + '/tutorials.html' }];
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  const cards = [...await safe('Met', met), ...await safe('RSS', rss), ...await safe('Astuce', async () => tip())];
  fs.writeFileSync(path.join(DATA, key + '.json'), JSON.stringify({ date: key, cards }, null, 1));
  let idx = []; try { idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'))); } catch (e) {}
  if (!idx.includes(key)) idx.push(key);
  fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(idx.sort()));
  console.log('Page du jour :', key, cards.length, 'cartes');
})();
