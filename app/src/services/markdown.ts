import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import katex from 'katex';

// Configure marked
marked.use(gfmHeadingId());
marked.use({
  gfm: true,
  breaks: true,
  async: false,
});

// Setup DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Custom renderer for syntax highlighting
const renderer = new marked.Renderer();

renderer.code = (code: string, language: string | undefined) => {
  const lang = language || '';
  const validLang = lang && hljs.getLanguage(lang);
  const highlighted = validLang
      ? hljs.highlight(code, { language: lang }).value
      : hljs.highlightAuto(code).value;

  return `<pre><code class="hljs ${lang}">${highlighted}</code></pre>`;
};

marked.setOptions({ renderer });

// Math formula processing
function renderMathFormulas(content: string): string {
  // Process block math formulas ($$...$$)
  content = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false,
        trust: true,
      });
    } catch (error) {
      console.error('KaTeX block rendering error:', error);
      return `<div class="math-error">Error rendering formula: ${escapeHtml(formula)}</div>`;
    }
  });

  // Process inline math formulas ($...$)
  // Use negative lookbehind to avoid matching $$
  content = content.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (match, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
        trust: true,
      });
    } catch (error) {
      console.error('KaTeX inline rendering error:', error);
      return `<span class="math-error">Error: ${escapeHtml(formula)}</span>`;
    }
  });

  return content;
}

export function renderMarkdown(content: string): string {
  // First, render math formulas before markdown processing
  // to avoid markdown parser interfering with LaTeX syntax
  const contentWithMath = renderMathFormulas(content);

  const html = marked.parse(contentWithMath, { async: false }) as string;

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe', 'span', 'annotation', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mroot', 'msqrt', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace'],
    ADD_ATTR: ['target', 'rel', 'class', 'style', 'aria-hidden', 'encoding', 'xmlns'],
  });
}

export function getPageTemplate(
    title: string,
    content: string,
    publishedAt: string,
    updatedAt: string
): string {
  const formattedPublished = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedUpdated = new Date(updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="Published from Obsidian">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:type" content="article">
  <meta property="og:description" content="Published from Obsidian">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #24292e;
      --secondary-text: #586069;
      --border-color: #e1e4e8;
      --code-bg: #f6f8fa;
      --code-text: #24292e;
      --link-color: #0366d6;
      --blockquote-border: #dfe2e5;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --secondary-text: #8b949e;
        --border-color: #30363d;
        --code-bg: #161b22;
        --code-text: #e6edf3;
        --link-color: #58a6ff;
        --blockquote-border: #3b434b;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--bg-color);
      margin: 0;
      padding: 0;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    h1 {
      margin: 0 0 10px 0;
      font-size: 2em;
      font-weight: 600;
    }

    .meta {
      color: var(--secondary-text);
      font-size: 0.9em;
    }

    .content {
      word-wrap: break-word;
    }

    .content h1, .content h2, .content h3, 
    .content h4, .content h5, .content h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }

    .content h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    .content h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    .content h3 { font-size: 1.25em; }
    .content h4 { font-size: 1em; }
    .content h5 { font-size: 0.875em; }
    .content h6 { font-size: 0.85em; color: var(--secondary-text); }

    .content p {
      margin-top: 0;
      margin-bottom: 16px;
    }

    .content a {
      color: var(--link-color);
      text-decoration: none;
    }

    .content a:hover {
      text-decoration: underline;
    }

    .content code {
      background-color: var(--code-bg);
      color: var(--code-text);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 85%;
    }

    .content pre {
      background-color: var(--code-bg);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      line-height: 1.45;
    }

    .content pre code {
      background: none;
      padding: 0;
      font-size: 100%;
      color: inherit;
    }

    .content blockquote {
      margin: 0;
      padding: 0 1em;
      color: var(--secondary-text);
      border-left: 0.25em solid var(--blockquote-border);
    }

    .content ul, .content ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }

    .content li {
      margin-bottom: 4px;
    }

    .content li > p {
      margin-bottom: 8px;
    }

    .content table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }

    .content th, .content td {
      border: 1px solid var(--border-color);
      padding: 6px 13px;
    }

    .content th {
      font-weight: 600;
      background-color: var(--code-bg);
    }

    .content tr:nth-child(2n) {
      background-color: var(--code-bg);
    }

    .content img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
    }

    .content hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: var(--border-color);
      border: 0;
    }

    .content input[type="checkbox"] {
      margin-right: 0.5em;
    }

    /* KaTeX Math Styles */
    .content .katex {
      font-size: 1.1em;
    }

    .content .katex-display {
      margin: 1em 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.5em 0;
    }

    .content .katex-display > .katex {
      display: inline-block;
      white-space: nowrap;
      max-width: 100%;
      text-align: center;
    }

    .content .math-error {
      color: var(--error-color, #cb2431);
      background-color: rgba(203, 36, 49, 0.1);
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: monospace;
    }

    @media (prefers-color-scheme: dark) {
      .content .katex {
        color: var(--text-color);
      }
    }

    .actions {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
    }

    .btn {
      display: inline-block;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
      background-color: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      margin-right: 8px;
    }

    .btn:hover {
      background-color: var(--border-color);
      text-decoration: none;
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
      color: var(--secondary-text);
      font-size: 0.85em;
      text-align: center;
    }
    
    footer a {
      color: #77DD00;
      text-decoration: none;
    }

    @media (max-width: 600px) {
      .container {
        padding: 15px;
      }

      h1 {
        font-size: 1.5em;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        <span>Published: ${formattedPublished}</span>
        <span> • </span>
        <span>Updated: ${formattedUpdated}</span>
      </div>
    </header>
    
    <main class="content">
      ${content}
    </main>
    <footer>
      Published with <a target="_blank" href="https://github.com/IvanShishkin/obsidian-pub-plugin">Obsidian Publishing Plugin🍻</a>
    </footer>
  </div>
</body>
</html>`;
}

export function getPasswordPageTemplate(hash: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Required</title>
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #24292e;
      --secondary-text: #586069;
      --border-color: #e1e4e8;
      --error-color: #cb2431;
      --button-bg: #2ea44f;
      --button-hover: #2c974b;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --secondary-text: #8b949e;
        --border-color: #30363d;
        --error-color: #f85149;
        --button-bg: #238636;
        --button-hover: #2ea043;
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }

    .password-form {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }

    h2 {
      margin: 0 0 10px 0;
      font-size: 1.5em;
    }

    p {
      color: var(--secondary-text);
      margin: 0 0 24px 0;
    }

    .error {
      color: var(--error-color);
      background: rgba(203, 36, 49, 0.1);
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
    }

    input[type="password"] {
      width: 100%;
      padding: 10px 12px;
      font-size: 14px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-color);
      color: var(--text-color);
      margin-bottom: 16px;
      box-sizing: border-box;
    }

    input[type="password"]:focus {
      outline: none;
      border-color: var(--button-bg);
      box-shadow: 0 0 0 3px rgba(46, 164, 79, 0.3);
    }

    button {
      width: 100%;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      background-color: var(--button-bg);
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    button:hover {
      background-color: var(--button-hover);
    }

    button:active {
      transform: scale(0.98);
    }
  </style>
</head>
<body>
  <div class="password-form">
    <h2>🔒 Password Required</h2>
    <p>This publication is protected. Enter the password to view.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/p/${hash}/verify">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">Unlock</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}