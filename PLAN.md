# Chiikawa: Mermaid Island Life — Project Plan

A small, comfy, mobile-first life simulator set on the island from
*Chiikawa: The Secret of the Mermaid Island* (映画ちいかわ 人魚の島のひみつ, 2026).
You play an ordinary islander. You wander, wade, chat, and watch the
Chiikawa cast live their day.

Personal, non-commercial fan project. Built entirely by Claude in code,
tested and played by you. Nothing in this document is final; it is the
agreed starting point and will be edited as we go.

---

## 1. Vision

**One sentence.** A pocket-sized island you can open on your phone for five
minutes, drift around, bump into Chiikawa and friends, and leave feeling calm.

**Pillars.** Every design decision is checked against these three.

1. **Comfy first.** No fail states, no timers, no combat, no pressure.
   Nothing hurts you. The one deliberate exception is mood: the deep sea and
   the forbidden cave are dark and eerie, as in the film, so the bright
   island feels warmer by contrast. Eerie never means dangerous.
2. **The island is alive without you.** Characters have their own routines.
   You observe more than you direct. Finding Hachiware fishing at dawn should
   feel like luck, not a quest trigger.
3. **One thumb.** Everything works in portrait on a phone with one hand.
   Desktop is a bonus, never the target.

**Not goals.** Story campaign, progression systems, crafting, inventory beyond
a few keepsakes, multiplayer, monetisation, app-store release.

---

## 2. Source material and what we borrow

### What the movie is

The film adapts the manga's "Siren arc" (セイレーン編 / 島編, collected in
volume 8). Chiikawa and Hachiware receive a flyer from Usagi advertising a
special island with a festival, free food and a large monster-hunting bounty.
Rakko-sensei (the Otter) is suspicious but comes along. On the island they
meet two islanders, **Hitoha** and **Futaba**, who guide them around.

The actual plot is dark. The islanders' welcome hides a crisis involving a
Siren and a small mermaid, and reviews describe the film as a tragedy wrapped
in a cute package. The islanders' song ("島のうた") is read by fans as a
disguised plea for help.

### What the game takes

We keep the **setting** and drop the **plot**.

| Keep | Drop |
|---|---|
| The island itself: karst pillars, jungle, village, pier, beaches, lagoon, reef | The Siren as a threat |
| Festival atmosphere: stalls, bunting, confetti, the night feast, the islanders' song | Any violence, injury, or revenge |
| The visiting trio plus Rakko-sensei as guests on the island | The mermaid-flesh / eternal life storyline |
| Hitoha and Futaba as friendly, inseparable islanders | Hitoha and Futaba's fate |
| Islanders as a chorus-like community with matching outfits | The flyer as a lure |
| The food shop and its owner as a stall | Food as a weapon |
| The small mermaids as shy, rare sightings in the deep | Anything sad happening to them |
| The forbidden cave and the moonlit water under its skylight, reached by rowboat | What happens in the cave |
| The night feast on the beach, bonfire, Rakko's ukulele | The feast's real purpose |

**The Siren (decided).** Her silhouette with red eyes peeks out of the sea
at night, far from shore, then sinks away. She never comes close and never
interacts. Official promo art shows exactly this: her head peeking over the
waves behind a bonfire party.

### Visual reference

`STYLE_GUIDE.md` holds everything learned from the 61 reference images:
character sheets with colours and proportions, the island layout, village,
jungle, night beach, cave, and palette. It is the visual contract for all
modelling. Remaining gaps are listed at the end of that file.

I will not invent movie facts and present them as canon. Where the film is
silent, the game will clearly be our own interpretation.

---

## 3. Platform and technology

### Decision summary

| Layer | Choice | Why |
|---|---|---|
| Delivery | Web app, installable as PWA | No store, no Mac, no fees; instant updates; works on iPhone and Android |
| Renderer | **Three.js** (latest stable, pinned) | Pure code, huge example base, strong mobile WebGL support |
| Language | **TypeScript** | Catches my mistakes before you see them; Vite compiles it for free |
| Bundler / dev server | **Vite** | Fast reload, `--host` lets your phone load the dev build over Wi-Fi |
| Models | **Blender 5.2**, driven by Python build scripts, exported as glTF (.glb) | Real modelling tools (voxel remesh, smoothing, decimation) with every measurement kept in a script, so models are reproducible and easy to tweak |
| Model edits | Change the numbers in the build scripts in `art/blender/`, then rebuild | The .blend files are regenerated on every build, so edits made by hand in Blender would be lost |
| Cast models | Downloaded rigged models of Chiikawa, Hachiware, Usagi and Momonga, converted by `art/blender/import_characters.py` | Far closer to the film than procedural shapes. The converter poses and scales them, splits them into the game's parts and bakes their face art |
| Physics | None. Hand-written capsule vs heightmap + simple triggers | A comfy walking game does not need a physics engine |
| Audio | Web Audio via Three.js `Audio` / `PositionalAudio` | Ambient loops, footsteps, splashes, UI blips |
| State / save | JSON in `localStorage`, versioned | Simple, offline, no server |
| Hosting | GitHub Pages via GitHub Actions (or Cloudflare Pages if the repo is private) | Free, automatic on push |
| Version control | Git, GitHub | Required for Pages; also how we roll back mistakes |

