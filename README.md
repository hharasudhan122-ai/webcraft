# ⛏️ WebCraft – Web & Mobile Multiplayer Minecraft

Play Minecraft in your browser with cross-device multiplayer! Works on **desktop/laptop (keyboard & mouse)** and **mobile phones/tablets (touchscreen controls)**.

---

## 🌐 1. Online Multiplayer (Via Render Link)

When deployed on **Render** (e.g., `https://your-webcraft.onrender.com`):
1. Send your Render link to friends anywhere in the world.
2. The host clicks **🏠 Host a Room** and shares the 6-letter room code (e.g. `AB12CD`).
3. Other players open the link, click **🔑 Join by Code**, enter the room code, and join immediately.
4. **Internet Connection Required:** Because Render is hosted in the cloud, all players must have an active internet connection to load the link and connect.

---

## 📡 2. Offline LAN Play (Zero Internet Needed)

> [!IMPORTANT]
> **Why the Render link won't open offline:**
> If you have no internet, your browser cannot reach cloud servers like Render. 
> To play **100% offline** (e.g. on a local Wi-Fi without internet or a mobile hotspot with mobile data turned off), you run the game directly on your computer!

### Steps for Offline LAN:
1. **One person acts as the Host Computer:**
   - Clone or download this repository onto the host laptop/PC.
   - Open a terminal in the folder and run:
     ```bash
     npm install
     npm start
     ```
   - The server will start locally at `http://localhost:3000`.

2. **Connect other devices on the same Wi-Fi / Hotspot:**
   - On the host's screen under **📡 LAN / WiFi**, note the local IP (for example `192.168.1.45:3000`).
   - Any friend (laptop or mobile phone) connected to the **same Wi-Fi or phone hotspot** simply opens:
     `http://<HOST_IP>:3000` (e.g. `http://192.168.1.45:3000`) in their phone or laptop browser.
   - Enter the room code to join and play together with **zero internet usage**!

---

## 📱 3. Mobile Touch Controls

WebCraft includes built-in on-screen controls for smartphones and tablets:

| Mobile Control | Function |
| :--- | :--- |
| **D-Pad (Bottom Left)** | Move Forward (▲), Backward (▼), Left (◀), Right (▶) |
| **⚡ (Sprint Toggle)** | Tap to toggle sprinting on/off |
| **Drag Screen (Right side)** | Swipe anywhere on the game view to look around / turn camera |
| **⬆ JUMP** | Jump (Double-tap in creative mode to fly) |
| **⛏️ MINE** | Hold down to mine/break blocks or attack; opens/closes doors |
| **🧱 PLACE** | Places held block, opens chests, or interacts with doors |
| **Hotbar Slots** | Tap any slot at the bottom to select that item directly |
| **🎒 INV** | Opens/closes Inventory & Crafting menu (tap ✕ Close to return) |
| **⏏️ DROP** | Drops the currently held item on the ground |
| **💬 CHAT** | Opens chat dialog with on-screen Send and Close buttons |
| **🕊️ FLY** | Appears in Creative mode to toggle flight |
| **📱 Button** | Toggle touch overlay on/off anytime |

---

## 💻 4. Desktop / Laptop Controls

- **WASD**: Move
- **Mouse**: Look around (click canvas to lock mouse)
- **Left Click**: Mine / Break block / Attack
- **Right Click**: Place block / Open chest / Toggle door
- **Space**: Jump (Double-tap in Creative to fly)
- **Shift**: Sprint / Sneak
- **1-9 / Scroll Wheel**: Select hotbar slot
- **E**: Inventory & Crafting
- **Q**: Drop held item
- **T**: Chat
- **R**: Respawn
- **Tab**: Host administration panel (Kick, Creative mode toggles)
- **Esc**: Release mouse cursor / Close menus

---

## 🛠️ Configuration & Worlds

- Worlds are configured in [config.json](file:///c:/Users/hhara/Downloads/webcraft/mcweb/config.json).
- Default world is located in `world/`.
- Uploading Bedrock `.mcworld` packages requires Python 3 and `pip install amulet-leveldb` (handled via `convert.py`).
