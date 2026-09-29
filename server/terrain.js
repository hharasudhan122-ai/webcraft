// server/terrain.js - Procedural Minecraft Terrain Generator
const zlib = require('zlib');

// Pseudo-random noise with multiple octaves
function createNoise(seed = 12345) {
  const p = new Uint8Array(512);
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  const grad = (hash, x, y) => {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
  };

  function noise2D(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(v, lerp(u, grad(p[A], x, y), grad(p[B], x - 1, y)),
                   lerp(u, grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1)));
  }

  function fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0, frequency = 1, amplitude = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxValue;
  }

  return { noise2D, fbm };
}

class ProceduralWorld {
  constructor(id = 'random', name = '🌲 Random Seed World (Biomes, Trees, Mountains)', seed = Math.floor(Math.random() * 899999 + 100000)) {
    this.id = id;
    this.name = name;
    this.kind = 'random';
    this.seed = seed;
    this.noise = createNoise(seed);
    this.biomeNoise = createNoise(seed + 777);
    this.treeNoise = createNoise(seed + 9999);
    this.subCache = new Map();

    this.names = [
      'minecraft:air',                // 0
      'minecraft:bedrock',            // 1
      'minecraft:deepslate',          // 2
      'minecraft:stone',              // 3
      'minecraft:dirt',               // 4
      'minecraft:grass_block',        // 5
      'minecraft:sand',               // 6
      'minecraft:gravel',             // 7
      'minecraft:water',              // 8
      'minecraft:oak_log',            // 9
      'minecraft:oak_leaves',         // 10
      'minecraft:coal_ore',           // 11
      'minecraft:iron_ore',           // 12
      'minecraft:gold_ore',           // 13
      'minecraft:diamond_ore',        // 14
      'minecraft:copper_ore',         // 15
      'minecraft:snow',               // 16
      'minecraft:sandstone',          // 17
      'minecraft:birch_log',          // 18
      'minecraft:birch_leaves',       // 19
      'minecraft:dandelion',          // 20
      'minecraft:poppy',              // 21
      'minecraft:crafting_table',     // 22
      'minecraft:oak_planks',         // 23
      'minecraft:cobblestone'         // 24
    ];

    // IDs
    this.AIR = 0;
    this.BEDROCK = 1;
    this.DEEPSLATE = 2;
    this.STONE = 3;
    this.DIRT = 4;
    this.GRASS = 5;
    this.SAND = 6;
    this.GRAVEL = 7;
    this.WATER = 8;
    this.OAK_LOG = 9;
    this.OAK_LEAVES = 10;
    this.COAL_ORE = 11;
    this.IRON_ORE = 12;
    this.GOLD_ORE = 13;
    this.DIAMOND_ORE = 14;
    this.COPPER_ORE = 15;
    this.SNOW = 16;
    this.SANDSTONE = 17;
    this.BIRCH_LOG = 18;
    this.BIRCH_LEAVES = 19;
    this.DANDELION = 20;
    this.POPPY = 21;

    this.spawn = [0, 0];
    // Find dry spawn point near center
    for (let r = 0; r < 50; r++) {
      const h = this.getHeight(r * 2, r * 2);
      if (h >= 63 && h <= 80) {
        this.spawn = [r * 2, r * 2];
        break;
      }
    }
  }

  // Biome: 0: Ocean, 1: Plains, 2: Forest, 3: Mountains, 4: Desert
  getBiome(x, z) {
    const t = this.biomeNoise.fbm(x * 0.003, z * 0.003, 3, 0.5);
    const m = this.biomeNoise.fbm(x * 0.003 + 50, z * 0.003 + 50, 3, 0.5);
    if (t < -0.22) return 'ocean';
    if (t > 0.35 && m < 0.05) return 'desert';
    if (t > 0.18) return 'mountains';
    if (m > 0.1) return 'forest';
    return 'plains';
  }

  getHeight(x, z) {
    const biome = this.getBiome(x, z);
    const base = this.noise.fbm(x * 0.006, z * 0.006, 4, 0.5);
    const detail = this.noise.fbm(x * 0.03, z * 0.03, 2, 0.5) * 3;

    let h = 64;
    if (biome === 'ocean') {
      h = Math.floor(48 + base * 14 + detail);
    } else if (biome === 'plains') {
      h = Math.floor(64 + base * 8 + detail);
    } else if (biome === 'forest') {
      h = Math.floor(66 + base * 12 + detail);
    } else if (biome === 'mountains') {
      const ridge = Math.abs(base);
      h = Math.floor(75 + ridge * 40 + detail * 2);
    } else if (biome === 'desert') {
      h = Math.floor(65 + Math.abs(base) * 9 + detail);
    }
    return Math.max(30, Math.min(125, h));
  }

  hasTree(x, z) {
    const biome = this.getBiome(x, z);
    if (biome !== 'forest' && biome !== 'plains') return false;
    const rate = biome === 'forest' ? 0.045 : 0.008;
    const v = (Math.sin(x * 12.9898 + z * 78.233 + this.seed) * 43758.5453) % 1;
    return Math.abs(v) < rate;
  }

