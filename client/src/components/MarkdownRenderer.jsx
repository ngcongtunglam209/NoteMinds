import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown content with proper dark theme styling
 */
export default function MarkdownRenderer({ content, className = '' }) {
  const normalizedContent = typeof content === 'string'
    ? content
    : content == null
      ? ''
      : (() => {
        try {
          return typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
        } catch {
          return String(content);
        }
      })();

  // Pre-clean: fix empty list items and stray bullets
  const cleaned = normalizedContent
    .replace(/^([ \t]*[-*•])[ \t]*\n([ \t]*\S)/gm, '$1 $2')  // Merge lone bullet with next line content
    .replace(/^[\s]*[-*•][\s]*$/gm, '')   // Remove lines that are still just a bullet with nothing
    .replace(/\n{3,}/g, '\n\n')            // Collapse excessive blank lines
    .trim();

  return (
    <div className={`markdown-body ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4 text-txt">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3 text-txt">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 text-txt">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold mb-1.5 mt-2 text-txt">{children}</h4>,

        // Paragraph - skip empty ones
        p: ({ children }) => {
          const text = getTextContent(children);
          if (!text.trim()) return null;
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
        },

        // Lists
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-1">{children}</ol>,
        li: ({ children }) => {
          const text = getTextContent(children);
          if (!text.trim()) return null;
          return <li className="leading-relaxed">{children}</li>;
        },

        // Code
        code: ({ node, children, ...props }) => {
          const isBlock = node?.position?.start?.line !== node?.position?.end?.line
            || String(children).includes('\n');
          if (!isBlock) {
            return (
              <code className="bg-surface text-primary-300 px-1.5 py-0.5 rounded text-[13px] font-mono">
                {children}
              </code>
            );
          }
          return (
            <pre className="bg-bg border border-line rounded-lg p-3 mb-2 overflow-x-auto">
              <code className="text-[13px] font-mono text-txt leading-relaxed">
                {children}
              </code>
            </pre>
          );
        },

        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-primary-500 pl-3 my-2 text-muted italic">
            {children}
          </blockquote>
        ),

        // Table
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
        th: ({ children }) => (
          <th className="border border-line px-3 py-1.5 text-left font-semibold text-txt">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-line px-3 py-1.5 text-muted">{children}</td>
        ),

        // Links
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
            {children}
          </a>
        ),

        // Horizontal rule
        hr: () => <hr className="border-line my-3" />,

        // Strong / Em
        strong: ({ children }) => <strong className="font-semibold text-txt">{children}</strong>,
        em: ({ children }) => <em className="italic text-muted">{children}</em>,
      }}
    >
      {cleaned}
    </ReactMarkdown>
    </div>
  );
}

/**
 * Recursively extract plain text from React children
 */
function getTextContent(children) {
  if (!children) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children?.props?.children) return getTextContent(children.props.children);
  return '';
}
