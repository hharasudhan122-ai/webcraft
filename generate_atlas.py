import json, zipfile, io, os
from PIL import Image

z = zipfile.ZipFile('Alta Pack C1 EXTRALITE.zip')
meta = json.load(open('world/meta.json'))

# Collect all block textures from zip
b_tex_data = {}
for n in z.namelist():
    if n.startswith('assets/minecraft/textures/block/') and n.endswith('.png'):
        name = os.path.basename(n)[:-4]
        b_tex_data[name] = n

print(f"Total available block textures: {len(b_tex_data)}")

# Helper to load and normalize an image to 64x64 RGBA
def load_tile(name):
    if name not in b_tex_data:
        return None
    raw = z.read(b_tex_data[name])
    im = Image.open(io.BytesIO(raw)).convert('RGBA')
    w, h = im.size
    if h > w:
        im = im.crop((0, 0, w, w))
    if im.size != (64, 64):
        im = im.resize((64, 64), Image.Resampling.LANCZOS)
    
    # Check if grayscale foliage/leaves that need green tinting
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

def get_block_tex_names(raw_name):
    n = raw_name.replace('minecraft:', '').lower()
    
    if n == 'air':
        return None
    
    # Grass
    if 'grass_block' in n:
        return ('grass_block_top', 'dirt', 'grass_block_side')
    if n in ('dirt_path', 'grass_path'):
        top = 'dirt_path_top' if 'dirt_path_top' in b_tex_data else 'grass_path_top'
        return (top, 'dirt', 'dirt_path_side')
    if 'podzol' in n:
        return ('podzol_top', 'dirt', 'podzol_side')
    if 'mycelium' in n:
        return ('mycelium_top', 'dirt', 'mycelium_side')
    if 'dirt' in n:
        if 'coarse' in n: return 'coarse_dirt'
        if 'rooted' in n: return 'rooted_dirt'
        return 'dirt'
        
    # Logs & Wood
    for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia', 'mangrove', 'cherry', 'crimson', 'warped']:
        if wood in n and any(k in n for k in ['log', 'wood', 'stem']):
            stripped = 'stripped' in n
            prefix = f'stripped_{wood}_log' if stripped else f'{wood}_log'
            top = f'{prefix}_top' if f'{prefix}_top' in b_tex_data else (f'{wood}_log_top' if f'{wood}_log_top' in b_tex_data else prefix)
            side = prefix if prefix in b_tex_data else (f'{wood}_log' if f'{wood}_log' in b_tex_data else 'oak_log')
            return (top, top, side)
            
    # Doors
    for wood in ['dark_oak', 'spruce', 'oak', 'birch', 'jungle', 'acacia', 'iron', 'crimson', 'warped']:
        if f'{wood}_door' in n:
            bot = f'{wood}_door_bottom' if f'{wood}_door_bottom' in b_tex_data else 'oak_door_bottom'
            top = f'{wood}_door_top' if f'{wood}_door_top' in b_tex_data else 'oak_door_top'
            return (top, bot, top)
    if 'door' in n:
        return ('oak_door_top', 'oak_door_bottom', 'oak_door_top')
    if 'trapdoor' in n:
        return 'oak_trapdoor'
        
    # Planks, stairs, slabs, fences, gates
    for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia', 'mangrove', 'cherry', 'crimson', 'warped']:
        if wood in n:
            if 'trapdoor' in n and f'{wood}_trapdoor' in b_tex_data:
                return f'{wood}_trapdoor'
            if f'{wood}_planks' in b_tex_data:
                return f'{wood}_planks'
    if any(k in n for k in ['planks', 'wooden_slab', 'wood', 'fence', 'gate']):
        return 'oak_planks'
        
    # Bricks & Stone Bricks
    if 'mossy_stone_brick' in n: return 'mossy_stone_bricks'
    if 'cracked_stone_brick' in n: return 'cracked_stone_bricks'
    if 'chiseled_stone_brick' in n: return 'chiseled_stone_bricks'
    if any(k in n for k in ['stone_brick', 'stonebrick']): return 'stone_bricks'
    if 'nether_brick' in n:
        if 'red' in n: return 'red_nether_bricks' if 'red_nether_bricks' in b_tex_data else 'nether_bricks'
        return 'nether_bricks'
    if any(k in n for k in ['brick_block', 'brick_stairs', 'brick_slab', 'brick_double_slab', 'brick']):
        return 'bricks'
        
    # Stones
    if 'mossy_cobble' in n: return 'mossy_cobblestone'
    if 'cobble' in n: return 'cobblestone'
    for s in ['smooth_stone', 'andesite', 'diorite', 'granite', 'deepslate', 'tuff', 'basalt', 'blackstone', 'calcite']:
        if s in n:
            if 'polished' in n and f'polished_{s}' in b_tex_data: return f'polished_{s}'
            if f'{s}_top' in b_tex_data: return (f'{s}_top', f'{s}_top', s)
            if s in b_tex_data: return s
    if 'stone' in n: return 'stone'
    
    # Sandstone
    if 'sandstone' in n:
        pre = 'red_sandstone' if 'red' in n else 'sandstone'
        top = f'{pre}_top' if f'{pre}_top' in b_tex_data else pre
        bot = f'{pre}_bottom' if f'{pre}_bottom' in b_tex_data else pre
        return (top, bot, pre)
        
    # Glass
    if 'glass' in n:
        for c in ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']:
            if c in n:
                tex = f'{c}_stained_glass'
                if tex in b_tex_data: return tex
        return 'glass'
        
    # Leaves
    if 'leaves' in n:
        for wood in ['dark_oak', 'oak', 'spruce', 'birch', 'jungle', 'acacia', 'azalea', 'cherry']:
            if wood in n and f'{wood}_leaves' in b_tex_data: return f'{wood}_leaves'
        return 'oak_leaves'
        
    # Crafting, Furnace, Bookshelf, Chest, Barrel
    if 'crafting_table' in n:
        return ('crafting_table_top', 'oak_planks', 'crafting_table_side')
    if 'furnace' in n or 'blast_furnace' in n:
        return ('furnace_top', 'furnace_top', 'furnace_front')
    if 'bookshelf' in n:
        return ('oak_planks', 'oak_planks', 'bookshelf')
    if 'chest' in n:
        return 'oak_planks'
    if 'barrel' in n:
        return ('barrel_top', 'barrel_bottom', 'barrel_side')
    if 'hay_block' in n:
        return ('hay_block_top', 'hay_block_top', 'hay_block_side')
        
    # Quartz
    if 'quartz' in n:
        top = 'quartz_block_top' if 'quartz_block_top' in b_tex_data else 'quartz_block_side'
        return (top, top, 'quartz_block_side')
        
    # Wool & Carpet & Concrete & Terracotta
    for prefix in ['wool', 'carpet', 'concrete_powder', 'concrete', 'terracotta']:
        if prefix in n or (prefix == 'wool' and 'wool' in n):
            for c in ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']:
                if c in n:
                    target = f'{c}_{prefix}'
                    if target in b_tex_data: return target
                    if f'{c}_wool' in b_tex_data: return f'{c}_wool'
            if prefix in b_tex_data: return prefix
            if f'white_{prefix}' in b_tex_data: return f'white_{prefix}'
            if 'white_wool' in b_tex_data: return 'white_wool'
            
    # Water & Lava
    if 'water' in n: return 'water_still' if 'water_still' in b_tex_data else 'water'
    if 'lava' in n: return 'lava_still' if 'lava_still' in b_tex_data else 'lava'
    
    # Direct match in textures
    if n in b_tex_data: return n
    for k in b_tex_data:
        if k in n: return k
    return 'stone'

