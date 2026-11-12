import { Check, Copy } from 'lucide-react'
import { memo, useRef, useState, type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { isSafeImage, isSafeLink, markdownUrlTransform } from '@/lib/safeUrl'
import { useT } from '@/lib/useT'

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return [copied, copy]
}

function CodeBlock({ children, ...rest }: ComponentProps<'pre'>) {
  const t = useT()
  const ref = useRef<HTMLPreElement>(null)
  const [copied, copy] = useCopy()
  const language = /language-([\w+-]+)/.exec(
    (children as { props?: { className?: string } } | undefined)?.props?.className ?? ''
  )?.[1]

  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex h-9 items-center justify-between border-b border-line pr-1.5 pl-3.5">
        <span className="font-mono text-xs text-ink-3">{language ?? t.chat.code}</span>
        <button
          type="button"
          onClick={() => copy(ref.current?.innerText ?? '')}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? t.common.actions.copied : t.common.actions.copy}
        </button>
      </div>
      <pre {...rest} ref={ref} className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

/** Uzak adresli resmin yerine yazılan not (bkz. lib/safeUrl) */
function BlockedImage({ alt }: { alt?: string }) {
  const t = useT()
  return <span className="text-[13px] text-ink-3 italic">{t.chat.imageBlocked(alt ?? '')}</span>
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        urlTransform={markdownUrlTransform}
        components={{
          pre: CodeBlock,
          img: ({ src, alt }) => (isSafeImage(src) ? <img src={src} alt={alt ?? ''} /> : <BlockedImage alt={alt} />),
          a: ({ children, href }) =>
            isSafeLink(href) ? (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
