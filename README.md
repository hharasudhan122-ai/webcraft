# Webcraft
1. Install Node.js 18+, then run:  npm install && npm start
2. Open http://localhost:3000 -> Host a room -> share the 6-letter code.
   Friends on your Wi-Fi use http://<your-ip>:3000. For internet play, host it on any Node server (Render, Railway, a VPS).

- Default world = your converted world (world/). "New flat world" spawns at 8, 64, 8.
- Spawn and respawn = the world's saved spawn from level.dat, within respawnRadius. In config.json set "spawnOverride": [x, y, z] to move it next to your walls.
- Uploading other .mcworld files needs python3 and `pip install amulet-leveldb` on the server (convert.py).
- Host (Tab): set each player Creative or Survival, everyone-creative, kick.
- Not built yet: redstone, mobs, health, block shapes (stairs and doors are cubes), textures, smelting, saving room progress.
"# webcraft" 