### Why not the alternatives

- **Godot / Unity.** I cannot operate their editors. I would be editing scene
  files blind and asking you to press play. Their mobile web exports are also
  weaker than a native Three.js build, especially on iOS Safari.
- **Unreal.** Wrong fidelity target, huge builds, battery drain.
- **Babylon.js.** Perfectly good, but Three.js has more examples for me to
  lean on and a lighter core.
- **Native apps.** iOS requires a Mac and a paid developer account. Android
  APK sideloading is possible later if ever needed, by wrapping the web build.

### Browser and device targets

- **Primary:** iOS Safari 17+, Android Chrome 120+, portrait, 390×844 logical
  pixels as the design baseline.
- **Secondary:** desktop Chrome/Edge/Firefox with mouse and keyboard.
- **Performance budget (mid-range phone, e.g. 3-year-old Android or iPhone 12):**
  - 60 fps target, 30 fps floor.
  - ≤ 150 draw calls per frame.
  - ≤ 150k triangles visible.
  - ≤ 64 MB GPU texture memory.
  - First load ≤ 5 MB compressed, then cached by the service worker.
  - Device pixel ratio capped at 2 (1.5 on weak devices via a settings toggle).

---

## 4. Art direction

### Look

Low-poly, toon-shaded, flat colours with outlines. The film's look lifted
into 3D: flat, almost unshaded characters against lush, painterly
backgrounds. Bright turquoise-and-green days, deep navy moonlit nights.
Exact colours live in `STYLE_GUIDE.md`.

- **Shading.** Characters use `MeshToonMaterial` with a near-flat 2-step
  ramp, so they read like the anime's flat fills. The environment gets a
  3-step ramp and fuller lighting. One directional sun or moon plus a
  hemisphere light. No shadow maps on mobile; a blob shadow under each
  character instead.
- **Outlines.** One pen for the whole world (`src/world/Ink.ts`), in **warm
  dark brown**, not black, matching the anime: 1.8 cm in the world, never
  under half the pen where the camera is looking. Characters, outfits and
  props get inverted hulls pushed out in screen space; clouds, the horizon
  and the waterline are drawn in their shaders. This replaces the earlier
  plan of no environment outlines, or a
  subtle screen-space edge pass only on desktop.
- **Faces.** Drawn in code and painted onto the curved front of the head,
  so they squash with the body and read correctly from the side. This is how
  the 2D charm survives in 3D. Details in "Bodies, poses and expressions"
  below.
- **Water.** Single large plane. Vertex-displaced gentle waves, scrolling
  normal map, depth-based colour from vivid turquoise near shore to deep
  blue, sparkle highlights, foam ring at the shoreline from a
  distance-to-shore texture. At night, a long moon-reflection streak.
- **Sky.** Gradient skydome, puffy cartoon cloud sprites, sun disc by day.
  At night a starfield and a large full moon. Day-night cycle tints the
  whole palette.
- **Signature scenery.** Tall pale limestone karst pillars with green tufts,
  mushroom-thatched stilt huts, festival bunting and stalls, cartoon bonfire
  flames with a warm light pool.

### Characters (Blender build sheet)

Every character comes out of Blender through a Python script, which paints
colours and part weights into the mesh and renders turnaround previews for
review. There are two sources:

- **The cast** (Chiikawa, Hachiware, Usagi, Momonga) comes from downloaded
  rigged models. `import_characters.py` opens them with their scripts turned
  off, poses the arms out to the sides, scales them to the game, shortens
  the body below the head to the film's squat proportions, splits them into
  the game's parts (body, arms, feet, ears, tail), turns every inside-out
  piece the right way, and bakes each face's own artwork and painted masks
  to textures.
- **The islanders** are shaped like Chiikawa, so
  `import_characters.py` converts Chiikawa's model for them too: without the
  ears and tail, grey all over, with leaves on top and a fringed grass skirt
  of their own, and at the model's own height (not shortened), as tall as
  the official plush. The generic islanders in the crowd are built the same
  way from Chiikawa's, Hachiware's and Usagi's models, so they have round,
  cat or bunny ears instead of leaves, and wear a grey flower crown as their
  island outfit. Everyone in the background crowd is a light copy, about a
  quarter of the triangles, since the crowd is only seen from a distance.
  Hitoha and Futaba are unique: one of each, and no other islander has
  their leaves.
- **Everyone else** will be modelled by `build_characters.py` from a parts
  kit: one soft blob, wider at the head, about one head tall overall; ears,
  leaves, claws, manes and fins from small capsules, cones or flat planes;
  stub arms with pivots; two small nubs for feet. The script fuses the parts
  into one soft, plush-like surface. None of them is in the game yet.

**The island outfit, shared by almost everyone,** is never part of a
character model. `outfits.py` fits a copy to each wearer's head and body and
exports it as its own asset, `public/models/outfits/island_<id>.glb`, which
the game puts on at runtime and can take off again:

