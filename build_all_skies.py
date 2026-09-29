import os, io, zipfile, json
from PIL import Image, ImageEnhance, ImageOps

SKIES_DIR = 'public/skies'
os.makedirs(SKIES_DIR, exist_ok=True)

def slice_cubemap_3x2(img, target_size=(512, 512)):
    w, h = img.size
    fw, fh = w // 3, h // 2
    
    # 3x2 Grid standard OptiFine / MCPatcher / FabricSkyboxes:
    # Row 0: ny (-Y), py (+Y), pz (+Z)
    # Row 1: nx (-X), nz (-Z), px (+X)
    faces = {
        'ny': img.crop((0, 0, fw, fh)),
        'py': img.crop((fw, 0, fw*2, fh)),
        'pz': img.crop((fw*2, 0, fw*3, fh)),
        'nx': img.crop((0, fh, fw, fh*2)),
        'nz': img.crop((fw, fh, fw*2, fh*2)),
        'px': img.crop((fw*2, fh, fw*3, fh*2))
    }
    out = {}
    for k, f in faces.items():
        if f.mode != 'RGB':
            f = f.convert('RGB')
        out[k] = f.resize(target_size, Image.Resampling.LANCZOS)
    return out

def save_faces(faces_dict, out_path):
    os.makedirs(out_path, exist_ok=True)
    for name, img in faces_dict.items():
        img.save(os.path.join(out_path, f'{name}.jpg'), quality=85)

# --- 1. Realistic Atmosphere ---
def process_realistic():
    print('Processing Realistic Atmosphere...')
    zip_path = 'realistic-atmosphere-1-0.zip'
    if not os.path.exists(zip_path):
        print(f'Warning: {zip_path} not found')
        return

    with zipfile.ZipFile(zip_path, 'r') as zf:
        def get_img(entry_name):
            data = zf.read(entry_name)
            return Image.open(io.BytesIO(data)).convert('RGB')

        # Day (clouds.png)
        day_img = get_img('assets/minecraft/mcpatcher/sky/world0/clouds.png')
        save_faces(slice_cubemap_3x2(day_img), f'{SKIES_DIR}/realistic/day')

        # Sunset (sunset.png)
        sunset_img = get_img('assets/minecraft/mcpatcher/sky/world0/sunset.png')
        save_faces(slice_cubemap_3x2(sunset_img), f'{SKIES_DIR}/realistic/sunset')

        # Night (night.png with starfield blend)
        night_img = get_img('assets/minecraft/mcpatcher/sky/world0/night.png')
        save_faces(slice_cubemap_3x2(night_img), f'{SKIES_DIR}/realistic/night')

        # Rain / Storm (storm.png)
        storm_img = get_img('assets/minecraft/mcpatcher/sky/world0/storm.png')
        save_faces(slice_cubemap_3x2(storm_img), f'{SKIES_DIR}/realistic/rain')

        # Thunderstorm (thunderstorm.png)
        thunder_img = get_img('assets/minecraft/mcpatcher/sky/world0/thunderstorm.png')
        save_faces(slice_cubemap_3x2(thunder_img), f'{SKIES_DIR}/realistic/thunder')

        # Sun & Moon icons
        try:
            sun_data = zf.read('assets/minecraft/textures/environment/sun.png')
            with open(f'{SKIES_DIR}/realistic/sun.png', 'wb') as f:
                f.write(sun_data)
        except Exception as e:
            print('sun err:', e)

