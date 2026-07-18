# PvP Testing Discord Bot

Registration → Queue → Ticket → Result → Tier Roles → Leaderboard, sab ek bot mein.

## Kya-kya banaya gaya hai

- **Register button** → modal popup (IGN, Region) → submit ke baad **Official / Cracked** buttons dikhte hain launcher choose karne ke liye (koi typing nahi, sirf click) → jab tak register nahi, koi bhi aur button/queue kaam nahi karega.
- Bot ke saare Discord-facing messages (embeds, replies, errors) ab **pure English** mein hain, taaki non-Hindi users bhi comfortably use kar sakein.
- **Queue button** → dropdown mein 11 game modes (Nethpot, Mace, Spearmace, Cart, Rocketmace, Axe, Tank, Diapot, Lifesteal, UHC, Crystal). Mode select karte hi:
  - Uss mode ka **"Queue: <Mode>"** role auto-assign hota hai
  - Queue channel mein "joined" message post hoti hai
  - Jab queue **threshold** (default 8, config mein badal sakte ho) tak pahunchti hai → **lock/alerts channel** mein automatic ping
- **`/queue check [game_mode]`** (Tester/Admin only) → current queue count dikhata hai
- **`/queue open-ticket [player] [game_mode]`** (Tester/Admin only) → private ticket channel banata hai (sirf tester + player dekh sakte hain)
- **`/result [player] [points] [rank] [region]`** (Tester/Admin only):
  - Rank dropdown se 10 tiers milte hain: HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5 — **har mode ke apne alag tier roles** (e.g. "Nethpot HT1" vs "Mace HT1")
  - Player ko automatic mode-specific tier role mil jata hai (purana tier role hat jata hai)
  - Player queue se automatically remove ho jata hai
  - Agar ticket ke andar run kiya, ticket auto-close mark ho jata hai
- **`/profile [@user]`** (sabke liye) → IGN, Region, Launcher, aur har mode mein rank/tier dikhata hai
- **`/leaderboard`** (Tester/Admin only) → weekly top-10 points
- **Live queue-list embed** — har mode ke queue channel mein ek auto-updating message rehta hai jo dikhata hai:
  - ⏳ **Waiting**: sab players jo queue mein wait kar rahe hain (Server Boosters ⭐ ke saath top pe automatically)
  - 🎫 **Currently Testing**: jiska test chal raha hai, uska naam + kaunsa tester test le raha hai
  - Ye message har join/leave/ticket-open/result pe khud update ho jata hai
- **Booster priority** — agar player Discord Server Booster hai (ya `Server Booster` role rakhta hai), queue join karte hi wo list ke **top** pe chala jata hai
- **Result template** — `/result` submit karne par ek formatted result message (numbered, e.g. "1. [1.21+] Vortex Tiers") post hota hai `results-log` channel mein, jisme Tester, Region, Account Type, IGN, Previous Rank, Tier Earned, Points Earned, Gamemode, aur Test Result (Pass/Fail) sab dikhta hai

## Permissions summary

| Command / Action | Kaun use kar sakta hai |
|---|---|
| Register button | Sab |
| Queue button | Sirf registered users |
| `/profile` | Sab |
| `/queue check`, `/queue open-ticket` | Tester / Admin role |
| `/result` | Tester / Admin role |
| `/leaderboard` | Tester / Admin role |
| `/setup` | Server Administrator |

---

## Setup Steps (paid hosting ke liye)

### 1. Discord Application banao
1. https://discord.com/developers/applications pe jao → **New Application**
2. Left menu mein **Bot** → **Reset Token** → token copy karo (ye `DISCORD_TOKEN` hai)
3. Bot section mein neeche **Privileged Gateway Intents** mein **SERVER MEMBERS INTENT** ON karo
4. **General Information** tab se **Application ID** copy karo (ye `CLIENT_ID` hai)
5. **OAuth2 → URL Generator** mein scopes: `bot`, `applications.commands` select karo. Permissions mein: `Manage Roles`, `Manage Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `View Channels` select karo → generated link se bot ko apne server mein invite karo

⚠️ **Important**: Bot ka role, server settings mein **sabse upar** rakhna (ya kam se kam uss role se upar jo roles bot ko manage karne hain), warna "Manage Roles" fail hoga.

### 2. Files upload karo hosting panel pe
Poora `discord-bot` folder apne paid hosting (Pterodactyl/Nodefly/Bisecthosting jaisa Node.js-supporting panel) pe upload karo.

### 3. `.env` file banao
`.env.example` ko `.env` naam se rename karo aur values fill karo:
```
DISCORD_TOKEN=tumhara_bot_token
CLIENT_ID=tumhara_application_id
GUILD_ID=tumhare_server_ki_id   (optional, testing ke liye)
```

### 4. Install & Deploy
Hosting panel ke console/terminal mein:
```bash
npm install
npm run deploy    # slash commands register karega Discord pe
npm start          # bot start karega
```
(Zyada tar paid hosts mein "Startup Command" field hoti hai — wahan `npm start` daal dena taaki bot restart pe khud chal jaye.)

### 5. Server mein `/setup` chalao
Discord mein jaake, jis server mein bot hai, wahan **Administrator** koi bhi `/setup` command chalaye. Ye automatically:
- Saare 11 queue channels + roles bana dega
- 110 tier roles bana dega (11 modes × 10 tiers)
- Ticket category, lock/alerts channel, registration panel sab bana dega
- Registration panel mein Register + Queue buttons post kar dega

### 6. Tester/Admin roles assign karo
`/setup` ke baad server mein **"Tester"** aur **"Admin"** naam ke roles ban jayenge. Apne trusted logon ko manually ye roles de do (Discord ke role-assign se) — tabhi wo `/queue`, `/result`, `/leaderboard` use kar payenge.

---

## Config badalna ho toh

`src/config.js` file mein:
- `GAME_MODES` — modes ki list add/remove karo
- `TIERS` — tier names badlo
- `DEFAULT_QUEUE_THRESHOLD` — queue-full number badlo (per-mode override DB mein `guild_config.thresholds_json` mein bhi ho sakta hai)

Config badalne ke baad, agar naye modes add kiye hain, dobara `/setup` chalao — purane roles/channels wapas nahi banenge (already-exist check hai), sirf naye add honge.

## Notes
- Database **SQLite** hai (`bot.sqlite` file, auto-create hoti hai) — koi separate DB server setup nahi chahiye.
- Agar bot restart ho, data safe rehta hai (file mein saved hai).
- Multiple servers mein bot kaam karega — har server ka data alag (`guild_id` se separate hai).
