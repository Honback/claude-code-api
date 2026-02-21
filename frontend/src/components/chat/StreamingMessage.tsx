import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  content: string;
}

export default function StreamingMessage({ content }: Props) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-gray-700 text-gray-100">
        <MarkdownRenderer content={content} />
        <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
      </div>
    </div>
  );
}
