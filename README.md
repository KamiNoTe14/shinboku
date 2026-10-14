# Shinboku

![Shinboku: a Pokémon companion app](public/og-image.jpg)

A desktop-first Pokémon GO companion for managing large collections. Fast keyboard entry,
multi-select bag management, and recommendations for what to transfer, power up, evolve, and bring
to raids.

**Live site:** [shinboku.app](https://shinboku.app)

> Shinboku is a fan project and is not affiliated with Niantic, Nintendo, The Pokémon Company, or
> Game Freak. It never connects to your game account.

## Status

Early development. What's in place:

- React + Vite + TypeScript app with a desktop sidebar layout
- Sign-in with Google or email/password (Firebase Authentication)
- Firestore with an offline cache, and security rules that keep each trainer's bag private
- Pokémon GO game data for every species and move, refreshed weekly from PvPoke
- CP, HP, level and IV math, with tests against published values
- A searchable Pokédex with GO stats, max CPs, evolution families and moves

Next up: the keyboard-first entry screen and the bag table.

## Tech stack

| Piece        | Choice                                   |
| ------------ | ---------------------------------------- |
| Frontend     | React 19, React Router, Tailwind CSS 4   |
| Build        | Vite, TypeScript                         |
| Accounts     | Firebase Authentication                  |
| Data         | Cloud Firestore                          |
| Hosting      | GitHub Pages, deployed on every push     |

Everything runs on Firebase's free Spark plan. Cloud Storage is deliberately not used, because it
now requires the paid Blaze plan.

## Deployment

Every push to `main` builds the site and publishes it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Progress shows under the repo's
**Actions** tab.

## Running it locally (optional)

You'll need [Node.js 24 or newer](https://nodejs.org/) (the current LTS) and Git.

```bash
git clone https://github.com/KamiNoTe14/shinboku.git
cd shinboku
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173). Signing in works on `localhost`
out of the box.

| Command               | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the dev server with live reload                |
| `npm run build`       | Type-check and build the site into `dist/`           |
| `npm run preview`     | Serve the built site locally                         |
| `npm test`            | Run the unit tests (CP and IV math)                  |
| `npm run test:rules`  | Test the Firestore security rules (needs Java)       |
| `node scripts/build-gamedata.mjs` | Refresh the game data from PvPoke        |
| `npm run deploy:rules`| Publish `firestore.rules` to the live project        |

## Security model

Security is enforced by [`firestore.rules`](firestore.rules), which run on Google's servers. The
website's code is public, and that's fine: editing it can't get around the rules.

- `users/{uid}` and `users/{uid}/pokemon/*`: readable and writable only by that user
- `admins/{uid}`: marks an admin; can only be created by hand in the Firebase console
- Everything else: denied

Game data (Pokédex, moves, type chart) ships with the site as static files, not in Firestore.

## Game data

Species, base stats, moves and evolution families come from [PvPoke](https://github.com/pvpoke/pvpoke)
(MIT License). [`scripts/build-gamedata.mjs`](scripts/build-gamedata.mjs) converts it into
`public/data/gamedata.json`, and the **Refresh game data** workflow reruns it every Monday,
committing and redeploying only when something changed. Run it by hand from the Actions tab after a
big game update. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Testing the rules

The tests run against the local Firestore emulator, which needs Java 21+ installed.

```bash
npm install --prefix tests/rules   # one time
npm run test:rules
```

### Publishing the rules

The Firebase project starts in production mode (everything locked). To publish Shinboku's rules:

```bash
npx firebase login
npm run deploy:rules
```

## Project layout

```
src/
  auth/         sign-in state and route protection
  components/   layout, logo, shared UI
  lib/          Firebase setup
  lib/go/       Pokémon GO data loading and stat math
  pages/        one file per page
public/data/            generated game data
scripts/                game data build script
firestore.rules         database security rules
tests/rules/            security rules tests
firebase.json           Firestore rules and emulator config
.github/workflows/      GitHub Pages deployment
```