- A flower crown: a garland of Y-shaped clovers, one colour pair per
  character. The film draws every flower face-on, so the game turns each one
  to the camera and arches the garland over the head from every side.
- A short light-green grass skirt with fringe strokes, tied just below
  the hands and flaring out to the ground.

Optional accessories: torch, ukulele, sword and cape, drinks, parfait, pink
pouch, fishing rod.

### Bodies, poses and expressions

Characters are never fixed shapes or frozen poses. Three layers make them
move like the film's soft, bouncy blobs, and a separate face system gives
them expressions. All of it is generated in code, with no keyframe files,
so every character stays cheap and I can tune the feel directly.

1. **Soft body.** The body blob deforms on the GPU: squash and stretch that
   keeps volume, so a squashed character gets wider as it gets shorter; a
   lean that bends the top while the base stays planted; and a damped-spring
   jiggle after jumps, landings and bumps, like mochi settling. The outline
   mesh uses the same deformation so it never comes apart from the body.
2. **Parts with follow-through.** Arms, feet, ears, tails, crown flowers and
   skirt fringe hang off pivots driven by small springs, so they lag and
   overshoot naturally. Long parts get a short chain of bones generated in
   code, so they bend along their length instead of swinging as stiff
   sticks: Usagi's ears flop when she jumps, Momonga's tail sways, and the
   mermaid and Siren tails swim with a travelling wave.
3. **Actions.** Each action is a small function of time that drives the two
   layers above, and actions crossfade smoothly into each other. Starting
   set: idle with breathing and looking around, waddle walk, run, jump, land,
   sit, sleep, wave, eat, drink, cry and tremble, startled, happy hop, hula
   dance, wade, row, play ukulele, hold torch, toast, fish, read.
   Props attach to the hand pivots. A new action is a few dozen lines, so
   any moment from the film can be added on request. Every action has its
   own expression. Sitting is on the bottom with the legs stretched out in
   front, as the cast sit in the film.

**Faces.** Each character's face is drawn onto its own canvas texture,
mapped onto the front of the head with UVs that the Blender script writes
into the mesh. The cast's faces are painted by hand: full-size layers in
`art/faces/<id>/` (eyes, brows, mouths, tears, sweat...), and an
`expressions.txt` there that says which layers make up each expression, so
each character has its own combinations. Characters without a painted face
have simple faces drawn in code; the islanders' are only cheek marks. The face is part of the body surface, so
it squashes, leans and jiggles with it. The canvas is redrawn only when the
expression changes, so the cost is tiny.

- **Eight expressions:** neutral, smile, happy, determined, worried,
  teary, sobbing and shocked, each a combination of painted layers chosen
  per character. Usagi, always calm, has few distinct faces; Momonga has
  extra eyes. Blinking and bowing swap in the closed eyes, sleeping uses a
  face's sleeping eyes if it has them (Usagi's), and talking and eating move
  between two mouths. No nose blush, wavy "S" mouth
  or big shocked eyes: they were tried and dropped.
- **Extras around the head** as small sprites: "!" and "?", Zzz, music
  notes, hearts. Tears and sweat are painted on the faces.
- **Automatic life.** Random blinks. Eyes and head turn toward the player or
  whoever they are talking to. The mouth moves while their dialogue text
  types out. Each dialogue line can set its own expression.
- **Islanders** have no eyes, brows or mouth, only cheek marks, as in the
  film, and show feelings through body language instead.

**Limits.** Motion is generated, not hand-animated, so it will be simpler
than the film's best moments. Gags that change the whole silhouette, like
melting into a puddle, are done case by case or not at all. Arms are stubs
with no elbows or fingers, true to the design, and hold props in a fixed
grip. Distant crowd islanders, such as the rows at the night feast, use a
cheaper bob-only animation so phones stay smooth.

### Cast

