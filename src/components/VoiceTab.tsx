import { useState, useRef, useCallback, useEffect } from 'react';
import { VoicePipeline, ModelCategory, ModelManager, AudioCapture, AudioPlayback, PipelineState } from '@runanywhere/web';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';

type VoiceState = 'idle' | 'loading-models' | 'listening' | 'processing' | 'speaking' | 'error';

const SYSTEM_PROMPT = 'You are a helpful voice assistant. Keep responses concise — 1-2 sentences max.';

export function VoiceTab() {
  const llmLoader = useModelLoader(ModelCategory.Language, true);
  const sttLoader = useModelLoader(ModelCategory.SpeechRecognition, true);
  const ttsLoader = useModelLoader(ModelCategory.SpeechSynthesis, true);
  const vadLoader = useModelLoader(ModelCategory.Audio, true);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const pipelineRef = useRef<VoicePipeline | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  const stopAll = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording]);

  const ensureModels = useCallback(async (): Promise<boolean> => {
    setVoiceState('loading-models');
    setError(null);

    const loaders = [
      { label: 'VAD', loader: vadLoader, required: true },
      { label: 'STT', loader: sttLoader, required: true },
      { label: 'LLM', loader: llmLoader, required: true },
      { label: 'TTS', loader: ttsLoader, required: true },
    ];

    for (const { label, loader, required } of loaders) {
      if (loader.state !== 'ready') {
        const ok = await loader.ensure();
        if (!ok && required) {
          setError(`Failed to load ${label} model: ${loader.error || 'Unknown error'}`);
          setVoiceState('error');
          return false;
        }
      }
    }

    setVoiceState('idle');
    return true;
  }, [vadLoader, sttLoader, llmLoader, ttsLoader]);

  const checkModelsLoaded = useCallback((): boolean => {
    return !!(
      ModelManager.getLoadedModel(ModelCategory.Audio) &&
      ModelManager.getLoadedModel(ModelCategory.SpeechRecognition) &&
      ModelManager.getLoadedModel(ModelCategory.Language) &&
      ModelManager.getLoadedModel(ModelCategory.SpeechSynthesis)
    );
  }, []);

  const resampleAudio = (audioData: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate) return audioData;
    const ratio = fromRate / toRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      result[i] = audioData[Math.round(i * ratio)];
    }
    return result;
  };

  const startListening = useCallback(async () => {
    setTranscript('');
    setResponse('');
    setError(null);

    if (!checkModelsLoaded()) {
      const ok = await ensureModels();
      if (!ok) return;
    }

    try {
      setVoiceState('listening');

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const sourceSampleRate = audioContext.sampleRate;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      setIsRecording(true);
      updateAudioLevel();

      if (!pipelineRef.current) {
        pipelineRef.current = new VoicePipeline();
      }

      const audioBuffer: Float32Array[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const arrayBuffer = await event.data.arrayBuffer();
          const audioData = await audioContext.decodeAudioData(arrayBuffer);
          const channelData = audioData.getChannelData(0);
          const resampled = resampleAudio(channelData, sourceSampleRate, 16000);
          audioBuffer.push(resampled);
        }
      };

      recorder.onstop = async () => {
        if (audioBuffer.length === 0) {
          setVoiceState('idle');
          stopAll();
          return;
        }

        const combinedAudio = new Float32Array(audioBuffer.reduce((acc, arr) => acc + arr.length, 0));
        let offset = 0;
        for (const arr of audioBuffer) {
          combinedAudio.set(arr, offset);
          offset += arr.length;
        }

        await processAudio(combinedAudio);
      };

      recorder.start(100);

      const stopRecording = () => {
        recorder.stop();
      };

      (window as unknown as { stopRecording: () => void }).stopRecording = stopRecording;

      setTimeout(() => {
        if (isRecording) {
          stopRecording();
        }
      }, 10000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setVoiceState('error');
      stopAll();
    }
  }, [ensureModels, checkModelsLoaded, stopAll, updateAudioLevel, isRecording]);

  const processAudio = useCallback(async (audioData: Float32Array) => {
    const pipeline = pipelineRef.current;
    if (!pipeline) {
      setError('Voice pipeline not initialized');
      setVoiceState('error');
      return;
    }

    stopAll();
    setVoiceState('processing');

    try {
      const result = await pipeline.processTurn(audioData, {
        maxTokens: 80,
        temperature: 0.7,
        systemPrompt: SYSTEM_PROMPT,
      }, {
        onTranscription: (text) => {
          setTranscript(text);
        },
        onResponseToken: (_token, accumulated) => {
          setResponse(accumulated);
        },
        onResponseComplete: (text) => {
          setResponse(text);
        },
        onSynthesisComplete: async (audio, sampleRate) => {
          setVoiceState('speaking');
          try {
            const player = new AudioPlayback({ sampleRate });
            await player.play(audio, sampleRate);
            player.dispose();
          } catch (e) {
            console.error('Playback error:', e);
          }
        },
        onStateChange: (state) => {
          switch (state) {
            case PipelineState.ProcessingSTT:
              setVoiceState('processing');
              break;
            case PipelineState.GeneratingResponse:
              setVoiceState('processing');
              break;
            case PipelineState.PlayingTTS:
              setVoiceState('speaking');
              break;
            case PipelineState.Idle:
              setVoiceState('idle');
              break;
          }
        },
      });

      if (result) {
        setTranscript(result.transcription);
        setResponse(result.response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Processing error: ${msg}`);
      setVoiceState('error');
    }

    setVoiceState('idle');
  }, [stopAll]);

  const stopListening = useCallback(() => {
    stopAll();
    setVoiceState('idle');
    
    if (typeof (window as unknown as { stopRecording?: () => void }).stopRecording === 'function') {
      (window as unknown as { stopRecording?: () => void }).stopRecording?.();
    }
  }, [stopAll]);

  const pendingLoaders = [
    { label: 'VAD', loader: vadLoader },
    { label: 'STT', loader: sttLoader },
    { label: 'LLM', loader: llmLoader },
    { label: 'TTS', loader: ttsLoader },
  ].filter((l) => l.loader.state !== 'ready');

  return (
    <div className="tab-panel voice-panel">
      {pendingLoaders.length > 0 && voiceState === 'idle' && (
        <ModelBanner
          state={pendingLoaders[0].loader.state}
          progress={pendingLoaders[0].loader.progress}
          error={pendingLoaders[0].loader.error}
          onLoad={ensureModels}
          label={`Voice (${pendingLoaders.map((l) => l.label).join(', ')})`}
        />
      )}

      {error && (
        <div className="model-banner">
          <span className="error-text">{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="voice-center">
        <div 
          className="voice-orb" 
          data-state={voiceState} 
          style={{ '--level': audioLevel } as React.CSSProperties}
        >
          <div className="voice-orb-inner" />
        </div>

        <p className="voice-status">
          {voiceState === 'idle' && 'Tap to start listening'}
          {voiceState === 'loading-models' && 'Loading models...'}
          {voiceState === 'listening' && 'Listening... speak now'}
          {voiceState === 'processing' && 'Processing...'}
          {voiceState === 'speaking' && 'Speaking...'}
          {voiceState === 'error' && 'Error occurred'}
        </p>

        {voiceState === 'idle' || voiceState === 'loading-models' ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={startListening}
            disabled={voiceState === 'loading-models'}
          >
            Start Listening
          </button>
        ) : voiceState === 'listening' ? (
          <button className="btn btn-lg" onClick={stopListening}>
            Stop
          </button>
        ) : null}
      </div>

      {transcript && (
        <div className="voice-transcript">
          <h4>You said:</h4>
          <p>{transcript}</p>
        </div>
      )}

      {response && (
        <div className="voice-response">
          <h4>AI response:</h4>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
