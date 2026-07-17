// Generates static EN and DE page variants into dist/ from the Croatian
// source pages + i18n/*.json translations, and writes a sitemap with
// hreflang alternates. Run by build.sh after dist/ is assembled.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://xepc.io';
const LANGS = ['en', 'de'];

const PAGES = [
  { file: 'index.html', slug: '' },
  { file: 'programiranje/index.html', slug: 'programiranje' },
  { file: 'izrada-web-stranica/index.html', slug: 'izrada-web-stranica' },
  { file: 'izrada-mobilnih-aplikacija/index.html', slug: 'izrada-mobilnih-aplikacija' },
  { file: 'izrada-aplikacija-po-mjeri/index.html', slug: 'izrada-aplikacija-po-mjeri' },
  { file: 'ai-rjesenja/index.html', slug: 'ai-rjesenja' },
];

const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'meta.json'), 'utf8'));

const OG_LOCALE = { en: 'en_US', de: 'de_DE' };
const LANG_CODE = { en: 'EN', de: 'DE' };
const LANG_FLAG = { en: 'en', de: 'de' };
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

// literal attribute translations (aria-labels/titles that are not data-i18n text nodes)
const ATTR_SWAPS = {
  en: [
    ['aria-label="Jezik"', 'aria-label="Language"'],
    ['aria-label="Promijeni temu" title="Promijeni temu"', 'aria-label="Toggle theme" title="Toggle theme"'],
    ['aria-label="Sheme boja" title="Sheme boja"', 'aria-label="Color schemes" title="Color schemes"'],
    ['aria-label="Zatvori"', 'aria-label="Close"'],
  ],
  de: [
    ['aria-label="Jezik"', 'aria-label="Sprache"'],
    ['aria-label="Promijeni temu" title="Promijeni temu"', 'aria-label="Design wechseln" title="Design wechseln"'],
    ['aria-label="Sheme boja" title="Sheme boja"', 'aria-label="Farbschemata" title="Farbschemata"'],
    ['aria-label="Zatvori"', 'aria-label="Schließen"'],
  ],
};

function urlFor(slug, lang) {
  if (lang === 'hr') return slug ? `${SITE}/${slug}` : `${SITE}/`;
  return slug ? `${SITE}/${lang}/${slug}` : `${SITE}/${lang}`;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function transform(html, slug, lang, dict, meta) {
  const url = urlFor(slug, lang);

  // html lang
  html = html.replace('<html lang="hr"', `<html lang="${lang}"`);

  // head: title, description, canonical, og, twitter
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.desc)}">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(meta.ogDesc || meta.desc)}">`);
  html = html.replace(/<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${OG_LOCALE[lang]}">`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(meta.twTitle || meta.title)}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(meta.twDesc || meta.desc)}">`);

  // JSON-LD (first block)
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${JSON.stringify(meta.jsonld, null, 2)}\n</script>`
  );

  // content: data-i18n / data-i18n-html text nodes
  html = html.replace(
    /(<([a-zA-Z0-9]+)\b[^>]*?\bdata-i18n(?:-html)?="([A-Za-z0-9_]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (all, open, tag, key, inner, close) => (dict[key] !== undefined ? open + dict[key] + close : all)
  );

  // placeholders
  html = html.replace(/<(?:input|textarea)\b[^>]*\bdata-i18n-ph="([A-Za-z0-9_]+)"[^>]*>/g, (tagStr, key) =>
    dict[key] !== undefined ? tagStr.replace(/placeholder="[^"]*"/, `placeholder="${esc(dict[key])}"`) : tagStr
  );

  // image alts keyed by role
  html = html.replace(/<img\b[^>]*\bdata-i18n-alt="([A-Za-z0-9_]+)"[^>]*>/g, (tagStr, key) =>
    dict[key] !== undefined ? tagStr.replace(/alt="[^"]*"/, `alt="${esc(dict[key])} — Dario Babić"`) : tagStr
  );

  // language dropdown: current-language button + active option
  html = html.replace(
    /<!--langcur-->[\s\S]*?<!--\/langcur-->/,
    `<!--langcur--><img class="flag" src="/assets/flags/${LANG_FLAG[lang]}.webp" alt="" width="20" height="14"><span class="lc">${LANG_CODE[lang]}</span>${CHEV}<!--/langcur-->`
  );
  html = html.replace('class="lang-opt on" data-l="hr"', 'class="lang-opt" data-l="hr"');
  html = html.replace(`class="lang-opt" data-l="${lang}"`, `class="lang-opt on" data-l="${lang}"`);

  // asset paths: generated pages live one directory deeper
  if (slug) {
    html = html.replace(/(href|src)="\.\.\/assets\//g, '$1="../../assets/');
  } else {
    html = html.replace(/(href|src)="assets\//g, '$1="../assets/');
    html = html.replace(/src="roles\//g, 'src="../roles/');
  }

  // attribute-level label translations
  for (const [from, to] of ATTR_SWAPS[lang]) html = html.split(from).join(to);

  return html;
}

let generated = 0;
for (const { file, slug } of PAGES) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dictFile = path.join(ROOT, 'i18n', (slug || 'index') + '.json');
  const dicts = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
  const metaKey = slug || 'index';
  for (const lang of LANGS) {
    const meta = META[metaKey]?.[lang];
    if (!meta) throw new Error(`missing meta for ${metaKey}/${lang}`);
    const out = transform(source, slug, lang, dicts[lang], meta);
    const outDir = slug ? path.join(DIST, lang, slug) : path.join(DIST, lang);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), out);
    generated += 1;
  }
}

// sitemap with hreflang alternates
const today = new Date().toISOString().slice(0, 10);
const entries = [];
for (const { slug } of PAGES) {
  const alternates = [
    `    <xhtml:link rel="alternate" hreflang="hr" href="${urlFor(slug, 'hr')}"/>`,
    `    <xhtml:link rel="alternate" hreflang="bs" href="${urlFor(slug, 'hr')}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${urlFor(slug, 'en')}"/>`,
    `    <xhtml:link rel="alternate" hreflang="de" href="${urlFor(slug, 'de')}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(slug, 'hr')}"/>`,
  ].join('\n');
  for (const lang of ['hr', ...LANGS]) {
    const isHome = !slug;
    const priority = lang === 'hr' ? (isHome ? '1.0' : '0.9') : (isHome ? '0.8' : '0.7');
    entries.push(`  <url>
    <loc>${urlFor(slug, lang)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${isHome ? 'weekly' : 'monthly'}</changefreq>
    <priority>${priority}</priority>
${alternates}
  </url>`);
  }
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);

console.log(`locales: ${generated} pages generated (en, de), sitemap with ${entries.length} URLs`);
