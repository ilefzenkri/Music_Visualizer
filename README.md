# Music Visualizer

A browser-based music visualizer that connects live audio analysis to a real-time animated Three.js scene.

The app uses the Web Audio API for FFT and waveform analysis, Tone.js for the built-in synth demo, and React/TypeScript for the interface. Audio energy drives the 3D output every animation frame: particles, rings, lights, camera movement, and mesh scale all respond to bass, mids, highs, and waveform data.

## Features

- Real-time 3D visualizer built with Three.js
- Tone.js demo synth source
- Audio file upload support
- Microphone input support
- Live meters for energy, bass, mids, highs, and waveform
- Controls for playback, sensitivity, and particle count
- Vite + React + TypeScript project setup

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL Vite prints in the terminal, usually:

```text
http://localhost:5173/
```

## Scripts

```bash
npm run dev
```

Runs the app locally with Vite.

```bash
npm run build
```

Type-checks the project and creates a production build in `dist/`.

```bash
npm run preview
```

Serves the production build locally.

## Audio Sources

- `Demo`: starts a Tone.js synth loop and visualizes its analyser output.
- `File`: upload an audio file from your machine and visualize playback.
- `Mic`: request microphone access and visualize live input.

Browser audio requires a user gesture, so press `Play` before the demo, file audio, or microphone input starts.
