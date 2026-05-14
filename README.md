# VibePet

A lightweight desktop pet that lives on your screen. Built with Tauri v2 + Vite + Vanilla TypeScript. No frameworks, no Canvas/WebGL -- pure DOM, CSS sprite animation, and a bit of soul.

## Features

### Sprite Animation Engine

A custom `PetEngine` drives all animation through CSS `background-position` stepping over a sprite sheet. Each state maps to a row in the atlas with per-frame duration control:

```
idle            -> row 0, 6 frames
running-right   -> row 1, 8 frames
waving          -> row 3, 4 frames
jumping         -> row 4, 5 frames
review (think)  -> row 8, 6 frames
...
```

Default atlas: 8 columns x 9 rows, 192x208 per cell. The engine dynamically injects `@keyframes` for each state and applies them via `background-position` + `steps()`.

### Drag and Drop

Click and drag the pet across your desktop. The system uses a threshold-based state machine:

- **Mousedown** -- "latent" phase, pet squishes slightly (scaleY stretch)
- **Mousemove past 5px threshold** -- enters drag mode, switches to running animation, hands drag control to the OS via `appWindow.startDragging()`
- **Mouseup** -- drops with a squash animation, or spawns particles if it was just a click

A fallback mechanism detects when the OS swallows the mouseup event (`buttons === 0` while `isMouseDown`) and resets state gracefully.

### Bio-Clock

The pet monitors your activity via global cursor polling (Tauri `cursorPosition` API). When you go idle:

| Idle Duration | Behavior |
|---|---|
| 5 minutes | Switches to "review" (thinking) for 3 seconds |
| 10 minutes | Falls asleep ("waiting" state) |
| Mouse returns | Wakes up with a jump |

On boot, the pet greets you with a waving animation for 5 seconds before settling into idle.

### Speech Bubble System

A context-aware speech bubble appears above the pet's head, displaying messages based on the current date, time, and lunar calendar:

**Solar terms:**
- Winter Solstice (dong zhi) -- reminder to eat dumplings or tangyuan
- Start of Spring (li chun) -- new beginnings message

**Holidays:**
- December 13 -- National Memorial Day
- Mother's Day (2nd Sunday in May) -- call your mom
- Spring Festival (lunar Jan 1) -- new year greeting
- Mid-Autumn Festival (lunar Aug 15) -- mooncake reminder

**Time-based:**
- 23:00 -- late night health reminder (triggers "review" state + 8s bubble)

**Default:** Random warm greetings from a curated pool.

The bubble uses `width: max-content` for auto-sizing, with a CSS triangle tail and smooth fade-in/out transitions. A mutual-exclusion lock prevents multiple bubbles from overlapping.

### Dynamic Personality Engine

Six built-in personality presets, each with a unique voice and speaking style:

| Preset | Style |
|---|---|
| Tsundere Cat | Aloof exterior, secretly caring |
| Genki Girl | Bubbly, energetic, uses exclamation marks |
| Toxic Friend | Sarcastic roasts that somehow feel supportive |
| Gentle Senior | Warm, nurturing, uses soft language |
| Chuunibyou | Delusional dramatic monologues |
| Zen Shiba | Stoic, philosophical, minimal words |

Plus a **Custom Persona** panel where you can write your own personality prompt -- set its tone, identity, catchphrases, or habits.

### Hybrid Chat Mode

Two dialogue engines, intelligently routed:

- **Basic Mode** -- Fetches random quotes from the Hitokoto API for lightweight, no-config-needed chatter
- **Awaken Mode** -- Connects to any OpenAI-compatible LLM API for dynamic, personality-driven conversation

In Awaken Mode, the first click triggers a full LLM response (with assembled system prompt including persona + time context). Subsequent clicks fall back to Hitokoto quotes, with a 10-minute cooldown before the LLM can be triggered again. This keeps API costs low while preserving the "magic moment" of first contact.

### API Configuration

A frosted-glass settings panel for connecting to any OpenAI-compatible API endpoint:

