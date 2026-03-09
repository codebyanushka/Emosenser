import { useState, useRef, useEffect } from 'react';
import './App.css';

const EMOTIONS = {
  HAPPY:    { emoji: '😊', label: 'Happy',     color: '#FFD93D', glow: '#FFD93D55', bg: 'linear-gradient(135deg, #FFD93D22, #FF6B6B11)' },
  ANGRY:    { emoji: '😡', label: 'Angry',     color: '#FF4757', glow: '#FF475755', bg: 'linear-gradient(135deg, #FF475722, #FF6B0011)' },
  SAD:      { emoji: '😔', label: 'Sad',       color: '#5352ED', glow: '#5352ED55', bg: 'linear-gradient(135deg, #5352ED22, #2C2C8811)' },
  NEUTRAL:  { emoji: '😐', label: 'Neutral',   color: '#A4B0BE', glow: '#A4B0BE55', bg: 'linear-gradient(135deg, #A4B0BE22, #57606F11)' },
  FEARFUL:  { emoji: '😨', label: 'Fearful',   color: '#ECCC68', glow: '#ECCC6855', bg: 'linear-gradient(135deg, #ECCC6822, #FFA50211)' },
  DISGUSTED:{ emoji: '🤢', label: 'Disgusted', color: '#2ED573', glow: '#2ED57355', bg: 'linear-gradient(135deg, #2ED57322, #00990011)' },
  SURPRISED:{ emoji: '😲', label: 'Surprised', color: '#FF6B81', glow: '#FF6B8155', bg: 'linear-gradient(135deg, #FF6B8122, #FF000011)' },
};

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  duration: 3 + Math.random() * 4,
  delay: Math.random() * 4,
  size: 2 + Math.random() * 4,
}));

// Convert audio blob to WAV using Web Audio API
async function convertToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const numChannels = 1;
  const sampleRate = 16000;
  const pcmData = audioBuffer.getChannelData(0);
  const wavBuffer = encodeWAV(pcmData, sampleRate, numChannels);
  audioCtx.close();
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function encodeWAV(samples, sampleRate, numChannels) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function WaveBar({ active, index }) {
  return (
    <div className="wave-bar" style={{
      animationDelay: `${index * 0.08}s`,
      animationPlayState: active ? 'running' : 'paused',
      height: active ? undefined : '6px',
    }} />
  );
}

function EmotionCard({ emotion, isActive }) {
  const e = EMOTIONS[emotion] || EMOTIONS.NEUTRAL;
  return (
    <div className={`emotion-display ${isActive ? 'active' : ''}`} style={{
      '--emotion-color': e.color,
      '--emotion-glow': e.glow,
      background: isActive ? e.bg : undefined,
    }}>
      <div className="emotion-emoji">{e.emoji}</div>
      <div className="emotion-label">{e.label}</div>
      {isActive && <div className="emotion-pulse" />}
    </div>
  );
}

function HistoryItem({ item, index }) {
  const e = EMOTIONS[item.emotion] || EMOTIONS.NEUTRAL;
  return (
    <div className="history-item" style={{ '--emotion-color': e.color, animationDelay: `${index * 0.05}s` }}>
      <span className="history-emoji">{e.emoji}</span>
      <div className="history-content">
        <span className="history-emotion" style={{ color: e.color }}>{e.label}</span>
        <span className="history-text">{item.text}</span>
      </div>
      <span className="history-time">{item.time}</span>
    </div>
  );
}

