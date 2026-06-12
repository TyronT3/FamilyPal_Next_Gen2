# 🌟 FamilyPal

A free, self-hosted family life management suite. One login, three apps — all running in your browser, all powered by the same free database.

**Apps:**
- 🥫 **PantryPal** — Pantry tracker, shopping list, barcode scanning
- 🍼 **BabyPal** — Baby feed, sleep, diaper and pump tracker
- 🧹 **ChoresPal** — Household chores, points, goals and prizes

**Built with:** Plain HTML/CSS/JS · Supabase (free database) · GitHub Pages (free hosting) · QuaggaJS (barcode scanning) · Open Food Facts API (product lookup)

---

## ✨ Features

### 🥫 PantryPal
- Track sealed stock and open items separately
- Barcode scanner — auto-fills product details from Open Food Facts
- Unit of measure per item (Bottle / Jar / Box / Bag / Can etc.)
- Item rating — ❤️ Love it / 😬 Don't buy again / 😐 Not sure
- Expiry date tracking with warnings
- Priority items — always appear on shopping list
- Custom categories with emoji
- Sort and group items by category
- Smart low stock logic with per-item minimum stock override
- Full shopping mode — tickable list, in-store scanning, WhatsApp share
- Offline support in shopping mode — syncs when back online
- Price tracking per purchase
- Quick inventory mode for stocktakes
- Full history log per item

### 🍼 BabyPal
- Bottle feed tracking (ml + time)
- Breast feed tracking (duration + side)
- Wet and soiled diaper logging (one tap)
- Smart sleep tracking with live timer, wake-up button and long-sleep warning
- Pump session logging
- Mama's meal diary (full notes, correlate with baby fussiness)
- Today summary dashboard
- 7-day history timeline
- Trend charts (milk, diapers, sleep)
- Configurable sleep warning threshold

### 🧹 ChoresPal
- Daily, weekly, monthly and once-off chores
- Same chore can be logged multiple times per day (e.g. diaper changes)
- Assigned to Tyron, Ansonette, or rotating
- Points per chore
- Together option — both people share the points
- Undo last log
- Live Tyron vs Ansonette score banner
- 🏆 Goal tracking — set weekly and monthly goals with prizes
- Winner banner when a goal period ends
- Full history (14 days)

---

## 🚀 Setup Guide

