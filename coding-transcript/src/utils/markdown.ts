import { marked } from 'marked';
import Prism from 'prismjs';

// Common Prism components
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

// Configure marked to use Prism
marked.setOptions({
  gfm: true,
  breaks: true,
});

export function highlightCode(code: string, lang = ''): string {
  if (!code) return '';
  const cleanLang = lang.trim().toLowerCase();
  const grammar = Prism.languages[cleanLang] || Prism.languages.text;
  try {
    return Prism.highlight(code, grammar || Prism.languages.text, cleanLang || 'text');
  } catch (err) {
    return escapeHtml(code);
  }
}

export function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    const rawHtml = marked.parse(content) as string;
    // Replace code blocks with highlighted ones
    return rawHtml.replace(/<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/gi, (match, lang, code) => {
      const decoded = unescapeHtml(code);
      const highlighted = highlightCode(decoded, lang);
      return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
    });
  } catch (err) {
    return `<div class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(content)}</div>`;
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

export function formatDateTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' (' + date.toLocaleDateString() + ')';
  } catch {
    return isoStr;
  }
}

export function formatNumber(num?: number): string {
  if (num == null) return '0';
  return num.toLocaleString();
}
