import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { matchesSearchQuery } from '../src/lib/search-policy.ts';
import { analysisCourse, courseRoute, plannedArticleCount } from '../src/config/analysis-course.ts';
import { requiredTopics, reviewedTopicIds } from '../src/config/analysis-required-topics.ts';

const dist = path.resolve(process.argv[2] || 'dist');
const origin = 'https://itbert.github.io';
const base = '/Mandarin/';
const requiredFiles = [
  'index.html', 'preparation/index.html', 'analysis/index.html',
  'linear-algebra/index.html', 'about/index.html', 'license/index.html', '404.html',
];
const errors = [];
let linkCount = 0;
let resourceCount = 0;
const assert = (condition, message) => { if (!condition) errors.push(message); };

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }));
  return nested.flat();
}

// Derive file-based routes from the real content, including future articles.
const contentRoot = path.resolve('src/content/docs');
const contentFiles = (await walk(contentRoot)).filter((file) => /\.mdx?$/.test(file));
const contentRoutes = [];
const lessonRoutes = [];
for (const file of contentFiles) {
  const source = await readFile(file, 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  if (/^draft:\s*true(?:\s*#.*)?$/m.test(frontmatter)) continue;
  const relative = path.relative(contentRoot, file).split(path.sep).join('/');
  let slug = relative.replace(/\.mdx?$/, '').replace(/\/index$/, '');
  const override = frontmatter.match(/^slug:\s*([^\r\n#]+)(?:#.*)?$/m)?.[1]?.trim();
  if (override) slug = override.replace(/^['"]|['"]$/g, '').replace(/^\/|\/$/g, '');
  const route = slug + '/index.html';
  contentRoutes.push(route);
  if (/^lesson:\s*true(?:\s*#.*)?$/m.test(frontmatter)) lessonRoutes.push(route);
}
const expectedFiles = [...new Set([...requiredFiles, ...contentRoutes])];
const publicPageCount = expectedFiles.filter((file) => file !== '404.html').length;
const plannedArticles = analysisCourse.flatMap((chapter) => chapter.articles.map((article) => ({ ...article, route: courseRoute(chapter, article) })));
const coveredTopics = new Set(plannedArticles.flatMap((article) => article.topics));
assert(Array.from({ length: 62 }, (_, i) => i + 1).every((topic) => coveredTopics.has(topic)), 'Course plan loses an original topic');
assert([...coveredTopics].every((topic) => topic >= 1 && topic <= 62), 'Course plan references an unknown original topic');
assert(new Set(plannedArticles.map((article) => article.route)).size === plannedArticleCount, 'Course plan contains duplicate article routes');
assert(requiredTopics.length === 62 && new Set(requiredTopics.map((topic) => topic.id)).size === 62, 'Required list must contain exactly 62 unique topics');
assert(requiredTopics.every((topic, index) => topic.id === index + 1 && topic.title.trim()), 'Required list must preserve original numbering and nonempty titles');
assert(new Set(reviewedTopicIds).size === reviewedTopicIds.length, 'Topic audit contains duplicate IDs');
for (const id of reviewedTopicIds) {
  assert(coveredTopics.has(id), `Reviewed topic ${id} is absent from the course plan`);
  const related = plannedArticles.filter((article) => article.topics.includes(id));
  assert(related.every((article) => lessonRoutes.includes(`${article.route.slice(1)}index.html`)), `Reviewed topic ${id} refers to unpublished lessons`);
}

function elements(node) {
  const result = [];
  if (node.tagName) result.push(node);
  for (const child of node.childNodes || []) result.push(...elements(child));
  if (node.content) result.push(...elements(node.content));
  return result;
}

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasAttr = (node, name) => node.attrs?.some((item) => item.name === name);
const text = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('')).trim();
const normalizedText = (node) => text(node).replace(/\s+/g, ' ');
const publicURL = (file) => `${origin}${base}${file.replace(/index\.html$/, '')}`;

function indexed(node) {
  let withinBody = false;
  for (let current = node; current; current = current.parentNode) {
    if (hasAttr(current, 'data-pagefind-ignore')) return false;
    if (['nav', 'footer', 'script', 'style', 'form'].includes(current.tagName)) return false;
    if (hasAttr(current, 'data-pagefind-body')) withinBody = true;
  }
  return withinBody;
}

async function existingFile(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

function localPath(url) {
  if (url.origin !== origin) return null;
  if (!url.pathname.startsWith(base)) return null;
  const relative = decodeURIComponent(url.pathname.slice(base.length));
  const resolved = path.resolve(dist, relative);
  if (resolved !== dist && !resolved.startsWith(`${dist}${path.sep}`)) return null;
  return resolved;
}

async function resolveTarget(url) {
  let file = localPath(url);
  if (!file) return null;
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (await existingFile(file)) return file;
  if (!path.extname(file) && await existingFile(path.join(file, 'index.html'))) return path.join(file, 'index.html');
  return null;
}

async function checkURL(raw, sourceURL, context, resource = false) {
  if (!raw || /^(data:|blob:|mailto:|tel:)/i.test(raw)) return;
  let url;
  try { url = new URL(raw, sourceURL); } catch { errors.push(`${context}: invalid URL ${raw}`); return; }
  assert(['http:', 'https:'].includes(url.protocol), `${context}: unsupported URL ${raw}`);
  if (resource) assert(url.origin === origin, `${context}: resources must be supplied locally: ${raw}`);
  if (url.origin !== origin) return;
  assert(url.pathname.startsWith(base), `${context}: URL escapes project base: ${raw}`);
  if (!url.pathname.startsWith(base)) return;
  const file = await resolveTarget(url);
  assert(file, `${context}: missing target ${raw}`);
  if (!file) return;
  if (resource) resourceCount++; else linkCount++;
  if (url.hash && file.endsWith('.html')) {
    const target = documents.get(path.relative(dist, file).split(path.sep).join('/'));
    const id = decodeURIComponent(url.hash.slice(1));
    assert(target?.ids.has(id), `${context}: missing anchor ${raw}`);
  }
}

let files;
try { files = await walk(dist); } catch {
  console.error('Smoke checks require a production build. Run npm run build first.');
  process.exit(1);
}
const relativeFiles = files.map((file) => path.relative(dist, file).split(path.sep).join('/'));
const htmlFiles = relativeFiles.filter((file) => file.endsWith('.html') && !file.startsWith('pagefind/'));
assert(JSON.stringify([...htmlFiles].sort()) === JSON.stringify([...expectedFiles].sort()), `HTML routes differ from real content: ${htmlFiles.join(', ')}`);
assert(relativeFiles.includes('.nojekyll'), 'Missing dist/.nojekyll for branch-based GitHub Pages');
assert(!relativeFiles.some((file) => /(^|\/)(__fixtures__|fixtures|test-fixtures)(\/|\.)/i.test(file)), 'Technical fixtures leaked into production output');

const documents = new Map();
for (const file of htmlFiles) {
  const html = await readFile(path.join(dist, file), 'utf8');
  const nodes = elements(parse(html));
  documents.set(file, { html, nodes, ids: new Set(nodes.map((node) => attr(node, 'id')).filter(Boolean)) });
}

const titles = new Set();
const descriptions = new Set();
for (const [file, { nodes, ids }] of documents) {
  const url = publicURL(file);
  const ofTag = (tag) => nodes.filter((node) => node.tagName === tag);
  const metas = (key, value) => ofTag('meta').filter((node) => attr(node, key) === value);
  const meta = (key, value) => {
    const found = metas(key, value);
    assert(found.length === 1, `${file}: expected exactly one ${value} meta tag`);
    return found[0] && attr(found[0], 'content');
  };
  assert(attr(ofTag('html')[0], 'lang') === 'ru', `${file}: html lang must be ru`);
  const h1 = ofTag('h1');
  assert(h1.length === 1 && normalizedText(h1[0]), `${file}: expected one nonempty H1`);
  const headingLevels = nodes.filter((node) => /^h[1-6]$/.test(node.tagName)).map((node) => Number(node.tagName[1]));
  for (let i = 1; i < headingLevels.length; i++) assert(headingLevels[i] <= headingLevels[i - 1] + 1, `${file}: heading level skips from H${headingLevels[i - 1]} to H${headingLevels[i]}`);
  const titleNodes = ofTag('title').filter((node) => node.parentNode?.tagName === 'head');
  const title = titleNodes[0] && normalizedText(titleNodes[0]);
  assert(titleNodes.length === 1 && title, `${file}: expected one nonempty title`);
  assert(!titles.has(title), `${file}: duplicate title ${title}`);
  titles.add(title);
  const description = meta('name', 'description');
  assert(description && description.trim(), `${file}: missing description`);
  assert(!descriptions.has(description), `${file}: duplicate description`);
  descriptions.add(description);
  const canonical = ofTag('link').filter((node) => attr(node, 'rel')?.split(/\s+/).includes('canonical'));
  assert(canonical.length === 1 && attr(canonical[0], 'href') === url, `${file}: canonical must be ${url}`);
  assert(meta('property', 'og:url') === url, `${file}: og:url must match canonical`);
  assert(meta('property', 'og:title'), `${file}: missing Open Graph title`);
  assert(meta('property', 'og:description'), `${file}: missing Open Graph description`);
  assert(meta('property', 'og:type') === 'website', `${file}: unpublished materials must use website Open Graph type`);
  const image = meta('property', 'og:image');
  assert(image?.startsWith(`${origin}${base}`), `${file}: Open Graph image must be absolute and local`);
  if (image) await checkURL(image, url, `${file} og:image`, true);
  const robots = metas('name', 'robots').map((node) => attr(node, 'content') || '').join(',').toLowerCase();
  assert(file === '404.html' ? /\bnoindex\b/.test(robots) : !/\b(noindex|none)\b/.test(robots), `${file}: incorrect robots indexing directive`);
  assert(!nodes.some((node) => attr(node, 'type') === 'application/ld+json' && /"(?:Article|LearningResource)"/.test(text(node))), `${file}: metadata advertises unpublished educational articles`);
  const idValues = nodes.map((node) => attr(node, 'id')).filter(Boolean);
  assert(idValues.length === ids.size, `${file}: duplicate HTML ids`);
  const bodies = nodes.filter((node) => hasAttr(node, 'data-pagefind-body'));
  assert(file === '404.html' ? !bodies.some(indexed) : bodies.some(indexed), `${file}: incorrect Pagefind inclusion`);
  for (const node of nodes) {
    if (['nav', 'footer'].includes(node.tagName)) assert(!indexed(node), `${file}: ${node.tagName} must be excluded from search`);
    if (/материалы появятся позже/i.test(normalizedText(node)) && node.tagName === 'h2') assert(!indexed(node), `${file}: repeated availability notices must be excluded from search`);
    if (node.tagName === 'a') {
      assert(attr(node, 'href'), `${file}: link is missing its destination`);
      await checkURL(attr(node, 'href'), url, `${file} link`);
    }
    if (['img', 'script', 'iframe', 'source', 'video', 'audio', 'embed', 'input'].includes(node.tagName)) await checkURL(attr(node, 'src'), url, `${file} ${node.tagName}`, true);
    if (node.tagName === 'video') await checkURL(attr(node, 'poster'), url, `${file} video poster`, true);
    if (node.tagName === 'link' && !attr(node, 'rel')?.includes('canonical')) await checkURL(attr(node, 'href'), url, `${file} link asset`, true);
    if (['use', 'image'].includes(node.tagName)) await checkURL(attr(node, 'href'), url, `${file} SVG resource`, true);
    if (node.tagName === 'img') {
      assert(hasAttr(node, 'alt'), `${file}: image is missing alt`);
      assert(attr(node, 'width') && attr(node, 'height'), `${file}: image needs explicit width and height`);
    }
    const srcset = attr(node, 'srcset');
    if (srcset && !srcset.startsWith('data:')) for (const candidate of srcset.split(',')) await checkURL(candidate.trim().split(/\s+/)[0], url, `${file} srcset`, true);
  }
}

const homepage = documents.get('index.html');
if (homepage) {
  const links = new Set(homepage.nodes.filter((node) => node.tagName === 'a').map((node) => attr(node, 'href')));
  for (const route of ['preparation/', 'analysis/', 'linear-algebra/']) assert(links.has(`${base}${route}`), `Homepage must link to ${base}${route} without JavaScript`);
}

for (const file of relativeFiles.filter((file) => file.endsWith('.css'))) {
  const css = await readFile(path.join(dist, file), 'utf8');
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) await checkURL(match[2], `${origin}${base}${file}`, `${file} CSS resource`, true);
}

const sitemapFiles = relativeFiles.filter((file) => /^sitemap.*\.xml$/.test(file));
assert(sitemapFiles.length, 'Missing XML sitemap');
const sitemapPages = new Set();
for (const file of sitemapFiles) {
  const xml = await readFile(path.join(dist, file), 'utf8');
  for (const match of xml.matchAll(/<loc>(.*?)<\/loc>/gs)) {
    const url = match[1].replace(/&amp;/g, '&');
    if (url.endsWith('.xml')) await checkURL(url, `${origin}${base}`, `${file} sitemap index`, true);
    else { sitemapPages.add(url); await checkURL(url, `${origin}${base}`, `${file} sitemap`); }
  }
}
const expectedSitemap = expectedFiles.filter((file) => file !== '404.html').map(publicURL);
assert(JSON.stringify([...sitemapPages].sort()) === JSON.stringify(expectedSitemap.sort()), `Sitemap differs from the published pages; found ${[...sitemapPages].join(', ')}`);

const entryFile = path.join(dist, 'pagefind/pagefind-entry.json');
assert(await existingFile(entryFile), 'Missing Pagefind entry metadata');
if (await existingFile(entryFile)) {
  const entry = JSON.parse(await readFile(entryFile, 'utf8'));
  assert(entry.languages?.ru, 'Pagefind must have a Russian index');
  assert(Object.keys(entry.languages || {}).length === 1, 'Unexpected search index language');
  assert(entry.languages?.ru?.page_count === publicPageCount, `Pagefind must index ${publicPageCount} pages, found ${entry.languages?.ru?.page_count}`);
}

// Execute the generated Pagefind browser API against its actual on-disk chunks.
// Only transport is replaced: no index is rebuilt and no external request is made.
const pagefindJS = path.join(dist, 'pagefind/pagefind.js');
assert(await existingFile(pagefindJS), 'Missing generated Pagefind JavaScript');
if (await existingFile(pagefindJS)) {
  const originalFetch = globalThis.fetch;
  const searchDirectory = pathToFileURL(path.join(dist, 'pagefind') + path.sep).href;
  let pagefind;
  let timeout;
  try {
    globalThis.fetch = async (raw) => {
      const url = new URL(typeof raw === 'string' ? raw : raw.url || raw.href);
      if (!url.href.startsWith(searchDirectory)) throw new Error(`Unexpected Pagefind request: ${url}`);
      return new Response(await readFile(url));
    };
    pagefind = await import(pathToFileURL(pagefindJS).href);
    await pagefind.options({ baseUrl: base });
    const checks = async () => {
      const all = await pagefind.search(null);
      const records = await Promise.all(all.results.map((result) => result.data()));
      const expectedURLs = new Set(expectedFiles.filter((file) => file !== '404.html').map((file) => new URL(publicURL(file)).pathname));
      const actualURLs = new Set(records.map((record) => new URL(record.url, origin).pathname));
      assert(JSON.stringify([...actualURLs].sort()) === JSON.stringify([...expectedURLs].sort()), `Pagefind results differ from real pages: ${[...actualURLs].join(', ')}`);
      for (const record of records) {
        assert(record.meta?.title, `${record.url}: search result is missing its title`);
        assert(!/материалы появятся позже|этот раздел готовится|перейти к содержимому/i.test(record.content), `${record.url}: search indexes repeated notices or interface text`);
        await checkURL(record.url, `${origin}${base}`, 'Pagefind result');
      }
      const queries = [
        ['Математическая подготовка', 'preparation/'],
        ['Математический анализ', 'analysis/'],
        ['Линейная алгебра', 'linear-algebra/'],
        ['олимпиадные', 'preparation/'],
        ['о проекте', 'about/'],
        ['олимпиадный', 'preparation/'],
        ['алгебры', 'linear-algebra/'],
        ['подготовка математическая', 'preparation/'],
        ['кванторы', 'analysis/language/logic/'],
        ['Моргана', 'analysis/language/families/'],
        ['прообраз', 'analysis/language/functions/'],
        ['биекция', 'analysis/language/inverses/'],
        ['фактор-множество', 'analysis/language/relations/'],
        ['упорядоченное поле', 'analysis/real-numbers/ordered-field/'],
        ['частичный порядок', 'analysis/real-numbers/order/'],
        ['супремум', 'analysis/real-numbers/supremum/'],
        ['Бернулли', 'analysis/real-numbers/induction/'],
        ['существование корней', 'analysis/real-numbers/completeness/'],
        ['Архимедово свойство', 'analysis/real-numbers/archimedes/'],
        ['обязательные темы', 'analysis/required-topics/'],
      ];
      for (const [query, expected] of queries) {
        const search = await pagefind.search(query);
        const rawResults = await Promise.all(search.results.map((result) => result.data()));
        const results = rawResults.filter((result) => matchesSearchQuery(query, result));
        assert(results.some((result) => new URL(result.url, origin).pathname === `${base}${expected}`), `Search for «${query}» must find ${base}${expected}`);
        for (const result of results) {
          assert(result.excerpt, `${query}: search result is missing an excerpt`);
          await checkURL(result.url, `${origin}${base}`, `Search «${query}» result`);
        }
      }
      for (const query of ['несуществующийтерминмандариносмоук', 'квазикристаллы']) {
        const search = await pagefind.search(query);
        const rawResults = await Promise.all(search.results.map((result) => result.data()));
        const results = rawResults.filter((result) => matchesSearchQuery(query, result));
        assert(results.length === 0, `Absent search term «${query}» must return no results`);
      }
    };
    await Promise.race([
      checks(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Pagefind checks timed out after 30 seconds')), 30_000); }),
    ]);
  } catch (error) {
    errors.push(`Generated Pagefind search failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
    await pagefind?.destroy();
    globalThis.fetch = originalFetch;
  }
}

// Lesson pages must contain rendered mathematics and a reading route.
for (const file of lessonRoutes) {
  const document = documents.get(file);
  assert(document, 'Missing lesson ' + file);
  if (!document) continue;
  assert(document.nodes.some((node) => attr(node, 'class')?.split(' ').includes('katex')), file + ': formulas were not rendered by KaTeX');
  const body = document.nodes.find((node) => hasAttr(node, 'data-pagefind-body'));
  assert(!body || !/\$\$/.test(normalizedText(body)), file + ': raw display-math delimiters leaked into the lesson');
  assert(document.nodes.some((node) => node.tagName === 'nav' && attr(node, 'aria-label') === 'Последовательное чтение'), file + ': missing previous/next navigation');
}
const coursePlan = documents.get('analysis/plan/index.html');
if (coursePlan) {
  for (const article of plannedArticles) {
    const href = base + article.route.slice(1);
    const routeFile = article.route.slice(1) + 'index.html';
    const links = coursePlan.nodes.filter((node) => node.tagName === 'a' && attr(node, 'href') === href);
    assert(expectedFiles.includes(routeFile) ? links.length > 0 : links.length === 0, 'Course plan must link only to a published article: ' + article.route);
  }
}

const requiredList = documents.get('analysis/required-topics/index.html');
assert(requiredList, 'Missing separate required-topics page');
if (requiredList) {
  const rows = requiredList.nodes.filter((node) => hasAttr(node, 'data-required-topic'));
  assert(rows.length === requiredTopics.length, 'Rendered required list loses or duplicates a topic');
  for (const topic of requiredTopics) {
    const row = rows.find((node) => attr(node, 'data-required-topic') === String(topic.id));
    assert(row && normalizedText(row).includes(topic.title), `Required topic ${topic.id} is missing its original label`);
    if (!row) continue;
    const related = plannedArticles.filter((article) => article.topics.includes(topic.id) && lessonRoutes.includes(`${article.route.slice(1)}index.html`));
    const expectedStatus = reviewedTopicIds.includes(topic.id) ? 'reviewed' : related.length ? 'partial' : 'planned';
    assert(attr(row, 'data-topic-status') === expectedStatus, `Topic ${topic.id}: incorrect coverage status`);
    for (const article of related) {
      assert(elements(row).some((node) => node.tagName === 'a' && attr(node, 'href') === base + article.route.slice(1)), `Topic ${topic.id}: missing published article link`);
    }
  }
}

if (errors.length) {
  console.error(`Smoke checks failed (${errors.length}):\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  process.exit(1);
}
console.log(`Smoke checks passed: ${documents.size} HTML pages, ${linkCount} internal links, ${resourceCount} local resources, ${publicPageCount} sitemap pages, Pagefind control searches and complete coverage of 62 course topics.`);