| Character | Role on the island | Build notes |
|---|---|---|
| **Player** (nameless islander) | You. Lives here. | Grey-mauve islander body. Player picks the head style (round, cat or bunny ears, or a spike; never leaves, which are Hitoha's and Futaba's alone) and crown colour. |
| **Chiikawa** | Visiting guest. Anxious, kind, cries easily. | Warm white, two small round ears, pink crown. Most expression variants. |
| **Hachiware** | Visiting guest. Cheerful, curious, talkative. | Warm white, blue cap with pointed cat ears, pale blue crown, blue tail tuft. |
| **Usagi** | Visiting guest. Chaotic, loud, loves food. | Pale yellow, tall pink-lined ears, yellow crown. Often holds a torch. Appears where food is. |
| **Rakko-sensei** (Otter) | Visiting guest. Calm, watchful, cool. | Cream with fur ticks, dark brown ears and paws, star scar, white crown. Plays ukulele at the bonfire. Sword and cape are cosmetic. |
| **Momonga** | Visiting guest. Sly, acts cute. | White, fluffy cheeks, pale blue ear insides and nose dot, big fluffy pale blue tail, lavender crown. |
| **Kurimanju** | Visiting guest. Relaxed, always with a drink. | Peach with brown chestnut cap, pale green crown. |
| **Shisa** | Visiting guest. Cheerful. | Cream, orange flame mane and brows, peach crown. |
| **Furuhonya** (crab) | Visiting guest. Seen at the night beach. | Soft pink, coral claws on head, white crown. |
| **Hitoha** | Islander. Timid but curious. Always with Futaba. | Islander body with **one** leaf sprout. |
| **Futaba** | Islander. Steady, friendly. Always with Hitoha. | Islander body with **two** leaf sprouts. The two share a schedule. |
| **Islanders** (10–20 generic) | Village life, stalls, feast, singing. | Same grey-mauve mesh with different head shapes: rabbit ears, cat ears, round ears, spike. Never leaves: only Hitoha and Futaba have those. Can be instanced. |
| **Food-shop owner** | Runs the food stall, toasts at the feast. | Large mustached figure in a 味自慢 loincloth, about twice Chiikawa's height. Name to be confirmed. |
| **Small mermaids** (2) | Rare sightings in the deep and the cave. | White round head with rust cap and antennae, startled O mouth, pink band, rust scaled tail. Shy: dart away if approached fast. |
| **Siren** (optional) | Silhouette with red eyes peeking from the sea at night. | Large, about 2.5× Chiikawa. Only if you choose option (b) or (c). |

**Build order.** Chiikawa first, since she exercises every part of the kit.
Then an islander, since it is the player's body and the most common mesh.
Then the rest of the cast.

---

## 5. The island

Laid out after the film's aerial shot (`mermaid island 1`), traced
through a game camera matched to the shot, so the island seen from there
looks as the film draws it. A single contiguous map, roughly 430 × 430
metres including the surrounding sea, small enough to cross on foot in
about two minutes and to keep in memory with no streaming. The island
itself is a rounded shape about 290 metres across (215 from north to
south), with a sandy ring all the way around: narrow where the jungle runs
down to the water in the west and north, widest on the night beach.

```
                            N
   ~   ▲▲   ┌────────────────────────────────┐   ▲▲  ~     ▲  karst pillar / sea spire
   ~        │   ■    ▲      ▲                │       ~     ■  mesa the jungle hides
   ~   ▲▲   │  ■■   (■■)    ◎◎    ▲▲   ■     │  ▲▲   ~     (■■) the great dome of trees
   ~        │     ■       ■  ⌂ ⌂  ▲    ■■    │       ~     ◎  the cave's skylight
   ~        │  ▴▴   ■  ⌂ ⊓stage ⌂ ▲    ■     │       ~     ▴  little white spires
   ~   ▲    │  ■   ▲     ⌂ ⌂ ⌂          ▓    │  ▲    ~     ⌂  stilt huts
   ~        │    ░░░  ✦ ✦┃✦ ✦  ♣♣♣  ▓▓       │       ~     ░  fields
   ~   ▲▲   │    ░░ ✦ ✦ ⌒arch⌒ ✦ ✦  ▓        │       ~     ✦  festival stalls
   ~        └── main beach ═╗═ night beach ──┘       ~     ⌒  welcome arch
   ~      lagoon            ║ pier   rowboat     ▲  ~     ▓  rocks behind the night beach
   ~            reef      🦆 ferry at anchor        ~     ⊓  watchtower stage
   ~    ~ ~ ~ ~ ~ reef edge ~ ~ ~ ~ ~                ~
   ~          the deep (dark, eerie)                 ~
```

| Zone | What happens there | In the water |
|---|---|---|
| **Pier and ferry** | A short wooden pier on vivid turquoise water, as in the film's aerial shot, leading straight onto the festival street. The white duck-shaped ferry lies at anchor out in the bay. Confetti welcome for new guests. | Too deep: sit on the end instead. |
| **Festival** | Behind the main beach: two long rows of stalls facing the bay either side of the pier, the welcome arch (島へようこそ!! in yellow flowers) in the opening between them, and through it a street of stalls running inland under banners, bunting and lanterns. Usagi runs about. | Dry. |
| **Main beach** | Wide sand either side of the pier. Palms, starfish on the sand. | Wade in gradually. |
| **Village** | A clearing deep in the jungle, in the middle of the ring of pillars on the path to the cave's skylight: big stilt huts you can walk into, with mushroom-shaped thatched roofs and patterned walls, a few plank and round beehive huts, round the tall wooden watchtower stage where announcements are made, torches in front of it. Potted plants, fruit baskets, log benches. Most conversations happen here. | Dry. |
| **Fields** | Farm plots just west of the festival street, as in the film's aerial shot. Islanders tending crops. | Dry. |
| **Jungle** | Fills the interior. Striped palms, ferns, monstera, bright flower bushes, blue butterflies, clover clearings. Golden late-afternoon light. | Dry. |
| **Karst pillars** | Seven tall pale limestone towers in a ring round the island's middle, jungle on their tops with white rock standing out of it, the island's silhouette from every angle. Many short, wide ones hide in the forest: mesas thick with trees on top, one under a great dome of them. Not climbable. They are landmarks for finding your way. | — |
| **Cave skylight** | Between the pillars in the island's centre, as in the film's aerial shot: not a pond but a round opening in the jungle floor, in a gentle hollow where the trees stand back, ringed by a mossy lip with vines hanging down inside, in the middle of the ring of pillars. Far below lies the forbidden cave's water, the sea come in under the island. A calm, hidden spot. | Peer down from the lip. |
| **Night beach** | East end of the main beach, the widest stretch of sand, below low layered rocks. Bonfire, the night feast with rows of islanders, Rakko's ukulele, moon on the water. | Wade. |
| **Forbidden cave** | Under the island's middle: a round chamber whose opening in the ceiling is the skylight in the jungle above. The moon, or a sunbeam by day, shines down onto its glowing water with drifting sparkles and mist. A stone ledge with a small fire sits beside it. Reachable only by rowboat, as in the film; where its entrance is (behind a No Entry sign) and the dark rock passage in are still to be planned. | Row in, across the moonlit water. |
| **Lagoon** | Calm, clear, bright water inside the reef. Fish shoals. | Wade in the shallows; row across it. |
| **Reef** | Coral shapes, colourful fish, rock spires breaking the surface around the edge. | Row out over it. Mermaid sightings start here. |
| **The deep** | Past the reef edge. Near-black navy water and slow eerie sounds: the scariest place on the island, by design. | Row out over the dark water. |