  // Get single block at world coord
  blockAt(x, y, z) {
    if (y < -64 || y > 130) return this.AIR;
    if (y === -64) return this.BEDROCK;

    const h = this.getHeight(x, z);
    const biome = this.getBiome(x, z);

    // Deep underground (deepslate + ores)
    if (y < 0) {
      const ore = Math.abs((Math.sin(x * 37.1 + y * 91.7 + z * 13.3) * 10000) % 1);
      if (y < -40 && ore < 0.015) return this.DIAMOND_ORE;
      if (ore < 0.03) return this.IRON_ORE;
      if (ore < 0.045) return this.GOLD_ORE;
      return this.DEEPSLATE;
    }

    // Mid underground (stone + ores)
    if (y < h - 4) {
      const ore = Math.abs((Math.sin(x * 17.3 + y * 53.9 + z * 71.1) * 10000) % 1);
      if (ore < 0.035) return this.COAL_ORE;
      if (ore < 0.02) return this.IRON_ORE;
      if (ore < 0.015) return this.COPPER_ORE;
      return this.STONE;
    }

    // Subsurface layers
    if (y < h) {
      if (biome === 'desert') return this.SANDSTONE;
      if (biome === 'ocean' || (h <= 63 && y >= 60)) return this.SAND;
      return this.DIRT;
    }

    // Surface layer
    if (y === h) {
      if (biome === 'desert') return this.SAND;
      if (biome === 'ocean') return h < 55 ? this.GRAVEL : this.SAND;
      if (h <= 63) return this.SAND; // Beach
      if (biome === 'mountains' && h >= 95) return this.SNOW;
      if (biome === 'mountains' && h >= 86) return this.STONE;
      return this.GRASS;
    }

    // Water above sea bed up to sea level 62
    if (y <= 62) {
      return this.WATER;
    }

    // Trees (trunk and leaves)
    // Check local trees in a 3x3 radius
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const tx = x + dx, tz = z + dz;
        const th = this.getHeight(tx, tz);
        if (th >= 63 && this.hasTree(tx, tz)) {
          const isBirch = ((tx * 31 + tz * 17) & 1) === 1;
          const log = isBirch ? this.BIRCH_LOG : this.OAK_LOG;
          const leaves = isBirch ? this.BIRCH_LEAVES : this.OAK_LEAVES;
          const treeHeight = 5;

          // Trunk
          if (dx === 0 && dz === 0 && y > th && y <= th + treeHeight) {
            return log;
          }

          // Leaves canopy
          const dy = y - (th + treeHeight);
          if (dy >= -2 && dy <= 1) {
            const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
            if (dist <= 3 && !(dx === 0 && dz === 0 && y <= th + treeHeight)) {
              return leaves;
            }
          }
        }
      }
    }

    // Flowers / Plants on ground
    if (y === h + 1 && (biome === 'plains' || biome === 'forest') && h >= 63) {
      const plant = Math.abs((Math.sin(x * 43.1 + z * 83.7) * 10000) % 1);
      if (plant < 0.02) return this.POPPY;
      if (plant < 0.04) return this.DANDELION;
    }

    return this.AIR;
  }

  // Generate 16x16x16 subchunk
  getSubchunk(cx, sy, cz) {
    const key = `${cx},${sy},${cz}`;
    if (this.subCache.has(key)) return this.subCache.get(key);

    const data = new Uint16Array(4096);
    const startX = cx * 16, startY = sy * 16, startZ = cz * 16;
    let anySolid = false;

    for (let x = 0; x < 16; x++) {
      const wx = startX + x;
      for (let z = 0; z < 16; z++) {
        const wz = startZ + z;
        for (let y = 0; y < 16; y++) {
          const wy = startY + y;
          const b = this.blockAt(wx, wy, wz);
          if (b !== this.AIR) {
            data[x * 256 + z * 16 + y] = b;
            anySolid = true;
          }
        }
      }
    }

    if (!anySolid && (sy < -4 || sy > 7)) {
      return null;
    }

    const compressed = zlib.deflateSync(Buffer.from(data.buffer));
    // Cache up to 1200 subchunks
    if (this.subCache.size > 1200) {
      this.subCache.delete(this.subCache.keys().next().value);
    }
    this.subCache.set(key, compressed);
    return compressed;
  }

  // Generate subchunks buffer for chunk column (cx, cz)
  getColumnBuffer(cx, cz) {
    const parts = [];
    // sy from -4 (-64) to 6 (96-112)
    for (let sy = -4; sy <= 6; sy++) {
      const buf = this.getSubchunk(cx, sy, cz);
      if (buf) {
        parts.push([sy, buf]);
      }
    }

    const out = [Buffer.from([parts.length])];
    for (const [sy, b] of parts) {
      const h = Buffer.alloc(5);
      h.writeInt8(sy, 0);
      h.writeUInt32LE(b.length, 1);
      out.push(h, b);
    }
    return Buffer.concat(out);
  }
}

module.exports = { ProceduralWorld };
