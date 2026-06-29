import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

type Post = {
  date: string;
  number: string;
  title: string;
  summary: string;
  question: string;
  stem: string;
  outputPath: string;
  urlPath: string;
  html: string;
};

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const FILE_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;
const DEFAULT_QUESTION = "이 주제는 내 작업에서 어떤 질문으로 이어질 수 있을까?";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(value: string): string {
  const escaped = escapeHtml(value);

  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function flushParagraph(paragraph: string[], output: string[]): void {
  if (paragraph.length === 0) return;
  output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  paragraph.length = 0;
}

function flushList(list: string[], output: string[]): void {
  if (list.length === 0) return;
  output.push("<ul>");
  for (const item of list) {
    output.push(`<li>${renderInline(item)}</li>`);
  }
  output.push("</ul>");
  list.length = 0;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(line.trim());
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";

  const [head, ...body] = rows;
  const header = head.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const bodyRows = body
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output: string[] = [];
  const paragraph: string[] = [];
  const list: string[] = [];
  const table: string[][] = [];
  let codeFence: string[] | null = null;

  function flushTable(): void {
    if (table.length === 0) return;
    output.push(renderTable(table));
    table.length = 0;
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph(paragraph, output);
      flushList(list, output);
      flushTable();

      if (codeFence) {
        output.push(`<pre><code>${escapeHtml(codeFence.join("\n"))}</code></pre>`);
        codeFence = null;
      } else {
        codeFence = [];
      }
      continue;
    }

    if (codeFence) {
      codeFence.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paragraph, output);
      flushList(list, output);
      flushTable();
      continue;
    }

    if (isTableSeparator(line)) {
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph(paragraph, output);
      flushList(list, output);
      table.push(splitTableRow(line));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(paragraph, output);
      flushList(list, output);
      flushTable();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = /^-\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph(paragraph, output);
      flushTable();
      list.push(listItem[1]);
      continue;
    }

    const blockquote = /^>\s?(.+)$/.exec(line);
    if (blockquote) {
      flushParagraph(paragraph, output);
      flushList(list, output);
      flushTable();
      output.push(`<blockquote>${renderInline(blockquote[1])}</blockquote>`);
      continue;
    }

    flushList(list, output);
    flushTable();
    paragraph.push(line.trim());
  }

  flushParagraph(paragraph, output);
  flushList(list, output);
  flushTable();

  if (codeFence) {
    output.push(`<pre><code>${escapeHtml(codeFence.join("\n"))}</code></pre>`);
  }

  return output.join("\n");
}

function parseFrontmatter(markdown: string): { data: Record<string, string>; body: string } {
  if (!markdown.startsWith("---\n")) {
    return { data: {}, body: markdown };
  }

  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    return { data: {}, body: markdown };
  }

  const frontmatter = markdown.slice(4, end).trim();
  const body = markdown.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { data, body };
}