**Rowboat.** A small wooden rowboat sits on the night beach near the
rocks. Get in to row along the coast, out over the reef and the deep, or
into the forbidden cave: it is the only way onto deeper water. Rowing
uses the same joystick; the context button gets you out at any shore or
ledge.

The ground is built in Blender from a height grid over the map, with its
colours painted into one texture seen from above. The rock landmarks (karst
pillars and mesas, the cave's skylight, the rocks behind the night beach,
sea spires) are built with it, so their feet fit the ground. A waterfall
is still to be placed; the film's aerial shot has none in the middle. Huts, palms,
stalls and coral are props placed from a JSON layout file, so the map is
editable without touching code. The cave under the skylight, its entrance
and the passage in are to be planned with M2.

---

## 6. Gameplay systems

### 6.1 Controls (portrait, one thumb)

- **Left half of screen:** virtual joystick appears where you touch. Move.
- **Right half, drag:** orbit camera.
- **Context button (bottom right):** changes meaning by situation — Talk,
  Pick up, Sit, Jump.
- **Tap an NPC:** walk to them and talk.
- **Desktop:** WASD + mouse, E to interact, Space to jump.

### 6.2 Movement

| State | Speed | Notes |
|---|---|---|
| Walk | 3 m/s | Capsule collider slides along the heightmap and prop colliders. |
| Run | 5 m/s | Push joystick to the edge. |
| Wade | 2 m/s | Water above the knees. You wade in up to your chest and no further: there is no swimming. |
| Row | 3 m/s | In the rowboat. Joystick steers, the boat turns gently. Context button gets out at a shore or ledge. |

### 6.3 Time, weather, and sim

- A full day lasts **24 real minutes** (1 game hour per real minute),
  adjustable in settings. The clock keeps running from your last save when
  you reopen, capped to one game day of catch-up so routines feel continuous.
- Phases: dawn, morning, noon, afternoon, dusk (festival lights come on),
  night.
- Weather is gentle: clear, light clouds, brief warm shower, rainbow after.
  Never storms.
- **Festival** happens every evening from dusk to night. Lanterns light,
  the bonfire is lit on the night beach, islanders sit in rows for the
  feast, Rakko plays ukulele, everyone sings. Guests join in.

### 6.4 NPC behaviour

Each character has a **daily schedule** (JSON) of time-stamped intents:

```
Hachiware:
  06:00  fish at pier
  09:00  explore forest
  12:00  parfait at the beach stalls (with Chiikawa)
  15:00  wade at the main beach
  18:00  feast at the night beach
  22:00  sleep at a village hut
```

An intent resolves to a location and an activity animation. Characters
walk there along a precomputed navigation grid, then loop the activity.
Small randomness (±20 minutes, occasional swapped activities) keeps it from
feeling clockwork. Paired characters (Hitoha and Futaba; Chiikawa and
Hachiware for meals) share schedule entries and face each other when idle.

NPCs react to the player: turn to look when you approach, wave if friendship
is high, say a short bark line if you walk past without talking.

### 6.5 Dialogue

- Text box at the bottom, typewriter effect, tap to advance, tap-hold to
  skip. Portrait and name on the left.
- Lines are stored in JSON per character, grouped by **context**: time of
  day, location, activity, weather, friendship tier, and whether you have
  talked today.
- Light branching: at most one choice per conversation, usually a yes/no or
  a pick-a-topic. No consequences beyond friendship and a journal entry.
- Tone is the manga's: short, soft, a little absurd. Chiikawa mostly says
  "ワ…" and "うん". Hachiware chats. Usagi says "ウラ" and "ヤハ". Islanders
  are warm and slightly formal.
