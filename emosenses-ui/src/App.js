import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

// ── EMOTION CONFIG ────────────────────────────────────────────────
const EM = {
  HAPPY:     { emoji:'😄', label:'Happy',     color:'#FFD60A', glow:'rgba(255,214,10,.18)' },
  SAD:       { emoji:'😢', label:'Sad',        color:'#38bdf8', glow:'rgba(56,189,248,.18)' },
  ANGRY:     { emoji:'😠', label:'Angry',      color:'#ff4444', glow:'rgba(255,68,68,.18)'  },
  FEARFUL:   { emoji:'😨', label:'Fearful',    color:'#c084fc', glow:'rgba(192,132,252,.18)' },
  DISGUSTED: { emoji:'🤢', label:'Disgusted',  color:'#4ade80', glow:'rgba(74,222,128,.18)' },
  SURPRISED: { emoji:'😲', label:'Surprised',  color:'#fb923c', glow:'rgba(251,146,60,.18)'  },
  NEUTRAL:   { emoji:'😐', label:'Neutral',    color:'#00e5ff', glow:'rgba(0,229,255,.15)'  },
};

const API = 'http://localhost:50000/api/v1/asr';

// ── AUDIO UTILS ───────────────────────────────────────────────────
async function convertToWav(blob) {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(ab);
  const samples = decoded.getChannelData(0);
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'RIFF'); v.setUint32(4,36+samples.length*2,true);
  ws(8,'WAVE'); ws(12,'fmt '); v.setUint32(16,16,true);
  v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,16000,true); v.setUint32(28,32000,true);
  v.setUint16(32,2,true); v.setUint16(34,16,true);
  ws(36,'data'); v.setUint32(40,samples.length*2,true);
  let off=44;
  for (let i=0;i<samples.length;i++,off+=2) {
    const s=Math.max(-1,Math.min(1,samples[i]));
    v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);
  }
  await ctx.close();
  return new File([buf],'audio.wav',{type:'audio/wav'});
}

function parseEmotion(raw='', clean='') {
  const u = raw.toUpperCase();
  const tags = ['HAPPY','ANGRY','SAD','FEARFUL','DISGUSTED','SURPRISED'];
  for (const t of tags) if (u.includes(`<|${t}|>`)) return t;
  // keyword fallback
  const lo = clean.toLowerCase();
  const kw = {
    HAPPY:['haha','lol','great','amazing','love','wonderful','yay','awesome','excited','fantastic'],
    SAD:['sad','cry','miss','sorry','hurt','upset','depressed','alone','lonely'],
    ANGRY:['angry','hate','shut up','stop','furious','annoying','stupid','damn'],
    SURPRISED:['wow','omg','oh my','really','seriously','no way','what the'],
    FEARFUL:['scared','afraid','nervous','anxious','worried','terrified'],
    DISGUSTED:['disgusting','gross','yuck','nasty','horrible','awful'],
  };
  for (const [emo,words] of Object.entries(kw))
    if (words.some(w=>lo.includes(w))) return emo;
  return 'NEUTRAL';
}

