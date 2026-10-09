'use client';

import * as React from 'react';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Send, StopCircle, User, Bot, FileText, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TextareaAutosize from 'react-textarea-autosize';

interface Doc {
  pageContent?: string;
  metadata?: {
    loc?: { pageNumber?: number };
    source?: string;
  };
}

interface IMessage {
  role: 'assistant' | 'user';
  content: string;
  documents?: Doc[];
}

/* ── Empty state prompt chips ────────────────────────────────────────── */
const SAMPLE_PROMPTS = [
  'Summarize the key points of this document',
  'What are the main conclusions?',
  'List all action items mentioned',
  'Explain the methodology used',
];

const ChatComponent: React.FC = () => {
  const { user } = useUser();
  const [message, setMessage] = React.useState<string>('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const sseBufferRef = React.useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage = text.trim();
    setMessage('');

    const newUserMsg: IMessage = { role: 'user', content: userMessage };
    setMessages((prev) => [...prev, newUserMsg]);
    setIsStreaming(true);

    const apiKey = localStorage.getItem('gemini_api_key') || '';
    sseBufferRef.current = '';

    const historySnapshot = messages.map((m) => ({ role: m.role, content: m.content }));
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-gemini-api-key': apiKey,
            'x-user-id': user?.id ?? 'anonymous',
          },
          body: JSON.stringify({ message: userMessage, history: historySnapshot }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Server error ${res.status}: ${errorText}`);
      }

      if (!res.body) throw new Error('No readable stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      setMessages((prev) => [...prev, { role: 'assistant', content: '', documents: [] }]);

      const processSSEChunk = (raw: string) => {
        sseBufferRef.current += raw;
        const events = sseBufferRef.current.split('\n\n');
        sseBufferRef.current = events.pop() ?? '';

        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'docs') {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], documents: data.data };
                  return next;
                });
              } else if (data.type === 'chunk') {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    content: next[next.length - 1].content + data.data,
                  };
                  return next;
                });
              } else if (data.type === 'error') {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    content: next[next.length - 1].content + `\n\n**Error:** ${data.data}`,
                  };
                  return next;
                });
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      };

      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) processSSEChunk(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        console.error(err);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Error:** ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendChatMessage = () => sendMessage(message);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

  const lastIdx = messages.length - 1;

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto">

      {/* ── Messages Area ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">

        {messages.length === 0 ? (
          /* ── Empty / Welcome state ────────────────────── */
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center px-4">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <Zap className="h-2.5 w-2.5 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold gradient-text">How can I help you?</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Upload a PDF in the sidebar, then ask me anything about its contents.
                </p>
              </div>
            </div>

            {/* Prompt chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="group text-left px-4 py-3 rounded-xl text-sm
                    bg-card/60 border border-border/60
                    text-muted-foreground hover:text-foreground
                    hover:border-primary/40 hover:bg-primary/5
                    transition-all duration-200 backdrop-blur-sm"
                >
                  <span className="line-clamp-2">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message list ─────────────────────────────── */
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 msg-animate ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {/* Bot avatar */}
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}

              <div className={`flex flex-col max-w-[78%] gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                {/* Bubble */}
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-primary/20'
                      : 'bg-card/80 backdrop-blur-sm border border-border/60 rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div
                      className={`prose prose-sm prose-chat max-w-none break-words ${
                        isStreaming && index === lastIdx ? 'typing-cursor' : ''
                      }`}
                    >
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Thinking…</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Citations */}
                {msg.role === 'assistant' && msg.documents && msg.documents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.documents.map((doc, idx) => (
                      <div
                        key={idx}
                        title={doc.metadata?.source}
                        className="flex items-center gap-1.5 text-[11px]
                          bg-secondary/50 border border-border/50
                          text-muted-foreground px-2 py-1 rounded-lg
                          hover:border-primary/30 hover:text-foreground
                          transition-colors cursor-default"
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="max-w-[160px] truncate">
                          {doc.metadata?.source ? `${doc.metadata.source} · ` : ''}
                          p.{doc.metadata?.loc?.pageNumber ?? '?'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* User avatar */}
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-primary/30">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2">
        <div className="input-glow relative flex items-end gap-2 bg-card/70 backdrop-blur-md rounded-2xl p-2 border border-border/60 transition-all duration-200">
          <TextareaAutosize
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your documents…"
            className="flex-1 max-h-48 min-h-[44px] bg-transparent resize-none px-3 py-2.5
              text-sm text-foreground placeholder:text-muted-foreground/50
              focus:outline-none leading-relaxed"
            minRows={1}
            maxRows={6}
          />

          <div className="shrink-0 pb-1 pr-1">
            {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="h-9 w-9 rounded-xl shadow-sm"
                onClick={handleStop}
                title="Stop generation"
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 rounded-xl shadow-sm shadow-primary/30
                  bg-primary hover:bg-primary/90 transition-all duration-200
                  disabled:opacity-30"
                onClick={handleSendChatMessage}
                disabled={!message.trim()}
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="text-center mt-2 text-[11px] text-muted-foreground/60">
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border/50 font-mono text-[10px]">Enter</kbd>
          {' '}to send · {' '}
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary/60 border border-border/50 font-mono text-[10px]">Shift+Enter</kbd>
          {' '}for new line
        </p>
      </div>
    </div>
  );
};

export default ChatComponent;