# --- 2. Dramatic Skies ---
def process_dramatic():
    print('Processing Dramatic Skies...')
    zip_path = 'Dramatic Skys Demo 1.5.3.36.6.zip'
    if not os.path.exists(zip_path):
        print(f'Warning: {zip_path} not found')
        return

    with zipfile.ZipFile(zip_path, 'r') as zf:
        def get_img(entry_name):
            data = zf.read(entry_name)
            return Image.open(io.BytesIO(data)).convert('RGB')

        # Day
        day_img = get_img('assets/skybox/day.png')
        save_faces(slice_cubemap_3x2(day_img), f'{SKIES_DIR}/dramatic/day')

        # Sunset (sun.png in skybox)
        sunset_img = get_img('assets/skybox/sun.png')
        save_faces(slice_cubemap_3x2(sunset_img), f'{SKIES_DIR}/dramatic/sunset')

        # Night (night.png)
        night_img = get_img('assets/skybox/night.png')
        save_faces(slice_cubemap_3x2(night_img), f'{SKIES_DIR}/dramatic/night')

        # Stars
        stars_img = get_img('assets/skybox/stars.png')
        save_faces(slice_cubemap_3x2(stars_img), f'{SKIES_DIR}/dramatic/stars')

        # Rain (dramatically overcast version of day sky)
        rain_img = ImageEnhance.Color(ImageEnhance.Brightness(day_img).enhance(0.42)).enhance(0.25)
        save_faces(slice_cubemap_3x2(rain_img), f'{SKIES_DIR}/dramatic/rain')

        # Thunder (dark storm)
        thunder_img = ImageEnhance.Color(ImageEnhance.Brightness(day_img).enhance(0.2)).enhance(0.1)
        save_faces(slice_cubemap_3x2(thunder_img), f'{SKIES_DIR}/dramatic/thunder')

        # Sun & Moon
        try:
            sun_data = zf.read('assets/minecraft/textures/environment/sun.png')
            with open(f'{SKIES_DIR}/dramatic/sun.png', 'wb') as f:
                f.write(sun_data)
        except:
            pass

# --- 3. Anime Clouds (Default) ---
def process_anime():
    print('Processing Anime Clouds...')
    # Use existing public/sky faces
    src_sky = 'public/sky'
    if os.path.exists(src_sky):
        day_faces = {}
        for name in ['px', 'nx', 'py', 'ny', 'pz', 'nz']:
            f_path = os.path.join(src_sky, f'{name}.png')
            if os.path.exists(f_path):
                img = Image.open(f_path).convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
                day_faces[name] = img
        
        save_faces(day_faces, f'{SKIES_DIR}/anime/day')

        # Sunset
        sunset_faces = {}
        for k, img in day_faces.items():
            # Warm orange-gold tint
            r, g, b = img.split()
            r = r.point(lambda i: min(255, int(i * 1.25)))
            g = g.point(lambda i: int(i * 0.9))
            b = b.point(lambda i: int(i * 0.65))
            sunset_faces[k] = Image.merge('RGB', (r, g, b))
        save_faces(sunset_faces, f'{SKIES_DIR}/anime/sunset')

        # Night
        night_faces = {}
        for k, img in day_faces.items():
            r, g, b = img.split()
            r = r.point(lambda i: int(i * 0.12))
            g = g.point(lambda i: int(i * 0.18))
            b = b.point(lambda i: min(255, int(i * 0.42)))
            night_faces[k] = Image.merge('RGB', (r, g, b))
        save_faces(night_faces, f'{SKIES_DIR}/anime/night')

        # Rain
        rain_faces = {}
        for k, img in day_faces.items():
            gray = ImageOps.grayscale(img).convert('RGB')
            dark = ImageEnhance.Brightness(gray).enhance(0.45)
            rain_faces[k] = dark
        save_faces(rain_faces, f'{SKIES_DIR}/anime/rain')

def write_manifest():
    manifest = [
        {
            "id": "anime",
            "name": "☁️ Anime Clouds (Default)",
            "desc": "Stylized vibrant anime cloudscapes with smooth day/night cycle",
            "times": ["day", "sunset", "night", "rain"]
        },
        {
            "id": "realistic",
            "name": "🌅 Realistic Atmosphere",
            "desc": "Ultra realistic sky & clouds, fiery sunsets, starry night, overcast rain & thunder",
            "times": ["day", "sunset", "night", "rain", "thunder"]
        },
        {
            "id": "dramatic",
            "name": "⚡ Dramatic Skies",
            "desc": "Photorealistic 3D celestial skybox, dynamic cloud layers & vivid cosmic night",
            "times": ["day", "sunset", "night", "rain", "thunder"]
        }
    ]
    with open(f'{SKIES_DIR}/manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print('Manifest written successfully')

if __name__ == '__main__':
    process_realistic()
    process_dramatic()
    process_anime()
    write_manifest()
    print('All skies processed!')
