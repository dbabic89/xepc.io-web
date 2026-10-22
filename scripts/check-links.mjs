// Checks dist/: every root-relative href/src resolves to a file (drop-trailing-slash:
// /x -> x, x.html or x/index.html), every #fragment exists in the target page, and
// pages under dist/en and dist/de only link inside their own language (except the
// language switcher; 404.html is HR-only and skipped for that rule).
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(import.meta.dirname, '..', 'dist');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(DIST);

function resolve(p) {
  const rel = p.replace(/^\/+/, '');
  const cands = rel === '' ? ['index.html'] : [rel, rel + '.html', path.join(rel, 'index.html')];
  for (const c of cands) {
    const full = path.join(DIST, c);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

const problems = [];
let checked = 0;
for (const file of files) {
  const relFile = path.relative(DIST, file);
  const html = fs.readFileSync(file, 'utf8');
  const lang = relFile.startsWith('en' + path.sep) ? 'en' : relFile.startsWith('de' + path.sep) ? 'de' : null;
  for (const m of html.matchAll(/<(a|link|img|script|source)\b[^>]*>/g)) {
    const tag = m[0];
    const attr = tag.match(/\b(?:href|src)="(\/[^"]*)"/);
    if (!attr || attr[1].startsWith('//')) continue;
    const [pathAndQuery, frag] = attr[1].split('#');
    const p = pathAndQuery.split('?')[0];
    checked += 1;
    const target = resolve(p);
    if (!target) { problems.push(`${relFile}: unresolved ${attr[1]}`); continue; }
    if (frag && target.endsWith('.html') && !new RegExp(`\\bid="${frag}"`).test(fs.readFileSync(target, 'utf8')))
      problems.push(`${relFile}: missing fragment ${attr[1]}`);
    const isSwitcher = /\bclass="[^"]*\blang-opt\b/.test(tag) || /\bhreflang=/.test(tag);
    if (lang && m[1] === 'a' && !isSwitcher && !p.startsWith('/assets/') && p !== `/${lang}` && !p.startsWith(`/${lang}/`))
      problems.push(`${relFile}: leaves language ${attr[1]}`);
  }
}
console.log(`links checked: ${checked} in ${files.length} pages, problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
process.exit(problems.length ? 1 : 0);
