import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Disc3, Mic, Pause, Play, SlidersHorizontal, Upload, Waves } from "lucide-react";
import * as Tone from "tone";
import * as THREE from "three";

type SourceMode = "demo" | "file" | "mic";

type AudioMetrics = {
  energy: number;
  bass: number;
  mids: number;
  highs: number;
  waveform: number;
};

const initialMetrics: AudioMetrics = {
  energy: 0,
  bass: 0,
  mids: 0,
  highs: 0,
  waveform: 0,
};

const bandAverage = (data: Uint8Array, start: number, end: number) => {
  let total = 0;
  const safeEnd = Math.min(end, data.length);
  for (let index = start; index < safeEnd; index += 1) {
    total += data[index];
  }
  return total / Math.max(1, safeEnd - start) / 255;
};

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | Tone.Analyser | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const toneNodesRef = useRef<{ synth: Tone.PolySynth; loop: Tone.Loop; analyser: Tone.Analyser } | null>(null);
  const frameMetricsRef = useRef<AudioMetrics>(initialMetrics);
  const fileUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<SourceMode>("demo");
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState("Tone pulse demo");
  const [sensitivity, setSensitivity] = useState(1.15);
  const [particleCount, setParticleCount] = useState(1400);
  const [metrics, setMetrics] = useState<AudioMetrics>(initialMetrics);

  const cleanupExternalSources = useCallback(() => {
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopTone = useCallback(() => {
    Tone.Transport.stop();
    toneNodesRef.current?.loop.stop();
    toneNodesRef.current?.synth.releaseAll();
  }, []);

  const buildToneDemo = useCallback(async () => {
    await Tone.start();
    if (!toneNodesRef.current) {
      const analyser = new Tone.Analyser("fft", 512);
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth" },
        envelope: { attack: 0.02, decay: 0.16, sustain: 0.45, release: 0.7 },
      }).connect(analyser);
      analyser.toDestination();

      const notes = ["C2", "G2", "Bb2", "Eb3", "G3", "C4"];
      let cursor = 0;
      const loop = new Tone.Loop((time) => {
        const root = notes[cursor % notes.length];
        const fifth = notes[(cursor + 1) % notes.length];
        synth.triggerAttackRelease([root, fifth], "8n", time);
        cursor += 1;
      }, "8n");

      toneNodesRef.current = { synth, loop, analyser };
    }

    cleanupExternalSources();
    audioRef.current?.pause();
    analyserRef.current = toneNodesRef.current.analyser;
    toneNodesRef.current.loop.start(0);
    Tone.Transport.bpm.value = 108;
    Tone.Transport.start();
  }, [cleanupExternalSources]);

  const ensureAudioContext = useCallback(() => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor();
    }
    return audioContextRef.current;
  }, []);

  const buildMediaAnalyser = useCallback(
    async (source: "file" | "mic", stream?: MediaStream) => {
      stopTone();
      cleanupExternalSources();
      const context = ensureAudioContext();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;

      if (source === "file" && audioRef.current) {
        if (!mediaElementSourceRef.current) {
          mediaElementSourceRef.current = context.createMediaElementSource(audioRef.current);
        }
        sourceRef.current = mediaElementSourceRef.current;
        sourceRef.current.connect(analyser);
        analyser.connect(context.destination);
      }

      if (source === "mic" && stream) {
        streamRef.current = stream;
        sourceRef.current = context.createMediaStreamSource(stream);
        sourceRef.current.connect(analyser);
      }

      analyserRef.current = analyser;
    },
    [cleanupExternalSources, ensureAudioContext, stopTone],
  );

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopTone();
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (mode === "demo") {
      await buildToneDemo();
    }

    if (mode === "file" && audioRef.current) {
      if (!(analyserRef.current instanceof AnalyserNode)) {
        await buildMediaAnalyser("file");
      }
      await audioRef.current.play();
    }

    if (mode === "mic") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await buildMediaAnalyser("mic", stream);
    }

    setIsPlaying(true);
  }, [buildMediaAnalyser, buildToneDemo, isPlaying, mode, stopTone]);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !audioRef.current) {
        return;
      }

      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
      }
      fileUrlRef.current = URL.createObjectURL(file);
      audioRef.current.src = fileUrlRef.current;
      audioRef.current.loop = true;
      setTrackName(file.name.replace(/\.[^.]+$/, ""));
      setMode("file");
      setIsPlaying(false);
      analyserRef.current = null;
      stopTone();
      cleanupExternalSources();
    },
    [cleanupExternalSources, stopTone],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060b, 0.028);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 1.4, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x05060b);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const ringGeometry = new THREE.TorusGeometry(2.2, 0.045, 16, 180);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x6df7c1,
      emissive: 0x174837,
      roughness: 0.32,
      metalness: 0.55,
    });
    const rings = Array.from({ length: 5 }, (_, index) => {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + index * 0.14;
      ring.rotation.z = index * 0.34;
      ring.scale.setScalar(1 + index * 0.28);
      group.add(ring);
      return ring;
    });

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffd36e,
        emissive: 0x5d3516,
        roughness: 0.18,
        metalness: 0.25,
      }),
    );
    group.add(core);

    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color(0x73fbd3);
    const colorB = new THREE.Color(0xff5c8a);
    const colorC = new THREE.Color(0x7c8cff);

    for (let index = 0; index < particleCount; index += 1) {
      const radius = 3 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.62;
      positions[index * 3 + 2] = radius * Math.cos(phi);

      const color = index % 3 === 0 ? colorA : index % 3 === 1 ? colorB : colorC;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(particles);

    const keyLight = new THREE.PointLight(0x73fbd3, 16, 24);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0xff5c8a, 10, 22);
    fillLight.position.set(-5, -2, 3);
    scene.add(fillLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.24));

    const frequencyData = new Uint8Array(512);
    const waveformData = new Uint8Array(512);
    let animationFrame = 0;
    let lastMetricUpdate = 0;

    const sampleAudio = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        frameMetricsRef.current = {
          energy: frameMetricsRef.current.energy * 0.94,
          bass: frameMetricsRef.current.bass * 0.94,
          mids: frameMetricsRef.current.mids * 0.94,
          highs: frameMetricsRef.current.highs * 0.94,
          waveform: frameMetricsRef.current.waveform * 0.94,
        };
        return frameMetricsRef.current;
      }

      if (analyser instanceof Tone.Analyser) {
        const values = analyser.getValue() as Float32Array;
        for (let index = 0; index < values.length; index += 1) {
          frequencyData[index] = Math.max(0, Math.min(255, (values[index] + 120) * 2.1));
        }
      } else {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(waveformData);
      }

      const bass = bandAverage(frequencyData, 0, 18);
      const mids = bandAverage(frequencyData, 18, 96);
      const highs = bandAverage(frequencyData, 96, 240);
      const energy = Math.min(1, (bass * 1.35 + mids + highs * 0.7) * sensitivity);
      let wave = 0;
      for (let index = 0; index < waveformData.length; index += 1) {
        wave += Math.abs(waveformData[index] - 128) / 128;
      }

      frameMetricsRef.current = {
        energy,
        bass,
        mids,
        highs,
        waveform: wave / waveformData.length,
      };
      return frameMetricsRef.current;
    };

    const animate = (time: number) => {
      const current = sampleAudio();
      const pulse = 1 + current.energy * 0.85;
      const bassLift = 1 + current.bass * 1.25;

      group.rotation.y += 0.004 + current.highs * 0.015;
      group.rotation.x = Math.sin(time * 0.00025) * 0.18;
      core.scale.setScalar(pulse);
      core.rotation.y -= 0.01 + current.mids * 0.035;

      rings.forEach((ring, index) => {
        const offset = index + 1;
        ring.scale.setScalar(1 + index * 0.28 + current.energy * (0.24 + offset * 0.04));
        ring.rotation.z += 0.002 * offset + current.bass * 0.012;
        const material = ring.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.7 + current.energy * 2.2;
      });

      particles.rotation.y -= 0.0015 + current.highs * 0.006;
      particles.rotation.x = Math.sin(time * 0.00018) * 0.14;
      particles.scale.setScalar(1 + current.mids * 0.32 + current.bass * 0.18);
      (particles.material as THREE.PointsMaterial).size = 0.03 + current.highs * 0.075;
      keyLight.intensity = 11 + current.bass * 30;
      fillLight.intensity = 8 + current.highs * 22;
      camera.position.z = 8.6 - current.energy * 1.25;
      camera.position.y = 1.35 + current.waveform * 0.8;
      camera.lookAt(0, 0, 0);

      if (time - lastMetricUpdate > 90) {
        setMetrics(current);
        lastMetricUpdate = time;
      }

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    window.addEventListener("resize", resize);
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      particleGeometry.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [particleCount, sensitivity]);

  useEffect(() => {
    return () => {
      stopTone();
      cleanupExternalSources();
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
      }
      audioContextRef.current?.close();
      toneNodesRef.current?.synth.dispose();
      toneNodesRef.current?.loop.dispose();
      toneNodesRef.current?.analyser.dispose();
    };
  }, [cleanupExternalSources, stopTone]);

  const modeLabel = useMemo(() => {
    if (mode === "demo") return "Tone.js synth";
    if (mode === "mic") return "Microphone";
    return "Audio file";
  }, [mode]);

  const selectMode = (nextMode: SourceMode) => {
    setMode(nextMode);
    setIsPlaying(false);
    stopTone();
    audioRef.current?.pause();
    if (nextMode !== "file") {
      cleanupExternalSources();
      analyserRef.current = null;
    }
    if (nextMode === "demo") {
      setTrackName("Tone pulse demo");
    }
    if (nextMode === "mic") {
      setTrackName("Live microphone input");
    }
  };

  return (
    <main className="app-shell">
      <div ref={mountRef} className="visual-stage" aria-hidden="true" />
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <section className="top-bar" aria-label="Visualizer controls">
        <div className="brand-lockup">
          <Disc3 aria-hidden="true" />
          <div>
            <h1>Music Visualizer</h1>
            <p>{trackName}</p>
          </div>
        </div>

        <button className="transport" type="button" onClick={togglePlayback}>
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
      </section>

      <section className="control-dock" aria-label="Audio and visual settings">
        <div className="mode-tabs" role="tablist" aria-label="Audio source">
          <button className={mode === "demo" ? "active" : ""} type="button" onClick={() => selectMode("demo")}>
            <AudioLines aria-hidden="true" />
            Demo
          </button>
          <label className={mode === "file" ? "active file-button" : "file-button"}>
            <Upload aria-hidden="true" />
            File
            <input accept="audio/*" type="file" onChange={handleFile} />
          </label>
          <button className={mode === "mic" ? "active" : ""} type="button" onClick={() => selectMode("mic")}>
            <Mic aria-hidden="true" />
            Mic
          </button>
        </div>

        <div className="now-playing">
          <Waves aria-hidden="true" />
          <span>{modeLabel}</span>
        </div>

        <label className="slider-control">
          <span>
            <SlidersHorizontal aria-hidden="true" />
            Sensitivity
          </span>
          <input
            min="0.65"
            max="2"
            step="0.05"
            type="range"
            value={sensitivity}
            onChange={(event) => setSensitivity(Number(event.target.value))}
          />
        </label>

        <label className="slider-control">
          <span>Particles</span>
          <input
            min="500"
            max="3000"
            step="100"
            type="range"
            value={particleCount}
            onChange={(event) => setParticleCount(Number(event.target.value))}
          />
        </label>
      </section>

      <aside className="meters" aria-label="Audio meters">
        {Object.entries(metrics).map(([label, value]) => (
          <div className="meter" key={label}>
            <span>{label}</span>
            <div>
              <i style={{ transform: `scaleX(${Math.max(0.03, value)})` }} />
            </div>
          </div>
        ))}
      </aside>
    </main>
  );
}

export default App;
