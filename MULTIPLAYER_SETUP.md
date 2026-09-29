# WebCraft – Supabase Public Rooms Setup

This is **optional**. Without it, friends can still join via room code or LAN.

## What it does
When a host checks "Publish to public rooms list", the room appears in the **Public Rooms** tab so internet strangers can discover and join it.

---

## Steps

### 1. Create a Supabase project
Go to https://supabase.com → New Project → note your **Project URL** and **anon public key**.

### 2. Create the table
In the Supabase dashboard, go to **SQL Editor** and run:

```sql
create table webcraft_rooms (
  code        text primary key,
  world_name  text,
  host_name   text,
  created_at  timestamptz default now()
);

-- Allow public read (for room browsing)
alter table webcraft_rooms enable row level security;
create policy "Public read" on webcraft_rooms for select using (true);
create policy "Server write" on webcraft_rooms for all using (true);
```

### 3. Update config.json
```json
{
  "port": 3000,
  "respawnRadius": 8,
  "spawnOverride": null,
  "supabase": {
    "url": "https://YOUR_PROJECT_ID.supabase.co",
    "anonKey": "eyJhbGciOi..."
  }
}
```

### 4. Restart the server
```bash
node server/index.js
```

Rooms published by hosts will now appear in the **🌐 Public Rooms** tab for anyone visiting your deployed URL.

---

## LAN (no Supabase needed)

1. Host clicks **📡 LAN / WiFi → Host LAN Room**
2. Server shows their local IP (e.g. `192.168.1.42:3000`)
3. Friends on the same WiFi open `http://192.168.1.42:3000` in their browser
4. They click **📡 LAN / WiFi → Join a LAN Room**, enter the IP and room code

No internet required. Works entirely on your local network.