# Gather all unique texture names needed
needed_tex = set()
block_map = {}

all_blocks = list(meta['blocks']) + [
    'minecraft:glass', 'minecraft:oak_planks', 'minecraft:cobblestone', 'minecraft:stone',
    'minecraft:crafting_table', 'minecraft:furnace', 'minecraft:chest', 'minecraft:torch',
    'minecraft:spruce_door', 'minecraft:oak_door', 'minecraft:dark_oak_door', 'minecraft:iron_door',
    'minecraft:spruce_stairs', 'minecraft:oak_stairs', 'minecraft:brick_stairs', 'minecraft:stone_stairs',
    'minecraft:bricks', 'minecraft:stone_bricks', 'minecraft:sandstone', 'minecraft:glass_pane',
    'minecraft:white_wool', 'minecraft:red_wool', 'minecraft:blue_wool', 'minecraft:yellow_wool',
    'minecraft:iron_block', 'minecraft:gold_block', 'minecraft:diamond_block', 'minecraft:emerald_block',
    'minecraft:water', 'minecraft:lava', 'minecraft:bedrock', 'minecraft:obsidian'
]

for b in all_blocks:
    res = get_block_tex_names(b)
    if res is None:
        block_map[b] = None
        continue
    if isinstance(res, str):
        top, bot, side = res, res, res
    else:
        top, bot, side = res
    block_map[b] = (top, bot, side)
    needed_tex.add(top)
    needed_tex.add(bot)
    needed_tex.add(side)

extra_essentials = [
    'stone', 'dirt', 'grass_block_top', 'grass_block_side', 'cobblestone', 'oak_planks',
    'oak_log', 'oak_log_top', 'spruce_planks', 'spruce_log', 'spruce_log_top',
    'birch_planks', 'birch_log', 'birch_log_top', 'bricks', 'stone_bricks', 'glass',
    'sand', 'gravel', 'clay', 'snow', 'ice', 'water_still', 'lava_still',
    'oak_door_top', 'oak_door_bottom', 'spruce_door_top', 'spruce_door_bottom',
    'dark_oak_door_top', 'dark_oak_door_bottom', 'iron_door_top', 'iron_door_bottom',
    'iron_block', 'gold_block', 'diamond_block', 'emerald_block', 'coal_block',
    'furnace_front', 'furnace_side', 'furnace_top', 'crafting_table_top', 'crafting_table_side', 'crafting_table_front',
    'bookshelf', 'barrel_top', 'barrel_side', 'barrel_bottom', 'sponge', 'tnt_top', 'tnt_side', 'tnt_bottom'
]
for e in extra_essentials:
    if e in b_tex_data:
        needed_tex.add(e)

sorted_textures = sorted(list(needed_tex))
print(f"Total unique textures to pack in atlas: {len(sorted_textures)}")

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

os.makedirs('public', exist_ok=True)
atlas.save('public/atlas.png', optimize=True)
print(f"Saved public/atlas.png (size: {os.path.getsize('public/atlas.png')} bytes)")

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
    'grid': GRID,
    'tileSize': TILE_SIZE,
    'atlasSize': atlas_size,
    'blocks': block_uv_map,
    'textures': tex_coords
}
with open('public/atlas_meta.json', 'w') as f:
    json.dump(output_meta, f)
print("Saved public/atlas_meta.json")
