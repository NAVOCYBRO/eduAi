import { useState, useRef, useEffect, useCallback } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration, VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  type?: 'study' | 'analysis' | 'prediction' | 'explanation';
  imageUrl?: string;
  stats?: { tokens: number; tokPerSec: number; latencyMs: number };
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  url: string;
  extractedText?: string;
}

const SYSTEM_PROMPTS = {
  study: `You are an expert educational tutor. Provide clear, helpful responses with examples.`,
  analysis: `You are an expert at analyzing examination patterns. Provide structured insights.`,
  prediction: `You are an expert at predicting exam questions. Give confident predictions with reasoning.`,
  explanation: `You excel at simplifying complex concepts with everyday examples.`,
  imageAnalysis: `You are an expert at analyzing exam papers from images.`,
  worldBetter: `You are a thoughtful assistant. Answer questions about who will make the world better with balanced perspectives. Focus on how anyone can contribute to making the world better through their actions, choices, and efforts.`
};

export function StudyTab() {
  const loader = useModelLoader(ModelCategory.Language);
  const vlmLoader = useModelLoader(ModelCategory.Multimodal);
  const [activeFeature, setActiveFeature] = useState<'study' | 'analyze' | 'predict' | 'explain' | 'upload' | 'worldBetter'>('study');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [processingFile, setProcessingFile] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const getSystemPrompt = useCallback(() => {
    switch (activeFeature) {
      case 'study': return SYSTEM_PROMPTS.study;
      case 'analyze': return SYSTEM_PROMPTS.analysis;
      case 'predict': return SYSTEM_PROMPTS.prediction;
      case 'explain': return SYSTEM_PROMPTS.explanation;
      case 'upload': return SYSTEM_PROMPTS.imageAnalysis;
      case 'worldBetter': return SYSTEM_PROMPTS.worldBetter;
      default: return SYSTEM_PROMPTS.study;
    }
  }, [activeFeature]);

  const extractTextFromImage = async (imageData: ImageData, width: number, height: number): Promise<string> => {
    const bridge = VLMWorkerBridge.shared;
    if (!bridge.isModelLoaded) {
      if (vlmLoader.state !== 'ready') {
        const ok = await vlmLoader.ensure();
        if (!ok) throw new Error('VLM model failed to load');
      }
      if (!bridge.isModelLoaded) throw new Error('VLM model not loaded');
    }
    const rgbaData = imageData.data;
    const rgbData = new Uint8Array(width * height * 3);
    let rgbIndex = 0;
    for (let i = 0; i < rgbaData.length; i += 4) {
      rgbData[rgbIndex++] = rgbaData[i];
      rgbData[rgbIndex++] = rgbaData[i + 1];
      rgbData[rgbIndex++] = rgbaData[i + 2];
    }
    const result = await bridge.process(rgbData, width, height, 'Read all text visible in this image.', { maxTokens: 600, temperature: 0.2 });
    return result.text;
  };

  const enhanceImage = (ctx: CanvasRenderingContext2D, width: number, height: number): ImageData => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const contrast = 1.3;
      const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
      data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
    return imageData;
  };

  const processImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const url = e.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Could not get canvas context')); return; }
          const maxSize = 1024;
          let width = img.width, height = img.height;
          if (width > height && width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
          else if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
          canvas.width = width; canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = enhanceImage(ctx, width, height);
          try {
            const extractedText = await extractTextFromImage(imageData, width, height);
            resolve(extractedText);
          } catch (err) { reject(err); }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (validFiles.length === 0) { alert('Please upload an image or PDF file'); return; }
    setProcessingFile(true);
    if (vlmLoader.state !== 'ready') {
      const ok = await vlmLoader.ensure();
      if (!ok) { setProcessingFile(false); throw new Error('Failed to load VLM model'); }
    }
    try {
      for (const file of validFiles) {
        const isImage = file.type.startsWith('image/');
        if (isImage) {
          const reader = new FileReader();
          const imageUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const extractedText = await processImageFile(file);
          setUploadedFiles(prev => [...prev, { id: Date.now().toString() + Math.random(), name: file.name, type: 'image', url: imageUrl, extractedText }]);
          if (extractedText) {
            setExtractedQuestions(prev => [...prev, extractedText]);
            setMessages(prev => [...prev, { role: 'user', text: `Uploaded: ${file.name}\n\n${extractedText}`, imageUrl, type: 'study' }]);
          }
        } else {
          const reader = new FileReader();
          const pdfUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          setMessages(prev => [...prev, { role: 'user', text: `PDF uploaded: ${file.name}`, type: 'study' }]);
          setUploadedFiles(prev => [...prev, { id: Date.now().toString() + Math.random(), name: file.name, type: 'pdf', url: pdfUrl }]);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'study' }]);
    } finally {
      setProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [vlmLoader]);

  const analyzeUploadedFiles = useCallback(async () => {
    if (extractedQuestions.length === 0) { alert('Upload papers first'); return; }
    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }
    const { ModelManager, ModelCategory } = await import('@runanywhere/web');
    if (!ModelManager.getLoadedModel(ModelCategory.Language)) return;
    setGenerating(true);
    const combinedText = extractedQuestions.join('\n\n---\n\n');
    try {
      const result = await TextGeneration.generate(`Analyze these exam questions:\n\n${combinedText}`, { maxTokens: 800, temperature: 0.5, systemPrompt: SYSTEM_PROMPTS.analysis });
      setMessages(prev => [...prev, { role: 'assistant', text: result.text, type: 'analysis', stats: { tokens: result.tokensUsed, tokPerSec: result.tokensPerSecond, latencyMs: result.latencyMs } }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Unknown'}`, type: 'analysis' }]);
    } finally {
      setGenerating(false);
    }
  }, [loader, extractedQuestions]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;
    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text, type: 'study' }]);
    setGenerating(true);
    const assistantIdx = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', text: '', type: 'study' }]);
    try {
      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(text, { maxTokens: 800, temperature: 0.7, systemPrompt: getSystemPrompt() });
      cancelRef.current = cancel;
      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
        setMessages((prev) => { const updated = [...prev]; updated[assistantIdx] = { role: 'assistant', text: accumulated, type: 'study' }; return updated; });
      }
      const result = await resultPromise;
      setMessages((prev) => { const updated = [...prev]; updated[assistantIdx] = { role: 'assistant', text: result.text || accumulated, type: 'study', stats: { tokens: result.tokensUsed, tokPerSec: result.tokensPerSecond, latencyMs: result.latencyMs } }; return updated; });
    } catch (err) {
      setMessages((prev) => { const updated = [...prev]; updated[assistantIdx] = { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : String(err)}` }; return updated; });
    } finally {
      cancelRef.current = null;
      setGenerating(false);
    }
  }, [input, generating, messages.length, loader, getSystemPrompt]);

  const handleCancel = () => cancelRef.current?.();

  return (
    <div className="tab-panel study-panel">
      <ModelBanner state={loader.state} progress={loader.progress} error={loader.error} onLoad={loader.ensure} label="Study AI" />

      <div className="feature-nav">
        {[
          { id: 'study', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z', label: 'Study' },
          { id: 'upload', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', label: 'Upload' },
          { id: 'explain', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', label: 'Explain' },
          { id: 'worldBetter', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'World Better' },
        ].map(f => (
          <button key={f.id} className={`feature-nav-btn ${activeFeature === f.id ? 'active' : ''}`} onClick={() => setActiveFeature(f.id as typeof activeFeature)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={f.icon} />
            </svg>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {activeFeature === 'study' && (
        <>
          <div className="message-container" ref={listRef}>
            {messages.length === 0 && (
              <div className="welcome-state">
                <div className="welcome-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3>What would you like to learn?</h3>
                <p>Ask questions, get explanations, or upload your study materials</p>
                <div className="quick-pills">
                  <button className="quick-pill" onClick={() => setInput('Explain this concept simply')}>Explain a concept</button>
                  <button className="quick-pill" onClick={() => setInput('Help me understand this topic')}>Understand topic</button>
                  <button className="quick-pill" onClick={() => setActiveFeature('upload')}>Upload papers</button>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.role}`}>
                <div className="message-avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                <div className="message-content">
                  <div className="message-bubble">
                    {msg.imageUrl && <img src={msg.imageUrl} alt="Uploaded" className="msg-image" />}
                    <p>{msg.text || <span className="typing-dot">...</span>}</p>
                  </div>
                  {msg.stats && <div className="message-meta">{msg.stats.tokens} tokens · {msg.stats.tokPerSec.toFixed(1)} tok/s</div>}
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
              <input type="text" placeholder="Ask anything..." value={input} onChange={(e) => setInput(e.target.value)} disabled={generating} />
              <button type="submit" className="send-btn" disabled={!input.trim() || generating}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
              {generating && (
                <button type="button" className="stop-btn" onClick={handleCancel}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {activeFeature === 'upload' && (
        <div className="upload-container">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileUpload} multiple style={{ display: 'none' }} />
          
          <div className={`upload-zone ${processingFile ? 'processing' : ''}`} onClick={() => !processingFile && fileInputRef.current?.click()}>
            {processingFile ? (
              <div className="upload-processing">
                <div className="upload-spinner"></div>
                <p>Processing...</p>
              </div>
            ) : (
              <>
                <div className="upload-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <h4>Drop files or click to upload</h4>
                <p>Images (JPG, PNG) or PDF</p>
              </>
            )}
          </div>

          {uploadedFiles.length > 0 && (
            <div className="files-preview">
              <div className="files-grid">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="file-card">
                    <div className="file-thumb">
                      {file.type === 'image' ? <img src={file.url} alt={file.name} /> : <span className="pdf-icon">PDF</span>}
                    </div>
                    <p className="file-name">{file.name}</p>
                    {file.extractedText && <span className="extracted-badge">Extracted</span>}
                  </div>
                ))}
              </div>
              <button className="analyze-btn" onClick={analyzeUploadedFiles} disabled={extractedQuestions.length === 0 || generating}>
                {generating ? 'Analyzing...' : 'Analyze Papers'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeFeature === 'explain' && (
        <>
          <div className="message-container" ref={listRef}>
            {messages.length === 0 && (
              <div className="welcome-state">
                <div className="welcome-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3>Simple Explanations</h3>
                <p>Enter any concept for a beginner-friendly explanation</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.role}`}>
                <div className="message-avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                <div className="message-content">
                  <div className="message-bubble"><p>{msg.text || '...'}</p></div>
                </div>
              </div>
            ))}
          </div>
          <form className="input-area" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="input-wrapper">
              <input type="text" placeholder="What concept to explain?" value={input} onChange={(e) => setInput(e.target.value)} disabled={generating} />
              <button type="submit" className="send-btn" disabled={!input.trim() || generating}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </form>
        </>
      )}

      {activeFeature === 'worldBetter' && (
        <>
          <div className="message-container" ref={listRef}>
            {messages.length === 0 && (
              <div className="welcome-state">
                <div className="welcome-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3>Who Will Make the World Better?</h3>
                <p>Ask questions about how people can make the world a better place</p>
                <div className="quick-pills">
                  <button className="quick-pill" onClick={() => setInput('Who will make the world better?')}>Who will make it better?</button>
                  <button className="quick-pill" onClick={() => setInput('How can I make the world a better place?')}>How can I help?</button>
                  <button className="quick-pill" onClick={() => setInput('What can young people do to improve the world?')}>What can youth do?</button>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.role}`}>
                <div className="message-avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                <div className="message-content">
                  <div className="message-bubble"><p>{msg.text || '...'}</p></div>
                </div>
              </div>
            ))}
          </div>
          <form className="input-area" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="input-wrapper">
              <input type="text" placeholder="Ask about making the world better..." value={input} onChange={(e) => setInput(e.target.value)} disabled={generating} />
              <button type="submit" className="send-btn" disabled={!input.trim() || generating}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