// ── WAVEFORM BARS ─────────────────────────────────────────────────
const WAVE_HEIGHTS = [14,28,20,38,16,44,24,36,18,42,22,40,16,34,26,44,18,38,14,30,24,40,18,36,22,44,16,32];
function Waveform({ active, color }) {
  return (
    <div className="waveform">
      {WAVE_HEIGHTS.map((h,i)=>(
        <div key={i} className="wbar"
          style={active ? {
            animation:`wv ${0.5+(i%5)*0.12}s ease-in-out ${i*0.04}s infinite alternate`,
            '--h':h+'px', background:color,  // eslint-disable-line
          } : { height:'4px', background:color }}
        />
      ))}
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────
export default function App() {
  const [recording, setRecording]   = useState(false);
  const [loading,   setLoading]     = useState(false);
  const [emotion,   setEmotion]     = useState(null);
  const [transcript,setTranscript]  = useState('');
  const [history,   setHistory]     = useState([]);
  const [error,     setError]       = useState('');
  const [counts,    setCounts]      = useState({});

  const mrRef     = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const cur = emotion ? (EM[emotion]||EM.NEUTRAL) : null;
  const emColor = cur?.color || '#00e5ff';
  const emGlow  = cur?.glow  || 'rgba(0,229,255,.15)';

  // inject CSS vars on emotion change
  useEffect(()=>{
    document.documentElement.style.setProperty('--em', emColor);
    document.documentElement.style.setProperty('--em-glow', emGlow);
  },[emColor, emGlow]);

  const startRec = useCallback(async ()=>{
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, {mimeType:'audio/webm'});
      mr.ondataavailable = e => { if(e.data.size>0) chunksRef.current.push(e.data); };
      mr.onstop = handleStop; // eslint-disable-line react-hooks/exhaustive-deps
      mr.start(100);
      mrRef.current = mr;
      setRecording(true);
    } catch { setError('Mic access denied — allow microphone in browser settings.'); }
  },[]);

  const stopRec = useCallback(()=>{
    mrRef.current?.stop();
    streamRef.current?.getTracks().forEach(t=>t.stop());
    setRecording(false);
  },[]);

  const handleStop = useCallback(async ()=>{
    setLoading(true); setEmotion(null); setTranscript('');
    try {
      const blob = new Blob(chunksRef.current, {type:'audio/webm'});
      const wav  = await convertToWav(blob);
      const fd   = new FormData();
      fd.append('files', wav, 'audio.wav');
      fd.append('lang','auto');
      const res  = await fetch(API,{method:'POST',body:fd});
      if(!res.ok) throw new Error('Server error');
      const data = await res.json();
      const item = data.result?.[0] || {};
      const raw  = item.raw_text || item.text || '';
      const txt  = item.text || '';
      const emo  = item.emotion
        ? item.emotion.replace(/[^A-Z]/g,'')
        : parseEmotion(raw, txt);
      const validEmo = EM[emo] ? emo : 'NEUTRAL';
      const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      setEmotion(validEmo);
      setTranscript(txt);
      setHistory(prev=>[{emotion:validEmo,text:txt,time},...prev.slice(0,24)]);
      setCounts(prev=>({...prev,[validEmo]:(prev[validEmo]||0)+1}));
    } catch {
      setError('Cannot reach backend. Run: python api.py');
    } finally { setLoading(false); }
  },[]);

  const toggle = () => recording ? stopRec() : startRec();
  const total  = Object.values(counts).reduce((a,b)=>a+b,0);

  return (
    <div className="app">
      {/* Background layers */}
      <div className="ambient">
        <div className="orb a" style={{background:emGlow}} />
        <div className="orb b" style={{background:emGlow}} />
      </div>
      <div className="grid-lines" />
      <div className="scanline" style={{background:`linear-gradient(transparent,${emColor},transparent)`}} />

      {/* ── HEADER ── */}
      <header className="header">
        <div className="logo" style={{borderColor:emColor, boxShadow:`0 0 18px ${emGlow},inset 0 0 10px ${emGlow}`}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={emColor}>
            <path d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-1 13V8l6 4-6 4z"/>
          </svg>
        </div>
        <div className="brand-wrap">
          <div className="brand">Emo<em>Senses</em></div>
          <div className="sub">Real-time Voice Emotion Intelligence</div>
        </div>
        <div className="hdr-pills">
          <div className="pill pill-live"><span className="dot"/><span>LIVE</span></div>
          <div className="pill pill-model">SenseVoice AI</div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div className="main">

        {/* LEFT — emotion spectrum */}
        <aside className="left-panel">
          <div className="panel-title">Emotion Spectrum</div>
          <div className="emotion-list">
            {Object.entries(EM).map(([key,val])=>{
              const isActive = emotion===key;
              const pct = total>0 ? Math.round((counts[key]||0)/total*100) : 0;
              return (
                <div key={key} className={`e-row${isActive?' active':''}`}
                  style={{'--e-color':val.color}}>
                  <div className="e-shimmer" />
                  <span className="e-emoji">{val.emoji}</span>
                  <span className="e-name">{val.label}</span>
                  <div className="e-track">
                    <div className="e-fill" style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER — hero + mic */}
        <main className="center">

          {/* Hero emotion card */}
          <div className={`hero${emotion?' lit':''}`}
            style={emotion?{
              borderColor:`color-mix(in srgb, ${emColor} 28%, transparent)`,
              boxShadow:`0 0 60px color-mix(in srgb, ${emColor} 8%, transparent), 0 0 120px color-mix(in srgb, ${emColor} 4%, transparent)`,
            }:{}}>
            <div className="cbr tl" style={{borderColor:emColor}}/>
            <div className="cbr tr" style={{borderColor:emColor}}/>
            <div className="cbr bl" style={{borderColor:emColor}}/>
            <div className="cbr br" style={{borderColor:emColor}}/>

            {emotion ? (
              <div className="hero-body">
                <div className="h-emoji" key={emotion} style={{filter:`drop-shadow(0 0 28px ${emColor})`}}>
                  {cur.emoji}
                </div>
                <div className="h-emo-name" style={{color:emColor, textShadow:`0 0 40px ${emColor}, 0 0 80px ${emGlow}`}}>
                  {cur.label.toUpperCase()}
                </div>
                <div className="h-sub">Detected Emotion</div>
                {transcript && <div className="h-transcript">"{transcript}"</div>}
              </div>
            ) : (
              <div className="hero-body">
                <div className="hero-idle">
                  <div className="idle-icon">🎙️</div>
                  <div className="idle-txt">
                    {loading ? '◈  Analyzing your voice…' : 'Tap the mic\nand speak freely'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mic + waveform */}
          <div className="mic-wrap">
            <div className={`mic-outer${recording?' recording':''}`}>
              <div className="rpl" style={{borderColor:emColor}}/>
              <div className="rpl" style={{borderColor:emColor}}/>
              <div className="rpl" style={{borderColor:emColor}}/>
              <div className="mic-inner" style={{
                borderColor:emColor,
                ...(recording ? {
                  background:`color-mix(in srgb, ${emColor} 8%, #0c0e18)`,
                  boxShadow:`0 0 40px color-mix(in srgb, ${emColor} 28%, transparent), inset 0 0 20px color-mix(in srgb, ${emColor} 8%, transparent)`,
                }:{}),
              }}>
                <button className="mic-btn" onClick={toggle} disabled={loading}
                  style={{color:emColor}}>
                  {loading ? (
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={emColor} strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                        style={{animation:'spin 1s linear infinite', transformOrigin:'center'}}/>
                    </svg>
                  ) : recording ? (
                    <svg width="34" height="34" viewBox="0 0 24 24" fill={emColor}>
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg width="34" height="34" viewBox="0 0 24 24" fill={emColor}>
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                      <path d="M19 10v2a7 7 0 01-14 0v-2" stroke={emColor} strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <line x1="12" y1="19" x2="12" y2="23" stroke={emColor} strokeWidth="2" strokeLinecap="round"/>
                      <line x1="8" y1="23" x2="16" y2="23" stroke={emColor} strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <Waveform active={recording} color={emColor} />

            <div className={`mic-hint${recording?' live':''}`}
              style={recording ? {color:emColor} : {}}>
              {loading ? '◈ Processing…' : recording ? '● Recording — tap to stop' : 'Tap to speak'}
            </div>
          </div>

          {error && <div className="err">{error}</div>}
        </main>

        {/* RIGHT — history */}
        <aside className="right-panel">
          <div className="rp-top">
            <div className="rp-row1">
              <div className="rp-label">Session Log</div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <div className="rp-cnt" style={{color:emColor, borderColor:`color-mix(in srgb, ${emColor} 22%, transparent)`, background:`color-mix(in srgb, ${emColor} 8%, transparent)`}}>
                  {history.length}
                </div>
                {history.length>0 && (
                  <button className="clr-btn" onClick={()=>{setHistory([]);setCounts({});}}>
                    CLEAR
                  </button>
                )}
              </div>
            </div>
            {/* Distribution bar */}
            {total>0 && (
              <div className="dist">
                {Object.entries(counts).map(([key,cnt])=>(
                  <div key={key} className="dist-seg"
                    style={{flex:cnt, background:EM[key]?.color||'#444'}}/>
                ))}
              </div>
            )}
          </div>

          {history.length===0 ? (
            <div className="empty-hist">
              <span>🎙</span>
              <p>No recordings yet.<br/>Start speaking to see<br/>your emotion log here.</p>
            </div>
          ) : (
            <div className="hist-list">
              {history.map((item,i)=>{
                const e = EM[item.emotion]||EM.NEUTRAL;
                return (
                  <div key={i} className="h-item" style={{'--e-color':e.color}}>
                    <span className="hi-emoji">{e.emoji}</span>
                    <div className="hi-body">
                      <div className="hi-emo" style={{color:e.color}}>{e.label}</div>
                      {item.text && <div className="hi-txt">{item.text}</div>}
                    </div>
                    <div className="hi-time">{item.time}</div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <style>{`
        @keyframes wv { from{height:4px} to{height:var(--h,20px)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}