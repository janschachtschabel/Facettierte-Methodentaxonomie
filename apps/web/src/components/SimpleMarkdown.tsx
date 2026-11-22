import React, { useMemo } from 'react';
import { markdownToHtml, renderInlineMarkdownHtml } from '../planner/markdownMath.js';

export function SimpleMarkdown({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content, { mathOutput: 'htmlAndMathml' }), [content]);
  return <div className="md-view" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function InlineMarkdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderInlineMarkdownHtml(text, 'htmlAndMathml'), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
