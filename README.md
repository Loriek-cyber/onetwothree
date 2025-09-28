# Semi-online Slap Card Game

Small Node.js + Socket.IO demo implementing a simple multi-player card game (max 4 players). This is a minimal prototype to run locally.

Features:
- Server hosts a single room, up to 4 players.
- French deck (52 cards), no jokers.
- Deck is shuffled and dealt evenly (floor division). Each card is unique.
- Players play cards to the center pile.
- If top two cards match, players can "slap" to take the pile.
- A,2,3 special rules: playing one forces the next player to play N cards unless countered by another A/2/3; initiator wins if not countered.
- Spam penalty: rapidly spamming the slap button results in dropping a card as penalty.

How to run

1. Install dependencies

   npm install

2. Start server

   npm start

3. Open multiple browser windows at http://localhost:3000 and join with different names.

Controls
- Click "Butta" or press Space to play a card when it's your turn.
- Click "Prendi" or press F to attempt to slap the pile.

Notes & Limitations
- This is a prototype. There is no persistence; the server resets when restarted.
- No reconnection handling; reconnecting will create a new player slot.
- UI shows only counts and top card, not full hands (cards are hidden as requested).
- The special rule logic is implemented server-side but is simple; you may want to refine edge cases.

Next steps (optional)
- Show who pressed slap first using timestamps.
- Add animations and nicer card graphics.
- Add authentication or private rooms.

Card images / assets
 - Place card images in `public/cards`.
 - Filename convention used by the client: `<rank>_<suit>.png` (for example: `A_♠.png` would be sanitized; it's safer to name files like `A_spades.png`, `10_hearts.png`, `K_clubs.png`).
 - The client will try to load `/cards/<rank>_<suit>.png`. If an image isn't found it falls back to `public/cards/placeholder.svg`.

Deploying & publishing (GitHub + Render/GitHub Pages)

1) Initialize a git repo and push to GitHub

    Open a terminal in the project root and run (replace placeholders):

    ```powershell
    git init
    git add .
    git commit -m "Initial commit - slap game"
    git branch -M main
    git remote add origin https://github.com/<your-username>/<repo-name>.git
    git push -u origin main
    ```

2) Deploy options

- Option A — Render (recommended for Node apps)
   - Create a free account on https://render.com
   - Create a new Web Service, connect your GitHub repo and choose the `main` branch.
   - Set the start command to `npm start` and the environment to `Node 18+` (auto-detected usually).
   - Render will auto-deploy on each push.

- Option B — Railway / Heroku (similar flow)
   - Connect your GitHub repo and set the start command to `npm start`.

- Option C — GitHub Pages (static only)
   - This project is a Node server; GitHub Pages only serves static files. To use Pages you must build a static version (e.g., remove server and serve `public/`), or use GitHub Actions to publish `public/` to Pages. For dynamic multi-player features you should use Render/Railway/Heroku instead.

3) Environment & notes
   - The app listens on the port defined by `process.env.PORT` or `3000`. Render/Railway set `PORT` automatically.
   - Ensure the repo contains `package.json` and `server.js` (already present).

If you want, posso:
- configurare un repository Git locale, committare e se mi dai il repo (o permesso) posso pushare per te;
- oppure guidarti passo-passo mentre fai il push e il deploy.

Troubleshooting Render "Cannot find module '/opt/render/project/src/start'"
-----------------------------------------------------------------
If you see an error like:

   Error: Cannot find module '/opt/render/project/src/start'

This usually means the platform attempted to run `node start` (looked for a file named `start` or an entrypoint called `start`) but your repository's start command is set to `node server.js` in `package.json`. Two simple fixes:

1) Preferred: In the Render dashboard set the Start Command to `npm start`. This will run the script defined in `package.json` (recommended).

2) Alternate: Add a tiny shim file named `start` that requires your real server entrypoint. This repo includes such a shim (`start`) so `node start` will work. The shim simply does:

```js
require('./server.js');
```

Either option will prevent the `MODULE_NOT_FOUND` for `/opt/render/project/src/start`.

If you're still stuck, paste the full Render deploy logs here and I'll help fix the config.
