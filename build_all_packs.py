import json, zipfile, io, os, glob
from PIL import Image

def process_pack(zip_path, pack_id, pack_title, out_dir):
    print(f"\n==========================================")
    print(f"Processing: {pack_title} ({zip_path})")
    print(f"==========================================")
    z = zipfile.ZipFile(zip_path)
    
    # Collect block textures (skip _n and _s normal/specular maps)
    b_tex_data = {}
    for n in z.namelist():
        if (n.startswith('assets/minecraft/textures/block/') or '/textures/block/' in n) and n.endswith('.png'):
            base = os.path.basename(n)[:-4]
            if base.endswith('_n') or base.endswith('_s') or base.endswith('_e'):
                continue
            b_tex_data[base] = n
            
    print(f"Found {len(b_tex_data)} diffuse block textures.")
    
    # Helper to load and normalize to 64x64 RGBA
    def load_tile(name):
        if name not in b_tex_data:
            return None
        try:
            raw = z.read(b_tex_data[name])
            im = Image.open(io.BytesIO(raw)).convert('RGBA')
            w, h = im.size
            if h > w:
                im = im.crop((0, 0, w, w))
            if im.size != (64, 64):
                im = im.resize((64, 64), Image.Resampling.LANCZOS)
            if 'leaves' in name:
                ext = im.getextrema()
                r_diff = abs(ext[0][0] - ext[1][0]) + abs(ext[1][0] - ext[2][0])
                if r_diff < 5:
                    pixels = im.load()
                    for y in range(64):
                        for x in range(64):
                            r, g, b, a = pixels[x, y]
                            if a > 10:
                                pixels[x, y] = (int(r * 0.45), int(g * 0.85), int(b * 0.35), a)
            return im
        except Exception as e:
            return None

    def get_block_tex_names(raw_name):
        n = raw_name.replace('minecraft:', '').lower()
        if n == 'air': return None
        if 'grass_block' in n:
            top = 'grass_block_top' if 'grass_block_top' in b_tex_data else 'grass_top'
            bot = 'dirt'
            side = 'grass_block_side' if 'grass_block_side' in b_tex_data else 'grass_side'
            return (top, bot, side)
        if n in ('dirt_path', 'grass_path'):
            top = 'dirt_path_top' if 'dirt_path_top' in b_tex_data else ('grass_path_top' if 'grass_path_top' in b_tex_data else 'dirt')
            return (top, 'dirt', 'dirt')
        if 'podzol' in n: return ('podzol_top', 'dirt', 'podzol_side')
        if 'mycelium' in n: return ('mycelium_top', 'dirt', 'mycelium_side')
        if 'dirt' in n:
            if 'coarse' in n and 'coarse_dirt' in b_tex_data: return 'coarse_dirt'
            return 'dirt'
            
        for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia', 'mangrove', 'cherry', 'crimson', 'warped']:
            if wood in n and any(k in n for k in ['log', 'wood', 'stem']):
                stripped = 'stripped' in n
                prefix = f'stripped_{wood}_log' if stripped else f'{wood}_log'
                top = f'{prefix}_top' if f'{prefix}_top' in b_tex_data else (f'{wood}_log_top' if f'{wood}_log_top' in b_tex_data else prefix)
                side = prefix if prefix in b_tex_data else (f'{wood}_log' if f'{wood}_log' in b_tex_data else 'oak_log')
                return (top, top, side)
                
        for wood in ['dark_oak', 'spruce', 'oak', 'birch', 'jungle', 'acacia', 'iron']:
            if f'{wood}_door' in n:
                bot = f'{wood}_door_bottom' if f'{wood}_door_bottom' in b_tex_data else 'oak_door_bottom'
                top = f'{wood}_door_top' if f'{wood}_door_top' in b_tex_data else 'oak_door_top'
                return (top, bot, top)
        if 'door' in n: return ('oak_door_top', 'oak_door_bottom', 'oak_door_top')
        if 'trapdoor' in n:
            for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'iron']:
                if wood in n and f'{wood}_trapdoor' in b_tex_data: return f'{wood}_trapdoor'
            return 'oak_trapdoor'
            
        for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia']:
            if wood in n and f'{wood}_planks' in b_tex_data: return f'{wood}_planks'
        if any(k in n for k in ['planks', 'wooden_slab', 'wood', 'fence', 'gate']): return 'oak_planks'
        
        if 'mossy_stone_brick' in n and 'mossy_stone_bricks' in b_tex_data: return 'mossy_stone_bricks'
        if 'cracked_stone_brick' in n and 'cracked_stone_bricks' in b_tex_data: return 'cracked_stone_bricks'
        if any(k in n for k in ['stone_brick', 'stonebrick']) and 'stone_bricks' in b_tex_data: return 'stone_bricks'
        if any(k in n for k in ['brick_block', 'brick_stairs', 'brick_slab', 'brick']):
            return 'bricks' if 'bricks' in b_tex_data else 'brick'
            
        if 'mossy_cobble' in n and 'mossy_cobblestone' in b_tex_data: return 'mossy_cobblestone'
        if 'cobble' in n and 'cobblestone' in b_tex_data: return 'cobblestone'
        
        for s in ['smooth_stone', 'andesite', 'diorite', 'granite', 'deepslate', 'tuff', 'basalt', 'blackstone', 'calcite']:
            if s in n:
                if 'polished' in n and f'polished_{s}' in b_tex_data: return f'polished_{s}'
                if f'{s}_top' in b_tex_data: return (f'{s}_top', f'{s}_top', s)
                if s in b_tex_data: return s
        if 'stone' in n: return 'stone'
        
        if 'sandstone' in n:
            pre = 'red_sandstone' if 'red' in n else 'sandstone'
            top = f'{pre}_top' if f'{pre}_top' in b_tex_data else pre
            bot = f'{pre}_bottom' if f'{pre}_bottom' in b_tex_data else pre
            return (top, bot, pre)
            
        if 'glass' in n: return 'glass'
        if 'leaves' in n:
            for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia']:
                if wood in n and f'{wood}_leaves' in b_tex_data: return f'{wood}_leaves'
            return 'oak_leaves' if 'oak_leaves' in b_tex_data else 'leaves'
            
        if 'crafting_table' in n:
            top = 'crafting_table_top' if 'crafting_table_top' in b_tex_data else 'oak_planks'
            side = 'crafting_table_side' if 'crafting_table_side' in b_tex_data else 'oak_planks'
            return (top, 'oak_planks', side)
        if 'furnace' in n:
            top = 'furnace_top' if 'furnace_top' in b_tex_data else 'stone'
            front = 'furnace_front' if 'furnace_front' in b_tex_data else 'stone'
            return (top, top, front)
        if 'bookshelf' in n: return ('oak_planks', 'oak_planks', 'bookshelf' if 'bookshelf' in b_tex_data else 'oak_planks')
        if 'chest' in n: return 'oak_planks'
        
        for prefix in ['wool', 'concrete', 'terracotta']:
            if prefix in n:
                for c in ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']:
                    if c in n and f'{c}_{prefix}' in b_tex_data: return f'{c}_{prefix}'
                if f'white_{prefix}' in b_tex_data: return f'white_{prefix}'
                
        if 'water' in n: return 'water_still' if 'water_still' in b_tex_data else 'water'
        if 'lava' in n: return 'lava_still' if 'lava_still' in b_tex_data else 'lava'
        
        if n in b_tex_data: return n
        for k in b_tex_data:
            if k in n: return k
        return 'stone'

    # Read base world block list if available
    all_blocks = []
    if os.path.exists('world/meta.json'):
        try:
            m = json.load(open('world/meta.json'))
            all_blocks.extend(m.get('blocks', []))
        except: pass
        
    all_blocks.extend([
        'minecraft:air', 'minecraft:stone', 'minecraft:dirt', 'minecraft:grass_block',
        'minecraft:sand', 'minecraft:gravel', 'minecraft:water', 'minecraft:lava',
        'minecraft:oak_log', 'minecraft:oak_leaves', 'minecraft:oak_planks', 'minecraft:cobblestone',
        'minecraft:birch_log', 'minecraft:birch_leaves', 'minecraft:birch_planks',
        'minecraft:spruce_log', 'minecraft:spruce_leaves', 'minecraft:spruce_planks',
        'minecraft:dark_oak_log', 'minecraft:dark_oak_leaves', 'minecraft:dark_oak_planks',
        'minecraft:coal_ore', 'minecraft:iron_ore', 'minecraft:gold_ore', 'minecraft:diamond_ore',
        'minecraft:emerald_ore', 'minecraft:copper_ore', 'minecraft:redstone_ore', 'minecraft:lapis_ore',
        'minecraft:deepslate', 'minecraft:deepslate_coal_ore', 'minecraft:deepslate_iron_ore',
        'minecraft:deepslate_diamond_ore', 'minecraft:sandstone', 'minecraft:snow',
        'minecraft:glass', 'minecraft:crafting_table', 'minecraft:furnace', 'minecraft:chest',
        'minecraft:bedrock', 'minecraft:obsidian', 'minecraft:bricks', 'minecraft:stone_bricks',
        'minecraft:oak_door', 'minecraft:spruce_door', 'minecraft:dark_oak_door', 'minecraft:iron_door',
        'minecraft:oak_stairs', 'minecraft:spruce_stairs', 'minecraft:stone_stairs', 'minecraft:brick_stairs',
        'minecraft:oak_slab', 'minecraft:white_wool', 'minecraft:red_wool', 'minecraft:blue_wool', 'minecraft:yellow_wool',
        'minecraft:iron_block', 'minecraft:gold_block', 'minecraft:diamond_block', 'minecraft:emerald_block',
        'minecraft:dandelion', 'minecraft:poppy'
    ])
    all_blocks = list(dict.fromkeys(all_blocks))

    block_map = {}
    needed_tex = set()
    for b in all_blocks:
        res = get_block_tex_names(b)
        if res is None:
            block_map[b] = None
            continue
        if isinstance(res, str): top, bot, side = res, res, res
        else: top, bot, side = res
        block_map[b] = (top, bot, side)
        needed_tex.add(top)
        needed_tex.add(bot)
        needed_tex.add(side)

    sorted_textures = sorted(list(needed_tex))
    print(f"Packed textures: {len(sorted_textures)}")

    GRID = 32
    TILE_SIZE = 64
    atlas_size = GRID * TILE_SIZE

    atlas = Image.new('RGBA', (atlas_size, atlas_size), (0, 0, 0, 0))
    tex_coords = {}

    for idx, tname in enumerate(sorted_textures):
        tile_im = load_tile(tname)
        if tile_im is None:
            tile_im = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (128, 128, 128, 255))
        row = idx // GRID
        col = idx % GRID
        atlas.paste(tile_im, (col * TILE_SIZE, row * TILE_SIZE))
        tex_coords[tname] = idx

    os.makedirs(out_dir, exist_ok=True)
    atlas_path = os.path.join(out_dir, 'atlas.png')
    atlas.save(atlas_path, optimize=True)
    print(f"Saved: {atlas_path} ({os.path.getsize(atlas_path)} bytes)")

    block_uv_map = {}
    for b, val in block_map.items():
        if val is None:
            block_uv_map[b] = None
        else:
            top_name, bot_name, side_name = val
            top_idx = tex_coords.get(top_name, tex_coords.get('stone', 0))
            bot_idx = tex_coords.get(bot_name, tex_coords.get('dirt', 0))
            side_idx = tex_coords.get(side_name, tex_coords.get('stone', 0))
            block_uv_map[b] = [top_idx, bot_idx, side_idx]

    output_meta = {
        'id': pack_id,
        'title': pack_title,
        'grid': GRID,
        'tileSize': TILE_SIZE,
        'atlasSize': atlas_size,
        'blocks': block_uv_map,
        'textures': tex_coords
    }
    meta_path = os.path.join(out_dir, 'atlas_meta.json')
    with open(meta_path, 'w') as f:
        json.dump(output_meta, f)
    print(f"Saved: {meta_path}")