### What you'll need
- A free [GitHub](https://github.com) account
- A free [Supabase](https://supabase.com) account
- Any modern browser (Chrome recommended for barcode scanning)

---

### Step 1 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → sign up → **New Project**
2. Give it a name (e.g. `familypal`), set a password, choose a region
3. Wait ~2 minutes for it to spin up
4. Go to **SQL Editor → New query**, paste and run:

```sql
-- PantryPal
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category_id uuid,
  barcode text,
  emoji text default '🥫',
  qty_stocked int default 1,
  qty_open int default 0,
  min_stock int default 0,
  expiry_date date,
  priority boolean default false,
  unit_of_measure text default null,
  rating text default 'unsure',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade,
  action text,
  note text,
  price decimal(10,2),
  created_at timestamptz default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text default '📦',
  created_at timestamptz default now()
);

alter table items add constraint fk_category
  foreign key (category_id) references categories(id) on delete set null;

-- BabyPal
create table baby_feeds (
  id uuid primary key default gen_random_uuid(),
  feed_type text not null,
  amount_ml int,
  duration_mins int,
  breast_side text,
  notes text,
  logged_at timestamptz default now()
);

create table baby_diapers (
  id uuid primary key default gen_random_uuid(),
  diaper_type text not null,
  notes text,
  logged_at timestamptz default now()
);

create table baby_sleep (
  id uuid primary key default gen_random_uuid(),
  sleep_start timestamptz,
  sleep_end timestamptz,
  duration_mins int,
  notes text,
  logged_at timestamptz default now()
);

create table baby_pumping (
  id uuid primary key default gen_random_uuid(),
  amount_ml int not null,
  duration_mins int,
  notes text,
  logged_at timestamptz default now()
);

create table mama_meals (
  id uuid primary key default gen_random_uuid(),
  meal_type text,
  description text not null,
  notes text,
  logged_at timestamptz default now()
);

-- ChoresPal
create table chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text default '🧹',
  frequency text default 'daily',
  assigned_to text default 'rotating',
  points int default 1,
  active boolean default true,
  created_at timestamptz default now()
);

create table chore_logs (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid references chores(id) on delete cascade,
  completed_by text not null,
  completed_at timestamptz default now(),
  shared boolean default false,
  completed_by_2 text default null,
  notes text
);

create table chore_goals (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  prize text not null,
  points_target int default null,
  created_by text not null,
  confirmed boolean default false,
  confirmed_by text default null,
  start_date date not null,
  end_date date not null,
  winner text default null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Disable RLS on all tables
alter table items disable row level security;
alter table history disable row level security;
alter table categories disable row level security;
alter table baby_feeds disable row level security;
alter table baby_diapers disable row level security;
alter table baby_sleep disable row level security;
alter table baby_pumping disable row level security;
alter table mama_meals disable row level security;
alter table chores disable row level security;
alter table chore_logs disable row level security;
alter table chore_goals disable row level security;

-- Default categories for PantryPal
insert into categories (name, emoji) values
  ('Spices', '🧂'),('Sauces', '🍶'),('Pasta', '🍝'),
  ('Rice & Grains', '🍚'),('Baking', '🌾'),('Snacks', '🍪'),
  ('Drinks', '🥤'),('Cold Items', '❄️'),('Tinned Food', '🥫'),
  ('Cleaning', '🧹'),('Other', '📦');
```

5. Go to **Settings → API** and copy:
   - **Project URL** — `https://xxxxxxxxxx.supabase.co`
   - **anon / public key** — starts with `eyJ...`

6. Also go to **Authentication → Providers → Email** and turn off **Confirm email**

---

### Step 2 — Add your Supabase keys to the HTML files

Open each HTML file in a text editor and find these two lines near the top of the `<script>` section:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your actual URL and key. Do this in all four app files:
- `index.html`
- `pantrypal.html`
- `babypal.html`
- `chorepal.html`

> The anon/public key is safe to include — it's designed to be public-facing. Never use the `service_role` key.

---

### Step 3 — Host on GitHub Pages

1. Go to [github.com](https://github.com) → **New repository**
2. Name it `familypal` (or anything you like), set to **Public**, tick **Add a README**
3. Click **Create repository**
4. Click **Add file → Upload files** and upload all 5 files:
   - `index.html`
   - `home.html`
   - `pantrypal.html`
   - `babypal.html`
   - `chorepal.html`
5. Click **Commit changes**
6. Go to **Settings → Pages → Source → Deploy from branch → main / root → Save**

After ~60 seconds your app is live at:
```
https://yourusername.github.io/repositoryname/
```

---

### Step 4 — Create your account

1. Open your GitHub Pages URL
2. Click **Create Account**, enter email and password (min 6 chars)
3. Click **Sign In**

---

### Step 5 — Add to home screen

**Android:** Chrome → three-dot menu → **Add to Home Screen**

**iPhone:** Safari → Share button → **Add to Home Screen**

One icon, one tap — opens straight to the login/home screen.

---

### Sharing with your household

Everyone uses the **same email and password**. Log in once per device — the session is remembered automatically until you sign out.

---

## 📱 How to use

### Navigation
After logging in you'll see the home screen with three app cards. Tap any app to open it. The 🏠 button in every app takes you back to the home screen.

---

### 🥫 PantryPal

**Header buttons:**
| Button | Function |
|--------|----------|
| 📋 | Quick Inventory — fast stocktake |
| ⭐ | Bulk Priority — toggle priority items |
| 🛒 | Shopping Mode |
| 📷 | Scan barcode to add item |
| 🏷️ | Manage Categories |
| 🏠 | Back to home |

**Adding items:**
- Tap 📷 to scan a barcode — product details auto-fill
- Or tap **+** to add manually
- Set name, brand, category, unit of measure, expiry date, quantities, min stock, priority, and rating

**Stock tracking:**
| Button | Action |
|--------|--------|
| +1 📦 | Bought more — adds to sealed stock |
| 🔓 Open | Opens one — moves sealed to open |
| ✅ Done | Finished one — removes from open |

**Status colours:**
| Colour | Meaning |
|--------|---------|
| 🟢 Green | Well stocked (2+ sealed) |
| 🟠 Orange | Low stock (1 sealed, nothing open) |
| 🟡 Yellow | Nothing sealed, something open |
| 🔴 Red | Completely empty |

**Item rating:**
- 😐 Not sure yet — default
- ❤️ Love it — shown as green badge
- 😬 Don't buy again — flagged with red warning on shopping list

**Category view:**
Tap **🏷️ By Category** in the filter bar to group all items under category headings.

**Shopping Mode:**
- Tickable list grouped by ⭐ Priority and 📋 Also Needed
- Tap **📷 Scan** to scan items in the store — adds +1 to pantry automatically
- Unrecognised barcodes can be named and saved for later
- **💬 WhatsApp** shares the list as a formatted message
- Offline support — scans queue locally and sync when signal returns

---

### 🍼 BabyPal

**Tabs:** 📊 Today · ➕ Log · 📋 History · 📈 Trends

**Quick logging:**
The big **➕ Log Something** button is always visible. Tap it to log anything:

| Button | Logs |
|--------|------|
| 🍼 Bottle Feed | ml amount + time |
| 🤱 Breast Feed | duration + side + time |
| 💧 Wet Diaper | one tap — instant |
| 💩 Soiled Diaper | one tap — instant |
| 😴 She fell asleep | starts live sleep timer |
| 🥛 Pump | ml amount + duration |
| 🍽️ Mama's Meal | full diary with notes |

**Sleep tracking:**
- Tap **😴 She fell asleep** — live timer starts and shows at the top
- Tap **☀️ She woke up!** to stop — sleep is logged automatically
- If sleep exceeds the warning threshold (default 6h) — a warning shows to adjust the time
- If you forgot to start the timer — enter start and end times manually
- Change the warning threshold in ⚙️ Settings

**Today tab** shows: total milk, diaper count, total sleep, total pumped, last feed time.

---

### 🧹 ChoresPal

**Tabs:** ✅ Today · 🏆 Goals · 📋 History · ⚙️ Setup

**Setting up chores:**
Go to ⚙️ Setup → add chores with name, emoji, frequency, assigned person and points.

Frequencies:
- 📅 **Daily** — appears every day, can be logged multiple times (shows ×2, ×3)
- 📆 **Weekly** — appears once per week, disappears when done
- 🗓️ **Monthly** — appears once per month
- 1️⃣ **Once only** — appears until done, then gone forever

**Logging chores:**
- Tap **✓ Done** on any chore → popup asks who did it
- Choose 👨 Tyron, 👩 Ansonette, or 👨👩 Together (points split equally)
- Daily chores show **✓ +1** after first completion — tap again to add more
- Tap ↩ to undo the last log

**Scoring:**
- Live Tyron vs Ansonette points banner at the top of Today
- Together chores give each person half the points (rounded up)
- 🏆 shown next to whoever is winning

**Goal tracking:**
1. Tap the **🏆 Goals** tab
2. Tap **📅 Set Weekly Goal** or **🗓️ Set Monthly Goal**
3. Type the prize (e.g. "Back massage", "Dinner choice")
4. Optional: set a points target
5. Goal goes live immediately

Active goals show as cards on the Today tab with a live progress bar.
When the period ends, a **🏆 Winner Banner** pops up showing who won and the prize.

---

## 🔄 Updating the app

1. Go to your GitHub repository
2. Click the file you want to update → pencil ✏️ icon
3. Select all, delete, paste new code
4. Click **Commit changes**
5. Hard refresh: **Ctrl+Shift+R** on desktop, or clear cache on mobile

> Your database is completely separate. Updates never affect your data.

---

## 🛠️ Tech stack

| Component | Service | Cost |
|-----------|---------|------|
| Hosting | GitHub Pages | Free forever |
| Database | Supabase (PostgreSQL) | Free up to 500MB |
| Barcode scanning | QuaggaJS (open source) | Free |
| Product lookup | Open Food Facts API | Free |

---

## 📄 Licence

MIT — free to use, modify, and share. PantryPal inspired by [Grocy](https://grocy.info).
