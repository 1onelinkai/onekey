import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import ini from 'highlight.js/lib/languages/ini';
import yaml from 'highlight.js/lib/languages/yaml';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('json', json);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('plaintext', plaintext);

export function configLanguage(format = '', path = '') {
  const extension = (format || path.split('.').pop() || '').toLowerCase();
  return ({ json: 'json', jsonc: 'javascript', json5: 'javascript', toml: 'ini', ini: 'ini', env: 'ini', yaml: 'yaml', yml: 'yaml' })[extension] || 'plaintext';
}

// Reopen multiline tokens on each row so line numbers and search stay aligned.
export function highlightConfig(content, format, path) {
  const html = hljs.highlight(content, { language: configLanguage(format, path), ignoreIllegals: true }).value;
  const lines = [];
  const opened = [];
  let row = '';
  let start = 0;
  for (const match of html.matchAll(/<span class="[^"]+">|<\/span>|\n/g)) {
    row += html.slice(start, match.index);
    if (match[0] === '\n') {
      lines.push(row + '</span>'.repeat(opened.length));
      row = opened.join('');
    } else {
      row += match[0];
      if (match[0] === '</span>') opened.pop();
      else opened.push(match[0]);
    }
    start = match.index + match[0].length;
  }
  lines.push(row + html.slice(start));
  return lines;
}
