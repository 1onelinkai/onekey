import React, { useMemo } from 'react';
import { highlightConfig } from './config-highlight.mjs';

export default function ConfigCode({ content = '', format, path, query = '', codeRef, className = '' }) {
  const lines = useMemo(() => highlightConfig(content, format, path), [content, format, path]);
  const rawLines = useMemo(() => content.split('\n'), [content]);
  return <pre className={'config-file-code ' + className} ref={codeRef} aria-label="配置文件内容">
    {content ? lines.map((html, index) => <span className={'config-code-line' + (query && rawLines[index].toLowerCase().includes(query.toLowerCase()) ? ' config-line-match' : '')} key={index}>
      <span className="config-line-number" aria-hidden="true">{index + 1}</span>
      <code dangerouslySetInnerHTML={{ __html: html || ' ' }} />
    </span>) : <span className="config-empty-file">文件内容为空</span>}
  </pre>;
}