export default function App() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emotion, setEmotion] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const currentEmotion = emotion ? (EMOTIONS[emotion] || EMOTIONS.NEUTRAL) : null;

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied. Please allow mic permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRef.current) {
      mediaRef.current.stop();
      setRecording(false);
    }
  };

  useEffect(() => {
    if (audioBlob) analyzeEmotion(audioBlob);
  }, [audioBlob]);

  const analyzeEmotion = async (blob) => {
    setLoading(true);
    setEmotion(null);
    setTranscript('');
    try {
      // Convert webm to wav using Web Audio API
      const wavBlob = await convertToWav(blob);

      const formData = new FormData();
      formData.append('files', wavBlob, 'recording.wav');
      formData.append('lang', 'auto');

      const res = await fetch('http://localhost:50000/api/v1/asr', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      const text = data.result?.[0]?.text || '';

      let detectedEmotion = 'NEUTRAL';
      const upper = text.toUpperCase();
      if (upper.includes('HAPPY') || text.includes('😊')) detectedEmotion = 'HAPPY';
      else if (upper.includes('ANGRY') || text.includes('😡')) detectedEmotion = 'ANGRY';
      else if (upper.includes('SAD') || text.includes('😔')) detectedEmotion = 'SAD';
      else if (upper.includes('FEARFUL') || text.includes('😨')) detectedEmotion = 'FEARFUL';
      else if (upper.includes('DISGUSTED') || text.includes('🤢')) detectedEmotion = 'DISGUSTED';
      else if (upper.includes('SURPRISED') || text.includes('😲')) detectedEmotion = 'SURPRISED';

      setEmotion(detectedEmotion);
      setTranscript(text);
      setHistory(prev => [{
        emotion: detectedEmotion,
        text: text.slice(0, 60) + (text.length > 60 ? '...' : ''),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }, ...prev].slice(0, 8));
    } catch (err) {
      setError('Could not connect to backend. Make sure api.py is running on port 50000.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app" style={currentEmotion ? { '--accent': currentEmotion.color, '--glow': currentEmotion.glow } : {}}>
      <div className="particles">
        {PARTICLES.map(p => (
          <div key={p.id} className="particle" style={{
            left: p.left, top: p.top, width: p.size, height: p.size,
            animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
          }} />
        ))}
      </div>

      <header className="header">
        <div className="logo-mark">ES</div>
        <div>
          <h1 className="brand">EmoSenser</h1>
          <p className="tagline">Real-time Voice Emotion Intelligence</p>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          <span>AI Ready</span>
        </div>
      </header>

      <main className="main">
        <section className="left-panel">
          <p className="section-label">Emotion Spectrum</p>
          <div className="emotion-grid">
            {Object.keys(EMOTIONS).map(key => (
              <EmotionCard key={key} emotion={key} isActive={emotion === key} />
            ))}
          </div>
        </section>

        <section className="center-panel">
          <div className="mic-area">
            <div className={`mic-ring ${recording ? 'recording' : ''} ${loading ? 'loading' : ''}`}
              style={currentEmotion ? { borderColor: currentEmotion.color, boxShadow: `0 0 40px ${currentEmotion.glow}` } : {}}>
              <button
                className={`mic-btn ${recording ? 'active' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                disabled={loading}
              >
                {loading ? (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                ) : recording ? (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
            </div>

            <div className="wave-container">
              {Array.from({ length: 20 }).map((_, i) => <WaveBar key={i} active={recording} index={i} />)}
            </div>

            <p className="mic-hint">
              {loading ? 'Analyzing emotion...' : recording ? 'Recording... tap to stop' : 'Tap to speak'}
            </p>
          </div>

          {(emotion || transcript) && (
            <div className="result-card" style={currentEmotion ? {
              borderColor: currentEmotion.color + '44',
              background: currentEmotion.bg,
            } : {}}>
              {emotion && (
                <div className="result-emotion">
                  <span className="result-emoji">{currentEmotion?.emoji}</span>
                  <div>
                    <div className="result-label" style={{ color: currentEmotion?.color }}>
                      {currentEmotion?.label}
                    </div>
                    <div className="result-sublabel">Detected Emotion</div>
                  </div>
                </div>
              )}
              {transcript && <p className="result-transcript">"{transcript}"</p>}
            </div>
          )}

          {error && <div className="error-card">{error}</div>}
        </section>

        <section className="right-panel">
          <p className="section-label">Session History</p>
          {history.length === 0 ? (
            <div className="empty-history">
              <span>🎙️</span>
              <p>Your emotion history will appear here</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item, i) => <HistoryItem key={i} item={item} index={i} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}