import Markdown from 'react-markdown';

export function StoryMarkdown({ text, className }: { text: string; className: string }) {
  return (
    <div className={`${className} wrap-anywhere [&_p]:whitespace-pre-line [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ms-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_code]:font-mono [&_code]:text-[0.9em] [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold`}>
      <Markdown skipHtml disallowedElements={['a', 'img', 'blockquote']} unwrapDisallowed>
        {text}
      </Markdown>
    </div>
  );
}