- **Language: Japanese only.** Details below.

#### Language

- The game is in Japanese only, with no language setting.
- Every string the player sees, UI and dialogue alike, lives in
  `locales/ja.json`, keyed by an ID, so the words stay in one place. Code
  never contains display text.
- Character names are their katakana or hiragana forms: ちいかわ, ハチワレ,
  うさぎ, モモンガ, ヒトハ, フタバ.
- **Fonts.** Japanese fonts are several megabytes, which would blow the 5 MB
  load budget. The game uses the phone's built-in Japanese fonts, with a
  rounded style preferred where the system has one. A subset of a rounded
  web font is a later polish option.
- **Text layout.** Japanese has no spaces, so the dialogue box wraps by
  character, and the typewriter effect reveals one character at a time.
- **My limits.** I write natural Japanese, but not at the level of a native
  writer reproducing the manga's voice. You review the tone on a sample
  before I write the full set of lines.

### 6.6 "Monitoring" the island

A **journal** (bottom-left button) with three tabs:

1. **Now.** Live list of every named character, where they are, what they
   are doing. Tap one to get a compass arrow pointing to them.
2. **Friends.** Friendship hearts per character, last thing they said, small
   facts you have learned.
3. **Discoveries.** Shells, fish, and sights you have found; mermaid
   sightings log; festival songs heard.

No objectives. The journal is for curiosity, not completion.

### 6.7 Small interactions (the texture of comfy)

- Sit on any bench, rock, or the pier edge. Camera pulls back. Time passes.
- Pick fruit, shells, and flowers. Give them to characters for a line and a
  heart.
- Splash in shallow water. Fish scatter.
- Feed fish. Shoals follow you briefly.
- Join the festival song: a rhythm-free tap-along that just plays notes.
- Photo mode: hide UI, free camera, tap to save a PNG to your phone.

### 6.8 Saving

Autosave every 30 seconds and on tab hide. Stores clock, player position,
friendship, discoveries, settings. Versioned so old saves migrate. An
"export save" button copies a JSON string to the clipboard as a backup,
since clearing browser data wipes `localStorage`.

---

## 7. Architecture

Files marked * exist after Milestone 0; the rest arrive in later milestones.

```
art/
  blender/
    charlib.py         * shared modelling helpers: lathe, capsules, fusing, attributes, export
    import_characters.py* converts the downloaded cast models (and Chiikawa's for the islanders); faces, masks, outfits
    outfits.py         * the island outfit: flower crown and grass skirt, fitted per wearer
    face_art.py        * painted faces: layers, expressions.txt, starter art for new characters
    build_characters.py* parts kit for characters without a downloaded model (none yet)
    build_island.py    * the island: the ground's heights, painted colours and mesh; the landmarks; the plants
    karst.py           * the rock landmarks: karst pillars and mesas, the cave's skylight, sea spires; a waterfall for later
    plants.py          * the jungle's plants: canopy clumps, palms, ferns, bushes, monstera, crops
    build_props.py     * palm, log, starfish, onigiri, No Entry sign, butterfly
    build_village.py   * the village and the festival: huts, stage, torches, stalls, arch, banners, bunting, pier, ferry
    houses.py          * houses you can walk into, the watchtower stage, the festival's arch and banners
    cast.blend         * generated: the converted cast with their outfits, for viewing in Blender
  faces/<id>/          * each cast member's painted face: layers, expressions.txt and a guide
    props.blend        * generated: all props
    village.blend      * generated: the village, the pier and the ferry
  previews/            * generated: front, three-quarter, side and back renders
scripts/
  make-icons.mjs       * draws the app icons
src/
  main.ts              * bootstrap
  styles.css           * HUD and panel styling
  core/
    Game.ts            * owns scene, loop, resize, visibility handling
    Input.ts           * touch joystick, camera drag, pinch, keyboard
    CameraRig.ts       * follow and orbit camera
    FreeCamera.ts      * development: a camera that flies anywhere, from the Test panel
    Settings.ts        * character choice, saved locally
    toon.ts            * shared toon light ramp
    Save.ts            versioned save game
  i18n/
    I18n.ts            * text lookup by key
  locales/
    ja.json            * all the Japanese text the player sees
  world/
    Stage.ts           * the island, the sea, the sky with sun, moon and stars, clouds
    Ink.ts             * the world's pen: one stroke width for every outline; swaying and flapping hulls
    PropModels.ts      * loads Blender props and what they tell the game: footprint, deck, label
    Island.ts          * the island's ground: height grid, walking, the waterline; the rocks' feet
    Landmarks.ts       * the rock landmarks and the cave's skylight; a waterfall, when there is one
    Props.ts           * placement from layout.json, merged by patch, painted signs, the bobbing ferry
    Obstacles.ts       * what blocks walking and the camera: prop feet, decks, trunks, crowns
    Vegetation.ts      * the jungle and crops, swaying in the wind
    Butterflies.ts     * blue butterflies fluttering round flowering bushes
    Glow.ts            * windows and lanterns that light up at night
    DayNight.ts        * the island's clock and how it looks at every hour
    Zones.ts           * named places from layout.json, then the sea by depth and the land
    Navigation.ts      grid, A*, walkable mask from terrain and props
  characters/
    Model.ts           * loads a character .glb with its rig metadata, face art and masks; loads outfits
    CharacterMaterial.ts* soft-body toon shader and outline; cap, fringe and leaf patterns
    Character.ts       * pose layers, springs, locomotion, jump, anchors, shadow
    Face.ts            * face layers drawn to canvas, expressions, blinking, gaze
    Pose.ts            * the blendable pose record
    Springs.ts         * damped springs for follow-through
    Actions.ts         * procedural action library
    Emotes.ts          * symbols, speech bubbles
    Props.ts           * hand-held props (the Blender onigiri) with outlines
    PlayerController.ts* joystick to camera-relative movement
    definitions.ts     * per-character face style and speeds
    types.ts           *
    Npc.ts             schedule runner, pathing, reactions
  systems/
    Clock.ts           save catch-up for the day's clock (the clock itself is in world/DayNight.ts)
    Weather.ts
    Dialogue.ts        picks lines by context, runs the box
    Friendship.ts
    Journal.ts
    Audio.ts           ambient, positional
  ui/
    Hud.ts             * title, time and stats, place names, joystick ring, jump button
    TestPanel.ts       * actions, expressions, lineup, time of day
    DialogueBox.ts
    JournalPanel.ts
    PhotoMode.ts
  dev/
    DevTools.ts        * development only: staged film shots, portraits, captures for comparisons
public/
  models/*.glb         * characters, generated by the Blender scripts
  models/faces/*.png   * each cast member's baked face art
  models/masks/*.png   * Hachiware's cap and the inner-ear masks
  models/outfits/*.glb * the island outfit, one per wearer
  models/props/*.glb   * props, generated by the Blender props script
  pwa-*.png, apple-touch-icon.png, favicon-64.png *
  models/island/      * the ground, its colour map and height grid, the landmarks, the plants
  data/
    layout.json        * prop placement and the named places
    schedules/*.json
    dialogue/*.json    line structure and context, keyed by string ID
  textures/            normal maps
  audio/
```

