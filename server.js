const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); // 10MB for images

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ── Multer: profile photo uploads ──────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "public/uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ── In-memory store ─────────────────────────────────────────
// users[socketId] = { id, username, displayName, avatar, status, phone, phoneVisible, address, color }
const users = {};

function getUserList() {
  return Object.values(users).map((u) => ({
    id: u.id,
    socketId: u.socketId,
    displayName: u.displayName,
    username: u.username,
    avatar: u.avatar,
    status: u.status,
    color: u.color,
    phone: u.phoneVisible ? u.phone : null,
    address: u.address,
    online: true,
  }));
}

function broadcastUserList() {
  io.emit("user-list", getUserList());
}

// ── Socket.IO ───────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // ── Join / set profile ──────────────────────────────────
  socket.on("join", (profile) => {
    const user = {
      id: uuidv4(),
      socketId: socket.id,
      username: profile.username || "user_" + socket.id.slice(0, 4),
      displayName: profile.displayName || profile.username,
      avatar: profile.avatar || null,
      status: profile.status || "Hey there! I am using NexChat",
      phone: profile.phone || "",
      phoneVisible: profile.phoneVisible !== false,
      address: profile.address || "",
      color: profile.color || "#4fffb0",
    };
    users[socket.id] = user;
    console.log(`👤 ${user.displayName} joined`);

    // Send this user their own profile back
    socket.emit("profile-confirmed", user);

    // Announce to room
    io.emit("system-message", {
      text: `${user.displayName} joined NexChat`,
      time: timeNow(),
    });

    broadcastUserList();
    io.emit("user-count", Object.keys(users).length);
  });

  // ── Update profile ──────────────────────────────────────
  socket.on("update-profile", (data) => {
    if (!users[socket.id]) return;
    Object.assign(users[socket.id], data);
    socket.emit("profile-confirmed", users[socket.id]);
    broadcastUserList();
    console.log(`✏️ ${users[socket.id].displayName} updated profile`);
  });

  // ── Global chat message ─────────────────────────────────
  socket.on("chat-message", (data) => {
    const user = users[socket.id];
    if (!user) return;
    const msg = {
      id: uuidv4(),
      userId: user.id,
      socketId: socket.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      color: user.color,
      text: data.text,
      time: timeNow(),
      type: "text",
    };
    io.emit("chat-message", msg);
  });

  // ── Global image share ──────────────────────────────────
  socket.on("chat-image", (data) => {
    const user = users[socket.id];
    if (!user) return;
    io.emit("chat-message", {
      id: uuidv4(),
      userId: user.id,
      socketId: socket.id,
      displayName: user.displayName,
      avatar: user.avatar,
      color: user.color,
      imageData: data.imageData,
      caption: data.caption || "",
      time: timeNow(),
      type: "image",
    });
  });

  // ── Global location share ───────────────────────────────
  socket.on("share-location", (coords) => {
    const user = users[socket.id];
    if (!user) return;
    const { latitude, longitude } = coords;
    io.emit("chat-message", {
      id: uuidv4(),
      userId: user.id,
      socketId: socket.id,
      displayName: user.displayName,
      avatar: user.avatar,
      color: user.color,
      latitude,
      longitude,
      mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
      time: timeNow(),
      type: "location",
    });
  });

  // ── Private message ─────────────────────────────────────
  socket.on("private-message", (data) => {
    const sender = users[socket.id];
    if (!sender) return;
    const msg = {
      id: uuidv4(),
      fromId: sender.id,
      fromSocketId: socket.id,
      toSocketId: data.toSocketId,
      displayName: sender.displayName,
      avatar: sender.avatar,
      color: sender.color,
      text: data.text,
      time: timeNow(),
      type: "text",
    };
    // Send to recipient and back to sender
    socket.to(data.toSocketId).emit("private-message", msg);
    socket.emit("private-message", msg);
  });

  // ── Private image ───────────────────────────────────────
  socket.on("private-image", (data) => {
    const sender = users[socket.id];
    if (!sender) return;
    const msg = {
      id: uuidv4(),
      fromId: sender.id,
      fromSocketId: socket.id,
      toSocketId: data.toSocketId,
      displayName: sender.displayName,
      avatar: sender.avatar,
      color: sender.color,
      imageData: data.imageData,
      caption: data.caption || "",
      time: timeNow(),
      type: "image",
    };
    socket.to(data.toSocketId).emit("private-message", msg);
    socket.emit("private-message", msg);
  });

  // ── Private location ────────────────────────────────────
  socket.on("private-location", (data) => {
    const sender = users[socket.id];
    if (!sender) return;
    const msg = {
      id: uuidv4(),
      fromId: sender.id,
      fromSocketId: socket.id,
      toSocketId: data.toSocketId,
      displayName: sender.displayName,
      avatar: sender.avatar,
      color: sender.color,
      latitude: data.latitude,
      longitude: data.longitude,
      mapsUrl: `https://www.google.com/maps?q=${data.latitude},${data.longitude}`,
      time: timeNow(),
      type: "location",
    };
    socket.to(data.toSocketId).emit("private-message", msg);
    socket.emit("private-message", msg);
  });

  // ── Typing ──────────────────────────────────────────────
  socket.on("typing", ({ isTyping, toSocketId }) => {
    const user = users[socket.id];
    if (!user) return;
    if (toSocketId) {
      socket.to(toSocketId).emit("typing", { displayName: user.displayName, isTyping, fromSocketId: socket.id });
    } else {
      socket.broadcast.emit("typing", { displayName: user.displayName, isTyping, fromSocketId: null });
    }
  });

  // ── Emoji reaction ──────────────────────────────────────
  socket.on("reaction", (data) => {
    io.emit("reaction", { msgId: data.msgId, emoji: data.emoji, from: users[socket.id]?.displayName });
  });

  // ── Disconnect ──────────────────────────────────────────
  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      console.log(`👋 ${user.displayName} left`);
      delete users[socket.id];
      io.emit("system-message", { text: `${user.displayName} left NexChat`, time: timeNow() });
      io.emit("user-left", socket.id);
      broadcastUserList();
      io.emit("user-count", Object.keys(users).length);
    }
  });
});

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 NexChat server running at http://localhost:${PORT}\n`);
});