- **Endpoint** -- Auto-corrects URL: adds `/v1` if missing, appends `/chat/completions` if needed
- **API Key** -- Stored in localStorage, masked input
- **Model** -- Configurable model name (defaults to `gpt-3.5-turbo`)

The "Save" button performs a real connectivity test -- sends a minimal POST request (`max_tokens: 1`) to verify the endpoint, key, and model all work together. Visual feedback: green for success, red for "config error".

### GitHub Commit Monitoring

Link your GitHub account to get notified about your commit activity:

- Polls the GitHub Events API every few minutes
- Detects new `PushEvent` entries since the last check
- Shows a congratulatory speech bubble when new commits are found
- Includes a "Test" button to verify the username exists before saving

### Smart Todo / Reminder System

A neon-themed todo panel with two item types:

- **Notes** -- Permanent memos stored in localStorage, with copy-to-clipboard and done buttons
- **Reminders** -- Countdown timers with configurable delay, trigger a looping alarm sound and visual pulse when time is up

Natural language time parsing: input like "30 minutes remind me to stand up" is automatically recognized. Falls back to LLM parsing for ambiguous text when API is configured.

### Sound System

Five sound effects powered by HTML5 Audio API:

| Sound | Trigger |
|---|---|
| Pop | Pet click / particle spawn |
| Boing | Wake up jump / drop impact |
| Bubble | UI interactions |
| Bell | Focus timer end |
| Crunch | File drop / reminder alarm |

All audio assets are bundled via Vite's `new URL()` import mechanism for correct path resolution in both dev and production builds.

### Volume Control

A capsule-shaped, Windows 11 Fluent Design volume panel:

- Frosted glass background with blur effect
- Dynamic progress bar with blue fill
- Slides up from below the pet on menu trigger
- Auto-hides on mouse leave
- Volume persists across sessions via localStorage

### SVG Fringe Removal

A custom SVG filter chain eliminates white fringing artifacts from sprite sheet edges:

```
feMorphology (erode 1.5px) -> feGaussianBlur (0.5) -> feColorMatrix (alpha harden)
```

This shrinks the visible alpha boundary, blurs the edge, then clamps the alpha channel to produce clean, artifact-free sprite edges on any background.

### Focus Mode

A Pomodoro-style timer with preset durations (5, 15, 30, 45, 60 minutes):

- Countdown displayed in the speech bubble, refreshed directly to prevent flicker
- Mutual-exclusion lock prevents focus bubble from being overwritten
- Boing sound suppressed during focus to avoid distraction
- Accessible via the right-click context menu

### Eye Tracking

The sprite flips horizontally based on cursor position relative to the window center, giving the illusion the pet is watching you. Applied to `#pet-sprite` (not the container) to avoid conflicts with the physics squash/stretch transforms.

### Particle Effects

Clicking the pet spawns 2-3 random SVG particles (heart, smile, star, dog face, wink, heart-eyes) that float upward and fade out. All particles are inline SVG data URIs -- no external images, no emoji.

### Physics Feedback

Visual feedback for interaction states:

- **Lifting** -- `scaleY(1.05) scaleX(0.95)` stretch
- **Dropping** -- `scaleY(0.9) scaleX(1.1)` squash

Smooth transitions via `cubic-bezier(0.25, 0.8, 0.25, 1)`.

### File Drop to Recycle Bin

Drag and drop files onto the pet to move them to the recycle bin. The pet plays a "crunch" animation and sound on each drop.

### Context Menu

Right-click the pet for a native Tauri menu:

- Animation demo submenu -- preview any state
- Custom todo -- opens the todo/reminder panel
- Focus timer submenu -- preset durations
- Volume control
- Chat mode submenu:
  - Basic chat (Hitokoto) -- toggle
  - Awaken mode submenu -- 6 personality presets + custom persona
  - Connect API...
  - Link GitHub...
- Settings submenu:
  - Auto-start on boot
  - Toggle always-on-top (persisted to localStorage)
  - Import pet (.zip)
- Quit (plays "failed" animation before exit)

### Auto-Start