Principles: one `update(dt)` tree, no per-frame allocations in hot paths,
all content in JSON so tuning does not need code changes, every system
testable on desktop with a fake touch layer.

---

## 8. Mobile delivery

### Hosting

1. GitHub repository. Pages on a free account requires a **public** repo.
   If you prefer private, Cloudflare Pages or Netlify deploy from private
   repos for free with the same push-to-deploy flow.
2. GitHub Actions workflow: on push to `main`, run `vite build`, publish
   `dist/` to Pages. The game lives at
   `https://<your-username>.github.io/<repo-name>/`.
3. Vite `base` set to the repo path so assets resolve.
4. `.gitignore` excludes `reference images/` so the film's artwork is never
   pushed. Only our own code and generated assets go public.

### Installable PWA

- `manifest.webmanifest`: name, icons (192, 512, maskable), portrait
  orientation, `display: standalone`, theme colour.
- Service worker caches the built app and assets so it opens offline and
  loads instantly after the first visit.
- iOS: Safari share sheet → "Add to Home Screen". Android: Chrome shows an
  install prompt automatically.
- Fullscreen on iOS only works when launched from the home screen icon;
  we will show a one-time hint.

### Platform quirks to handle up front

- iOS requires a user gesture before audio plays → "tap to begin" screen,
  which also serves as the loading screen.
- iOS Safari can reload the tab under memory pressure → aggressive texture
  budget and frequent autosave.
- Prevent page scroll, pinch-zoom, and pull-to-refresh with viewport meta
  and `touch-action: none`.
- Handle `visibilitychange`: pause the clock and audio when backgrounded,
  save immediately.
- Notch and home-indicator safe areas via CSS `env(safe-area-inset-*)`.

### Testing loop

- I run `vite --host` here and test in the built-in browser at a 390×844
  viewport, reading the console for errors.
- You open `http://<your-pc-ip>:5173` on your phone over the same Wi-Fi to
  feel the real touch controls. Nothing is published until we push.
- A hidden debug panel (triple-tap the clock) shows fps, draw calls, zone,
  and lets you jump time.

---

## 9. How we work together

**What I do.** All code, all procedural models and animation, shaders, data
files, UI, deployment config, and testing in the browser pane. I keep this
plan and a short `CHANGELOG.md` updated so you can always see where things
stand.

**What I need from you.**

- Reactions. Open it on your phone, tell me what feels wrong. "Walking feels
  floaty" is more useful than a long review.
- Reference. If you have screenshots or descriptions from the movie for
  the gaps listed at the end of `STYLE_GUIDE.md`, drop them in
  `reference images/`.
- Decisions on the open questions in section 12.
- The GitHub side: creating the repo and connecting Pages is a one-time
  click-through I will walk you through, since it needs your account.

**What I cannot do.** Click around in a GUI editor (Blender runs from my
scripts, and I check its renders), hear the audio I generate (I will pick
sensible defaults and you judge), or test on real hardware. Everything
hardware-related is a guess until you confirm it.

