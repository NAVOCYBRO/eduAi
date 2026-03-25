import { useState, useEffect } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { ChatTab } from './components/ChatTab';
import { StudyTab } from './components/StudyTab';

type Tab = 'chat' | 'study';

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('study');

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (sdkError) {
    return (
      <div className="app-loading">
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="loader">
          <div className="loader-ring"></div>
          <div className="loader-core"></div>
        </div>
        <h2>Initializing EduAI</h2>
        <p>Setting up AI engine...</p>
      </div>
    );
  }

  const accel = getAccelerationMode();

  return (
    <div className="app">
      <div className="bg-gradient"></div>
      <div className="bg-glow"></div>
      <div className="bg-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>
      <div className="bg-grid"></div>
      
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </span>
            <h1>EduAI</h1>
          </div>
          {accel && (
            <div className="accel-badge">
              <span className="accel-dot"></span>
              {accel === 'webgpu' ? 'WebGPU' : 'CPU'} Accelerated
            </div>
          )}
        </div>
      </header>

      <nav className="tab-bar">
        <button 
          className={`tab-btn ${activeTab === 'study' ? 'active' : ''}`} 
          onClick={() => setActiveTab('study')}
        >
          <span className="tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </span>
          <span className="tab-label">Study</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} 
          onClick={() => setActiveTab('chat')}
        >
          <span className="tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span className="tab-label">Chat</span>
        </button>
      </nav>

      <div className="app-content">
        <main className="tab-content">
          {activeTab === 'study' && <StudyTab />}
          {activeTab === 'chat' && <ChatTab />}
        </main>
      </div>
    </div>
  );
}