Enable auto-start via the context menu settings. Uses the Tauri autostart plugin to register the application for launch on system boot.

### Pet Import

Import custom pets as `.zip` files through the dialog. The Rust backend (`pet_import.rs`) extracts the zip, reads `pet.json` for metadata, and stores the pet in the app data directory.

### Always-on-Top

Toggle window z-order via the context menu. State persists to localStorage so the pet remembers your preference across sessions.

### Exit Farewell

When quitting, the pet plays a "failed" animation for 3 seconds while locking all interactions, then exits gracefully.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Tauri v2 (Rust backend, WebView2 frontend) |
| Frontend | Vite + TypeScript, zero frameworks |
| Rendering | Pure DOM + CSS `steps()` sprite animation |
| Calendar | lunar-javascript (solar terms, lunar dates) |
| Audio | HTML5 Audio API |
| API | OpenAI-compatible chat completions format |
| Build | Cargo (Rust) + Vite (frontend) |
| Installer | NSIS (non-oneclick, customizable install directory) |

## Project Structure

```
src/
  pet/                  # Pet window (transparent, borderless, always-on-top)
    index.html          # Entry HTML + all panel markup
    pet.ts              # PetEngine, drag, bio-clock, speech, menu, API, GitHub, todo
    pet.css             # All pet window styles (fluent glass panels)
    spritesheet.webp    # Default sprite sheet (fallback)
  assets/
    audio/              # Sound effects (pop, boing, bubble, bell, crunch)
  config/               # Configuration panel window (hidden by default)
    index.html
    config.ts
    style.css
  lunar-javascript.d.ts # Type declarations for the calendar library

src-tauri/
  src/
    main.rs             # Tauri entry point
    lib.rs              # Plugin registration, command handler, autostart
    pet_import.rs       # Zip import, pet manifest, file management
  tauri.conf.json       # Window config, permissions, bundle settings
  capabilities/
    default.json        # Tauri capability permissions
  icons/                # App icons (auto-generated via tauri icon)
```

## Commands

```bash
npm run dev            # Vite dev server only (frontend)
npm run tauri dev      # Full Tauri + Vite dev (desktop app)
npm run build          # TypeScript check + Vite production build
npm run tauri build    # Full Tauri release build (generates installer)
npx vite build         # Frontend-only build (skips tsc)
cargo check            # Check Rust compilation (from src-tauri/)
npx tauri icon <png>   # Generate app icons from a square PNG
```

## Build Output

After running `npm run tauri build`:

- **NSIS installer**: `src-tauri/target/release/bundle/nsis/`
- **Executable**: `src-tauri/target/release/vibe-pet.exe`

## Pet Package Format

A pet package is a `.zip` file containing:

```
pet.json              # Manifest
spritesheet.webp      # Sprite sheet image
```

**pet.json schema:**

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A custom pet",
  "spritesheetPath": "spritesheet.webp",
  "version": "1.0.0"
}
```

The engine uses a default fallback: each row in the sprite sheet = one state, frames per row assumed equal. No state/frame mapping is required in the manifest.

## Architecture Notes

- **No frameworks.** All rendering is pure DOM + CSS. No React, Vue, Pixi, Three, or Canvas.
- **No Canvas/WebGL.** Sprite animation uses only `background-position` + `steps()`.
- **Transparent window.** The pet window has `transparent: true`, `decorations: false`, `shadow: false` in Tauri config. The HTML body is `pointer-events: none` so only the pet sprite intercepts clicks.
- **Hitbox separation.** Visual layer (`#pet-sprite`) and interaction layer (`#pet-hitbox`) are decoupled, following game development patterns for precise click targeting.
- **Dual-window.** The pet window (`pet` label) is the always-visible desktop companion. The config window (`config` label) is hidden by default and can be shown programmatically.
- **Particle lifecycle.** Particles are DOM elements appended to `document.body`, removed via `.remove()` on `animationend`.
- **localStorage persistence.** All user preferences (API config, chat mode, persona, volume, GitHub username, always-on-top, todos) survive across sessions.

## License

MIT
