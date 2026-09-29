#!/usr/bin/env python3
"""Convert a Bedrock .mcworld (or world folder) -> world/world.bin + world/meta.json
Usage: python3 convert.py <file.mcworld|folder> [outdir]
Needs: pip install amulet-leveldb
Block states are dropped (name only). Overworld only."""
import sys, os, struct, zlib, json, zipfile, tempfile, shutil
from leveldb import LevelDB

def rd_nbt_payload(b, o, t):
    if t == 1: return None, o+1
    if t == 2: return None, o+2
    if t == 3: return struct.unpack_from('<i', b, o)[0], o+4
    if t == 4: return None, o+8
    if t == 5: return None, o+4
    if t == 6: return None, o+8
    if t == 7: n = struct.unpack_from('<i', b, o)[0]; return None, o+4+n
    if t == 8:
        n = struct.unpack_from('<H', b, o)[0]; return b[o+2:o+2+n].decode('utf8','replace'), o+2+n
    if t == 9:
        it = b[o]; n = struct.unpack_from('<i', b, o+1)[0]; o += 5
        for _ in range(n): _, o = rd_nbt_payload(b, o, it)
        return None, o
    if t == 10:
        d = {}
        while b[o] != 0:
            tt = b[o]; nl = struct.unpack_from('<H', b, o+1)[0]
            name = b[o+3:o+3+nl].decode(); v, o = rd_nbt_payload(b, o+3+nl, tt); d[name] = v
        return d, o+1
    if t == 11: n = struct.unpack_from('<i', b, o)[0]; return None, o+4+4*n
    if t == 12: n = struct.unpack_from('<i', b, o)[0]; return None, o+4+8*n
    raise ValueError(t)

def rd_named(b, o):
    t = b[o]; nl = struct.unpack_from('<H', b, o+1)[0]
    return rd_nbt_payload(b, o+3+nl, t)

def parse_sub(v):
    ver = v[0]
    if ver in (8, 9):
        ns = v[1]; o = 2 + (1 if ver == 9 else 0)
    elif ver == 1: ns = 1; o = 1
    else: return None
    hdr = v[o]; o += 1
    bits = hdr >> 1
    if bits == 0:
        idx = [0]*4096
    else:
        per = 32 // bits; nw = -(-4096 // per); mask = (1 << bits) - 1
        words = struct.unpack_from('<%dI' % nw, v, o); o += 4*nw
        idx = [0]*4096; i = 0
        for w in words:
            for j in range(per):
                if i >= 4096: break
                idx[i] = (w >> (j*bits)) & mask; i += 1
    n = struct.unpack_from('<i', v, o)[0] if bits else 1
    o += 4 if bits else 4
    if bits == 0: n = struct.unpack_from('<i', v, o-4)[0]
    pal = []
    for _ in range(n):
        d, o = rd_named(v, o); pal.append(d['name'])
    return idx, pal

def main():
    src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else 'world'
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    if os.path.isfile(src):
        zipfile.ZipFile(src).extractall(tmp); root = tmp
        for r, ds, fs in os.walk(tmp):
            if 'db' in ds: root = r; break
    else: root = src
    db = LevelDB(os.path.join(root, 'db'))
    names = {'minecraft:air': 0}
    blobs = []; index = []
    top = {}  # (x,z)->max y solid
    for k, v in db.iterate():
        if len(k) != 10 or k[8] != 47: continue
        cx, cz = struct.unpack('<ii', k[:8]); sy = struct.unpack('b', k[9:10])[0]
        r = parse_sub(v)
        if not r: continue
        idx, pal = r
        ids = []
        for p in pal:
            if p not in names: names[p] = len(names)
            ids.append(names[p])
        cells = bytes(0)
        vals = [ids[pi] for pi in idx]
        if not any(vals): continue
        arr = struct.pack('<4096H', *vals)
        # bedrock order: index = x*256 + z*16 + y
        for x in range(16):
            for z in range(16):
                base = x*256 + z*16
                for y in range(15, -1, -1):
                    if vals[base+y]:
                        key = (cx*16+x, cz*16+z); wy = sy*16+y
                        if top.get(key, -999) < wy: top[key] = wy
                        break
        blobs.append(zlib.compress(arr, 6)); index.append((cx, sy, cz))
    with open(os.path.join(out, 'world.bin'), 'wb') as f:
        offs = []; pos = 0
        for b in blobs: offs.append((pos, len(b))); f.write(b); pos += len(b)
    spawn = None
    try:
        d = open(os.path.join(root, 'level.dat'), 'rb').read()[8:]
        lv, _ = rd_named(d, 0)
        spawn = [lv.get('SpawnX'), lv.get('SpawnY'), lv.get('SpawnZ')]
    except Exception as e: print('spawn read failed', e)
    inv = [None]*len(names)
    for n, i in names.items(): inv[i] = n
    meta = {'blocks': inv, 'spawn': spawn,
            'chunks': [[a, b, c, o[0], o[1]] for (a, b, c), o in zip(index, offs)]}
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
    json.dump({'%d,%d' % k: v for k, v in top.items()}, open(os.path.join(out, 'top.json'), 'w'))
    print('subchunks', len(index), 'block types', len(names), 'spawn', spawn)
    shutil.rmtree(tmp, ignore_errors=True)
main()
