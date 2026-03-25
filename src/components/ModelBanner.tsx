import type { LoaderState } from '../hooks/useModelLoader';

interface Props {
  state: LoaderState;
  progress: number;
  error: string | null;
  onLoad: () => void;
  label: string;
}

export function ModelBanner({ state, progress, error, onLoad, label }: Props) {
  if (state === 'ready') return null;

  return (
    <div className="model-banner">
      {state === 'idle' && (
        <>
          <span>No {label} model loaded.</span>
          <button className="banner-btn" onClick={onLoad}>Download &amp; Load</button>
        </>
      )}
      {state === 'downloading' && (
        <>
          <span>Downloading {label} model... {(progress * 100).toFixed(0)}%</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      )}
      {state === 'loading' && <span>Loading {label} model...</span>}
      {state === 'error' && (
        <>
          <span className="error-text">Error: {error}</span>
          <button className="banner-btn" onClick={onLoad}>Retry</button>
        </>
      )}
    </div>
  );
}