**Conventions.** Small commits with clear messages. One milestone per
branch, merged to `main` when playable. No feature is "done" until it has
been checked at the mobile viewport.

---

## 10. Milestones

Each milestone ends with something you can open on your phone.

| # | Name | What you can do at the end | Rough size |
|---|---|---|---|
| **M0** | Scaffold and first character | Open a URL on your phone and walk Chiikawa around a sand plane with the joystick at 60 fps. She squashes, jiggles, blinks and changes expression. A test panel triggers every action and expression so you can judge the feel. A lineup of Chiikawa, Hachiware, Usagi and an islander for you to approve the look. PWA installs. Locale system in place, so even the first button reads in Japanese. | Medium |
| **M1** | Island | Walk the whole island: terrain, karst pillars, jungle, village, pier, moored ferry, water plane, sky, day-night cycle with moon and stars, zones. Props from layout file. | Medium |
| **M2** | Sea | Wade in the shallows. Bright lagoon and dark deep. Fish shoals. The rowboat, out over the reef and the deep and into the forbidden cave under the skylight, with its moonlit water. | Medium |
| **M3** | Cast | The rest of the named characters built from the parts kit, with their own actions, props and expressions. Standing around on the beach. | Medium |
| **M4** | Life | Schedules, pathing, reactions. Characters go about their day. Night feast with bonfire and gathering. | Large |
| **M5** | Talk | Dialogue system, first pass of lines for every character, friendship, journal with Now / Friends tabs, all in Japanese. | Medium |
| **M6** | Texture | Sitting, picking, giving, feeding fish, photo mode, Discoveries tab, mermaid sightings, song tap-along, audio pass. | Large |
| **M7** | Polish | Performance tuning on your real device, settings, save export, icons, loading screen, the small bugs list. | Medium |

After M7 the game is "complete" in the sense of this plan. Anything further
is a new plan.

**Status (2026-10-17).** M0 is built and tested in the browser at phone and
desktop sizes. It still needs a check on a real phone. M1 is under way on
the `m1-island` branch: all seven steps are in (the ground and the sea, the
landmarks, the village, beach and pier, the jungle and fields, the layout
file and zones, the sky and the day, a performance pass). The scene is over
the 150k-triangle phone budget, mostly from the cast and their outlines; a
real phone test will say whether that matters. See `CHANGELOG.md`.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Characters look wrong because I cannot see them the way you do | High | Blender turnaround renders plus the in-game lineup for every character; iterate with you before building the rest. |
| iOS Safari performance or memory reloads | Medium | Hard budgets from day one, quality tiers, test M0 on your phone before anything else. |
| Procedural animation feels stiff | Medium | Lean on squash-and-stretch and bobbing, which suits round characters; keep timing data-driven so I can tune quickly. |
| The water shader eats the frame budget | Medium | Cheap surface shader, no reflections or refraction on mobile. |
| Dialogue tone misses the manga's voice | Medium | Short lines, you read a sample set early and correct the voice before I write hundreds. |
| Japanese lines read as stiff or unnatural | Medium | Reviewed by you on a sample before the full set is written. Short lines keep the risk small. |
| Scope creep from "comfy" ideas | High | Section 1 pillars and not-goals; new ideas go to an `IDEAS.md` backlog, not the current milestone. |
| Public repo with the Chiikawa name draws attention | Low | Non-commercial and personal. Keep the repo description modest. Can move to a private repo on Cloudflare Pages at any time. |

---

## 12. Decisions

Answered on 2026-10-16.

| Question | Decision |
|---|---|
| The Siren | Silhouette with red eyes peeking from the sea at night. Never interacts. |
| Who is the player | A nameless islander with a customisable head style (ears or a spike) and crown colour. |
| Language | Japanese only. |
| Hosting | Public GitHub repository, served by GitHub Pages. Reference images stay local. |
| Day length | 24 real minutes per game day, adjustable in settings. |
| The deep | Eerie mood only: dark water and creepy sounds. Nothing moves at you. |
| Diving and swimming | Dropped on 2026-10-17: no diving, no swimming and nothing underwater. You wade in the shallows; the rowboat takes you onto deeper water. |
| Extra movie content | Nothing more for now. New ideas go to `IDEAS.md`. |

---

## 13. References consulted

- https://en.wikipedia.org/wiki/Chiikawa
- https://www.animenewsnetwork.com/cms/.239826
- https://scrmbl.com/post/chiikawa-the-secret-of-the-mermaid-island-review
- https://www.malaymail.com/news/showbiz/2026/08/21/chiikawa-movie-is-dystopia-story-wrapped-in-a-deceptively-adorable-package-video/232109
- https://anime.eiga.com/movie/112975/
- https://www.cinematoday.jp/news/N0155943
- https://animatetimes.com/news/details.php?id=1764310773
- https://utaten.com/specialArticle/index/10168
- https://chiikawa-biyori.com/movie-dare
- https://mangaloversroom.com/chiikawa-shimahen/
