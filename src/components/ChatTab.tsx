import { useState, useRef, useEffect, useCallback } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  stats?: { tokens: number; tokPerSec: number; latencyMs: number };
}

export function ChatTab() {
  const loader = useModelLoader(ModelCategory.Language);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;

    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setGenerating(true);

    const assistantIdx = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);

    try {
      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(text, {
        maxTokens: 512,
        temperature: 0.7,
      });
      cancelRef.current = cancel;

      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: 'assistant', text: accumulated };
          return updated;
        });
      }

      const result = await resultPromise;
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: 'assistant',
          text: result.text || accumulated,
          stats: {
            tokens: result.tokensUsed,
            tokPerSec: result.tokensPerSecond,
            latencyMs: result.latencyMs,
          },
        };
        return updated;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: 'assistant', text: `Error: ${msg}` };
        return updated;
      });
    } finally {
      cancelRef.current = null;
      setGenerating(false);
    }
  }, [input, generating, messages.length, loader]);

  const handleCancel = () => cancelRef.current?.();

  return (
    <div className="tab-panel chat-panel">
      <ModelBanner state={loader.state} progress={loader.progress} error={loader.error} onLoad={loader.ensure} label="LLM" />

      <div className="message-container" ref={listRef}>
        {messages.length === 0 && (
          <div className="welcome-state">
            <div className="welcome-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3>Start a conversation</h3>
            <p>Type a message below to chat with AI</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
            <div className="message-content">
              <div className="message-bubble">
                <p>{msg.text || '...'}</p>
              </div>
              {msg.stats && (
                <div className="message-meta">
                  {msg.stats.tokens} tokens · {msg.stats.tokPerSec.toFixed(1)} tok/s
                </div>
              )}
            </div>
          </div>
        ))}
        {generating && messages[messages.length - 1]?.text === '' && (
          <div className="message message-assistant">
            <div className="message-avatar">AI</div>
            <div className="message-content">
              <div className="message-bubble typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="input-area" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={generating}
          />
          {generating ? (
            <button type="button" className="stop-btn" onClick={handleCancel}>
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!input.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
