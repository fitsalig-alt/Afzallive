# 💬 NexChat v2 — Full-Featured Real-Time Chat

## ✨ Features
- 👤 **Full profile** — display name, photo, status, phone (show/hide), address
- 💬 **Global chat** — public room for all users
- 🔒 **Private DMs** — click any user to start a private chat
- 📷 **Photo sharing** — send images in global & private chats (with captions)
- 📍 **Location sharing** — share your live coordinates (opens in Google Maps)
- 😊 **Emoji picker** — built-in emoji panel
- ❤️ **Reactions** — right-click any message to react
- ✍️ **Typing indicators** — see when others are typing
- 👥 **People list** — see all online users with their profiles

## 🛠️ Setup

```bash
# 1. Enter the folder
cd chat-app-v2

# 2. Install dependencies
npm install

# 3. Start server
npm start

# 4. Open browser
# → http://localhost:3000
```

## 📁 Structure
```
chat-app-v2/
├── server.js           ← Node.js + Express + Socket.IO backend
├── package.json
├── public/
│   ├── index.html      ← Full frontend
│   └── uploads/        ← Profile photos stored here
└── README.md
```

## 🌐 Share with others on your network
Find your local IP (run `ipconfig` on Windows) and share:
```
http://YOUR_IP:3000
```