def main():
    packs = [
        ('Alta Pack C1 EXTRALITE.zip', 'alta', 'Alta Pack C1 (Default)', 'public/packs/alta'),
        ('N87 PBR Pack 128x 1.21.11 16_09_2026.zip', 'pbr', 'N87 PBR Pack 128x', 'public/packs/pbr'),
    ]
    # Find RealisCraft zip
    realis = glob.glob('*RealisCraft*.zip')
    if realis:
        packs.append((realis[0], 'realiscraft', 'RealisCraft Realistic', 'public/packs/realiscraft'))

    for zip_path, pid, title, out in packs:
        if os.path.exists(zip_path):
            process_pack(zip_path, pid, title, out)
            if pid == 'alta':
                # Also copy alta to root public/ for backwards compatibility
                import shutil
                shutil.copyfile(os.path.join(out, 'atlas.png'), 'public/atlas.png')
                shutil.copyfile(os.path.join(out, 'atlas_meta.json'), 'public/atlas_meta.json')
                print("Updated default public/atlas.png and public/atlas_meta.json")

    # Generate packs manifest
    manifest = [
        {'id': 'alta', 'name': '🌿 Alta Pack C1 (Default Stylized)'},
        {'id': 'pbr', 'name': '💎 N87 PBR Pack 128x (HD Ultra)'},
        {'id': 'realiscraft', 'name': '🏰 RealisCraft (Photorealistic)'}
    ]
    with open('public/packs/manifest.json', 'w') as f:
        json.dump(manifest, f)
    print("Saved public/packs/manifest.json")

if __name__ == '__main__':
    main()