function extractFirstParagraph(markdown: string): string {
  const paragraph = markdown
    .replace(/^# .+$/m, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("```"));

  return paragraph ? paragraph.replace(/\s+/g, " ") : "";
}

function stripLeadingTitle(markdown: string): string {
  return markdown.replace(/^[\s\uFEFF]*#\s+[^\n]+\n+/, "");
}

function parsePost(fileName: string, index: number): Post | null {
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match) return null;

  const [, date, rawTitle] = match;
  const stem = fileName.replace(/\.md$/, "");
  const title = rawTitle.replaceAll("_", " ");
  const markdown = readFileSync(path.join(POSTS_DIR, fileName), "utf8");
  const { data, body } = parseFrontmatter(markdown);
  const contentBody = stripLeadingTitle(body);
  const html = markdownToHtml(contentBody);
  const summary = data.summary || extractFirstParagraph(contentBody) || "TouchDesigner를 매개로 이미지와 시스템을 관찰하는 짧은 글입니다.";
  const question = data.question || DEFAULT_QUESTION;
  const urlPath = `/posts/${stem}/`;
  const outputPath = path.join(PUBLIC_DIR, "posts", stem, "index.html");
  const number = String(index + 1).padStart(2, "0");

  return { date, number, title, summary, question, stem, outputPath, urlPath, html };
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`;
}

function renderIndex(posts: Post[]): string {
  const cards = posts
    .map(
      (post) => `        <article class="topic-card">
          <a href="${post.urlPath}" aria-label="${escapeHtml(post.number)} ${escapeHtml(post.title)} 읽기">
            <span class="topic-number">${post.number}</span>
            <span class="topic-meta"><time datetime="${post.date}">${post.date}</time></span>
            <strong>${escapeHtml(post.title)}</strong>
            <span class="topic-summary">${escapeHtml(post.summary)}</span>
            <span class="topic-question">${escapeHtml(post.question)}</span>
          </a>
        </article>`,
    )
    .join("\n");

  return renderPage(
    "NoTouch.py Study Handout",
    `    <section class="handout-hero">
      <p class="kicker">TouchDesigner Study</p>
      <h1>NoTouch.py Study Handout</h1>
      <p>TouchDesigner를 매개로 이미지, 시스템, 감각, 도구에 대해 생각하는 12개의 글</p>
    </section>
    <section class="topic-grid" aria-label="12개 주제">
${cards || '      <p class="empty">아직 등록된 글이 없습니다.</p>'}
    </section>`,
  );
}

function renderPost(post: Post, previous?: Post, next?: Post): string {
  const previousLink = previous
    ? `<a href="${previous.urlPath}"><span>이전 주제</span>${previous.number} ${escapeHtml(previous.title)}</a>`
    : "<span></span>";
  const nextLink = next
    ? `<a href="${next.urlPath}"><span>다음 주제</span>${next.number} ${escapeHtml(next.title)}</a>`
    : "<span></span>";

  return renderPage(
    post.title,
    `    <article class="post handout-sheet">
      <nav class="top-nav">
        <a href="/">목록으로 돌아가기</a>
      </nav>
      <header class="post-header">
        <span class="post-number">${post.number}</span>
        <div>
          <time datetime="${post.date}">${post.date}</time>
          <h1>${escapeHtml(post.title)}</h1>
        </div>
      </header>
      <section class="question-box" aria-label="생각해볼 질문">
        <h2>생각해볼 질문</h2>
        <p>${escapeHtml(post.question)}</p>
      </section>
      <section class="post-body">
${post.html
  .split("\n")
  .map((line) => `        ${line}`)
  .join("\n")}
      </section>
      <nav class="post-pager" aria-label="주제 이동">
        ${previousLink}
        ${nextLink}
      </nav>
    </article>`,
  );
}

function writeStyles(): void {
  const css = `:root {
  color-scheme: light;
  --bg: #f4f4f1;
  --paper: #ffffff;
  --text: #121212;
  --muted: #6b6b66;
  --line: #d8d8d2;
  --accent: #39ff14;
  --code: #ededeb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}

a {
  color: inherit;
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.2em;
}

main {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 48px 0 72px;
}

.handout-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 420px);
  gap: 32px;
  align-items: end;
  min-height: 38vh;
  padding: 18px 0 42px;
  border-bottom: 1px solid var(--text);
}

.kicker {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--accent);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(48px, 10vw, 112px);
  font-weight: 800;
  line-height: 0.92;
  letter-spacing: 0;
}

.handout-hero p:last-child {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: clamp(17px, 2vw, 22px);
  line-height: 1.45;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-left: 1px solid var(--line);
  border-top: 1px solid var(--line);
  background: var(--paper);
}

