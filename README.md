# EduAI Assistant

An AI-powered exam preparation assistant that runs entirely in your browser. All AI inference happens on-device using WebAssembly — no server, no API keys, and complete privacy.

## Problem It Solves

Students preparing for exams face several challenges:
- **Limited access to tutors** - Personal guidance is expensive and not always available
- **Inefficient study patterns** - Students don't know which topics to prioritize
- **Difficulty understanding concepts** - Complex explanations in textbooks are hard to grasp
- **Exam paper analysis** - Manually reviewing past papers is time-consuming
- **Voice-based learning** - Students who prefer speaking rather than typing are underserved

EduAI Assistant addresses these by providing an on-device AI tutor that can:
- Explain any topic in simple terms
- Analyze past exam papers for patterns and trends
- Predict likely exam questions based on historical data
- Track syllabus progress
- Support voice interactions for hands-free learning

## Target Users

- **Students preparing for exams** (high school, college, professional certifications)
- **Self-learners** who want AI-assisted study support
- **Teachers** looking for tools to demonstrate AI capabilities
- **Anyone wanting private, offline AI assistance** without sending data to external servers

## Features

| Tab | Description |
|-----|-------------|
| **Study** | AI tutor for explaining concepts, uploading exam papers (image/PDF), analyzing patterns, predicting questions, and tracking syllabus progress |
| **Voice Study** | Voice-enabled study assistant using speech-to-text, AI response, and text-to-speech |
| **Chat** | General conversational AI powered by on-device LLM |
| **Vision** | Point camera at objects and ask AI to describe what it sees |
| **Voice** | Voice chat with AI - speak naturally and hear responses |
| **Tools** | Additional AI utilities |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **AI Engine**: [RunAnywhere SDK](https://www.runanywhere.ai) (on-device WASM inference)
- **Models**:
  - LFM2 350M (LLM for text generation)
  - LFM2 1.2B Tool (LLM with tool calling)
  - LFM2-VL 450M (Vision Language Model)
  - Whisper Tiny (Speech-to-Text)
  - Piper TTS (Text-to-Speech)
  - Silero VAD (Voice Activity Detection)

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). On first use, models are downloaded and cached in the browser's Origin Private File System (OPFS).

## Project Structure

```
src/
├── main.tsx                 # React entry point
├── App.tsx                  # Main app with tab navigation
├── runanywhere.ts           # SDK initialization & model catalog
├── hooks/
│   └── useModelLoader.ts    # Model download/load hook
├── components/
│   ├── StudyTab.tsx         # Main study features
│   ├── VoiceStudyTab.tsx    # Voice-enabled study
│   ├── ChatTab.tsx          # General chat
│   ├── VisionTab.tsx        # Camera + VLM
│   ├── VoiceTab.tsx         # Voice pipeline
│   ├── ToolsTab.tsx         # AI tools
│   ├── VoiceStudyTab.tsx    # Voice study mode
│   └── ModelBanner.tsx      # Model loading UI
└── styles/
    └── index.css            # Styling
```

## Deployment

### Vercel (Recommended)

```bash
npm run build
npx vercel --prod
```

The included `vercel.json` configures required Cross-Origin-Isolation headers.

### Other Static Hosts

Serve with these headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## Browser Requirements

- Chrome 120+ or Edge 120+ (recommended)
- WebAssembly support
- SharedArrayBuffer (requires Cross-Origin Isolation headers)
- OPFS (for persistent model cache)
- WebGPU (optional, for faster inference)

## Documentation

- [RunAnywhere SDK Docs](https://docs.runanywhere.ai)
- [npm package](https://www.npmjs.com/package/@runanywhere/web)

## License

MIT
