'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Send, StopCircle, User, Bot, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TextareaAutosize from 'react-textarea-autosize';

interface Doc {
  pageContent?: string;
  metadata?: {
    loc?: {
      pageNumber?: number;
    };
    source?: string;
  };
}

interface IMessage {
  role: 'assistant' | 'user';
  content: string;
  documents?: Doc[];
}

const ChatComponent: React.FC = () => {
  const [message, setMessage] = React.useState<string>('');
  const [messages, setMessages] = React.useState<IMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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

  const handleSendChatMessage = async () => {
    if (!message.trim() || isStreaming) return;

    const userMessage = message.trim();
    setMessage('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    const apiKey = localStorage.getItem('gemini_api_key') || '';

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKey,
        },
        body: JSON.stringify({ message: userMessage }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`Error: ${res.statusText}`);
      }

      if (!res.body) throw new Error('No readable stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      // Add a placeholder assistant message
      setMessages((prev) => [...prev, { role: 'assistant', content: '', documents: [] }]);

      let currentDocs: Doc[] = [];

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkString = decoder.decode(value, { stream: true });
          const lines = chunkString.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '');
              try {
                const data = JSON.parse(dataStr);
                
                if (data.type === 'docs') {
                  currentDocs = data.data;
                  setMessages((prev) => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].documents = currentDocs;
                    return newMsgs;
                  });
                } else if (data.type === 'chunk') {
                  setMessages((prev) => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content += data.data;
                    return newMsgs;
                  });
                } else if (data.type === 'error') {
                   setMessages((prev) => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content += `\n\n**Error:** ${data.data}`;
                    return newMsgs;
                  });
                }
              } catch (e) {
                // Ignore incomplete JSON chunks (though our server sends complete JSON per line)
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error(err);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `**Error:** ${err.message}` },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 text-primary opacity-50" />
            <h2 className="text-xl font-semibold">How can I help you today?</h2>
            <p className="text-sm mt-2">Upload a PDF in the sidebar and ask me anything about it.</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-4 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
              )}
              
              <div
                className={`flex flex-col max-w-[80%] ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="prose prose-sm dark:prose-invert max-w-none break-words"
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>

                {/* Citations */}
                {msg.role === 'assistant' && msg.documents && msg.documents.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.documents.map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 text-xs bg-secondary/50 text-secondary-foreground px-2 py-1 rounded-md border"
                      >
                        <FileText className="h-3 w-3" />
                        <span>Page {doc.metadata?.loc?.pageNumber || 'Unknown'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t">
        <div className="relative flex items-end gap-2 bg-muted/50 rounded-2xl p-2 border focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
          <TextareaAutosize
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            className="flex-1 max-h-48 min-h-[44px] bg-transparent resize-none p-3 focus:outline-none"
            minRows={1}
            maxRows={6}
          />
          
          <div className="flex gap-2 shrink-0 p-1">
             {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="h-10 w-10 rounded-xl"
                onClick={handleStop}
              >
                <StopCircle className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={handleSendChatMessage}
                disabled={!message.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-center mt-2">
           <span className="text-xs text-muted-foreground">
             Press Enter to send, Shift + Enter for new line.
           </span>
        </div>
      </div>
    </div>
  );
};

export default ChatComponent;