.topic-card {
  min-height: 310px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.topic-card a {
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  gap: 14px;
  height: 100%;
  padding: 22px;
  text-decoration: none;
}

.topic-card a:hover,
.topic-card a:focus-visible {
  background: #fafafa;
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.topic-number,
.post-number {
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 800;
  line-height: 1;
}

.topic-number {
  font-size: 42px;
}

.topic-meta,
time {
  color: var(--muted);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.topic-card strong {
  font-size: 26px;
  line-height: 1.15;
}

.topic-summary {
  color: var(--muted);
  font-size: 15px;
}

.topic-question {
  display: block;
  border-top: 1px solid var(--line);
  padding-top: 14px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
}

.empty {
  padding: 32px;
}

.handout-sheet {
  max-width: 820px;
  margin: 0 auto;
  background: var(--paper);
  border: 1px solid var(--line);
  padding: clamp(24px, 5vw, 56px);
}

.top-nav {
  margin-bottom: 44px;
}

.top-nav a {
  color: var(--muted);
  font-size: 14px;
}

.post-header {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  border-bottom: 1px solid var(--text);
  padding-bottom: 36px;
}

.post-number {
  font-size: clamp(72px, 14vw, 128px);
}

.post-header h1 {
  margin-top: 10px;
  font-size: clamp(42px, 8vw, 82px);
}

.question-box {
  margin: 34px 0 42px;
  border: 1px solid var(--text);
  padding: 22px;
}

.question-box h2 {
  margin: 0 0 10px;
  color: var(--accent);
  font-size: 14px;
  letter-spacing: 0;
}

.question-box p {
  margin: 0;
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 750;
  line-height: 1.35;
}

.post-body {
  font-size: 18px;
}

.post-body h1 {
  margin: 48px 0 18px;
  font-size: 32px;
  line-height: 1.2;
}

.post-body h2 {
  margin: 40px 0 14px;
  font-size: 24px;
  line-height: 1.25;
  letter-spacing: 0;
}

.post-body h3 {
  margin: 30px 0 10px;
}

p {
  margin: 0 0 18px;
}

ul {
  padding-left: 24px;
}

li + li {
  margin-top: 6px;
}

code {
  border-radius: 3px;
  background: var(--code);
  padding: 0.12em 0.32em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
}

pre {
  overflow-x: auto;
  border: 1px solid var(--line);
  background: var(--code);
  padding: 16px;
}

pre code {
  background: transparent;
  padding: 0;
}

blockquote {
  margin: 28px 0;
  border-left: 4px solid var(--accent);
  padding-left: 16px;
  color: var(--muted);
}

.table-wrap {
  overflow-x: auto;
  margin: 28px 0;
  border: 1px solid var(--line);
}

table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
  background: var(--paper);
  font-size: 15px;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 12px 14px;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--accent);
  font-size: 13px;
}

.post-pager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 56px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.post-pager a {
  min-height: 92px;
  border: 1px solid var(--line);
  padding: 16px;
  text-decoration: none;
}

.post-pager a:last-child {
  text-align: right;
}

.post-pager span {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 860px) {
  main {
    width: min(100% - 28px, 720px);
    padding-top: 28px;
  }

  .handout-hero {
    display: block;
    min-height: auto;
  }

  .handout-hero h1 {
    margin: 18px 0 22px;
  }

  .topic-grid {
    grid-template-columns: 1fr;
  }

  .topic-card {
    min-height: 240px;
  }

  .post-header {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .post-pager {
    grid-template-columns: 1fr;
  }

  .post-pager a:last-child {
    text-align: left;
  }
}
`;

  writeFileSync(path.join(PUBLIC_DIR, "styles.css"), css);
}

function build(): void {
  if (existsSync(PUBLIC_DIR)) {
    rmSync(PUBLIC_DIR, { recursive: true, force: true });
  }

  mkdirSync(PUBLIC_DIR, { recursive: true });

  const fileNames = existsSync(POSTS_DIR)
    ? readdirSync(POSTS_DIR)
        .filter((fileName) => fileName.endsWith(".md") && FILE_NAME_PATTERN.test(fileName))
        .sort((a, b) => a.localeCompare(b, "ko"))
    : [];

  const posts = fileNames
    .map(parsePost)
    .filter((post): post is Post => post !== null);

  writeFileSync(path.join(PUBLIC_DIR, "index.html"), renderIndex(posts));
  writeStyles();

  posts.forEach((post, index) => {
    mkdirSync(path.dirname(post.outputPath), { recursive: true });
    writeFileSync(post.outputPath, renderPost(post, posts[index - 1], posts[index + 1]));
  });

  console.log(`Built ${posts.length} post(s) into ${path.relative(ROOT, PUBLIC_DIR)}/`);
}

build();
