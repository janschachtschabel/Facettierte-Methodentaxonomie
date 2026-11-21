import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] && m[3]) {
      parts.push(
        <a key={key++} href={m[3]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>
      );
    } else if (m[4]) {
      parts.push(<strong key={key++}>{m[4]}</strong>);
    } else if (m[5]) {
      parts.push(<code key={key++}>{m[5]}</code>);
    } else if (m[6]) {
      parts.push(<em key={key++}>{m[6]}</em>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listOrdered = false;
  let idx = 0;

  const flushList = () => {
    if (!listItems.length) return;
    elements.push(
      listOrdered ? (
        <ol key={`l-${idx++}`} style={{ paddingLeft: 20, margin: '6px 0 10px' }}>
          {listItems}
        </ol>
      ) : (
        <ul key={`l-${idx++}`} style={{ paddingLeft: 20, margin: '6px 0 10px' }}>
          {listItems}
        </ul>
      )
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h-${idx++}`} style={{ fontFamily: 'var(--display)', fontSize: 16.5, margin: '14px 0 4px' }}>
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h-${idx++}`} style={{ fontFamily: 'var(--display)', fontSize: 18.5, margin: '16px 0 6px', color: 'var(--dA)' }}>
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h3 key={`h-${idx++}`} style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '14px 0 6px' }}>
          {renderInline(line.slice(2))}
        </h3>
      );
    } else if (/^[-*]\s+/.test(line)) {
      if (listItems.length && listOrdered) flushList();
      listOrdered = false;
      listItems.push(
        <li key={`li-${idx++}`} style={{ marginBottom: 4 }}>
          {renderInline(line.replace(/^[-*]\s+/, ''))}
        </li>
      );
    } else if (/^\d+\.\s+/.test(line)) {
      if (listItems.length && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(
        <li key={`li-${idx++}`} style={{ marginBottom: 4 }}>
          {renderInline(line.replace(/^\d+\.\s+/, ''))}
        </li>
      );
    } else {
      flushList();
      elements.push(
        <p key={`p-${idx++}`} style={{ margin: '6px 0' }}>
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();

  return <div style={{ fontSize: 14.8, lineHeight: 1.55 }}>{elements}</div>;
}
