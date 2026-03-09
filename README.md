# EmoSenses 🎙️
> Real-time Voice Emotion Detection powered by AI

![EmoSenses Demo](demo.png)

## 🧠 What it does
Speak into your mic → AI detects your emotion in real-time.
No text input. No forms. Just your voice.

## ⚡ Tech Stack
| Part | Technology |
|------|-----------|
| AI Model | SenseVoice Small (FunAudioLLM) |
| Backend | FastAPI (Python) |
| Frontend | React.js |
| Audio | Web Audio API (WAV conversion) |

## 🚀 Run Locally

**Backend:**
```bash
pip install -r requirements.txt
python api.py
```

**Frontend:**
```bash
cd emosenses-ui
npm install
npm start
```
Open `http://localhost:3000`

## 🎭 Emotions Detected
😄 Happy • 😢 Sad • 😠 Angry • 😨 Fearful • 🤢 Disgusted • 😲 Surprised • 😐 Neutral

## 👩‍💻 Built by
[@codebyanushka](https://github.com/codebyanushka)