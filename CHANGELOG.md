# Changelog

## M1 — Island (in progress, branch `m1-island`)

Checked in the browser from the pier, the festival street, the village and
inside a hut, the jungle, the fields, the cave's skylight, the night beach
and the foot of a pillar, from high above, side by side with the film's
aerial shot from the camera the island was laid out with, and at dawn,
noon, dusk and night; walked up a hut's stairs into its room and up the
stage, along every path, and round the skylight's lip. Not yet checked on a
real phone.

**Added**

- The island's ground, built in Blender by `art/blender/build_island.py`
  after the film's aerial shot, traced through a game camera matched to the
  shot so the island seen from there looks as the film draws it: a rounded
  island about 290 metres across with a sandy ring all round (narrow where
  the jungle runs down to the water in the west and north, widest on the
  night beach), grass inland, the festival street behind the main beach,
  fields just west of it, the village's clearing deep in the jungle and
  paths between them up to the cave's skylight. Its colours are painted into
  one texture with soft hill shading, and its heights come as a grid the
  game walks on.
- The island's landmarks, built with the ground (`art/blender/karst.py`
  shapes the rocks), each where the film's aerial shot has it. Seven tall
  pale limestone karst pillars stand in a ring round the island's middle,
  split into slabs and fluted by rain, with ledges, moss hanging from their
  tops and a crown of jungle, white rock standing out of it: rounded knobs
  on the flat-topped ones, spikes on the two tallest. Nine short, wide
  pillars hide in the forest, mesas thick with trees on top, one under a
  great dome of them; two little white spires poke out of the canopy in
  the west. Low layered rocks stand behind the night beach, and eighteen
  sea spires in six clusters round the lagoon. There is no waterfall for
  now: the shot has none in the middle of the island.
- The round water in the middle of the ring of pillars is not a pond: as in
  the film, it is the forbidden cave's skylight, a round opening in the
  jungle floor about 24 metres across, in a gentle hollow with the trees
  standing back from it, so its water shows from above as in the film's
  aerial shot. A mossy lip runs round it, a step above the ground, with
  vines hanging down inside. Its fluted limestone sides flare out under the
  edge into the cave and fall to the cave's water below: the sea, come in
  under the island, turquoise like the lagoon. Characters walk round the lip
  and stop a step back from the edge. The cave itself, its entrance and the
  way in are still to be planned; the No Entry sign (立入禁止) waits for the
  entrance.
- The bay is the festival, laid out as in the film's arrival: a short
  wooden pier (rough planks on log posts, over turquoise water) reaches out
  from the middle of the beach, and the white duck ferry lies at anchor out
  in the bay, bobbing, as in the film's aerial shot. The ferry is built
  after the film's and sketches of it from the front, both sides and above:
  simple and round all over, no hard edges, a bell in section and an egg
  from above, widest at the cabin's front wall. A tall, bendy neck rises
  from its bow into a round head with dot eyes and a long, flat yellow
  bill; behind it an open-air deck with a railing round its open sides;
  behind that the cabin, its rounded front wall inked round (a door at
  the bottom, a small window high up) and its round roof curving down to
  a little flat tail. Paned windows of
  pale blue glass lie on the cabin's curved sides and light up at night;
  a door in the hull's left side.
  Behind the beach, two long rows of stalls stand side by side facing the
  bay, awning touching awning, following its curve, either side of an
  opening in line with the pier. The welcome arch spans the opening: a
  wooden board reading 島へようこそ!! wreathed in big yellow flowers, with
  ウェルカム・トゥ・シマ on the banner below. Through it, a street as wide as
  the arch runs inland, packed with stalls down both sides facing in, and
  four across its far end facing back toward the arch, either side of the
  path on to the village. The whole festival stands on level ground; the
  path climbs to the jungle only past the street's end. Forty stalls in
  all under signboards (じゃがバター, たこ焼き, いか焼き, りんごアメ, ケバブ,
  冷しパイン, 金魚すくい, 射的, クレープ, やきそば and more), bunting with
  paper lanterns strung along the rows and across the street, white
  banners reading いらっしゃいませ!! and たのしんでね, poles of pink lanterns,
  palms behind the stalls and confetti over the beach and the street.
  Built in Blender by `art/blender/build_village.py` (the arch and banners
  by `art/blender/houses.py`).
- The village is a clearing deep in the jungle, in the middle of the ring
  of pillars, on the path from the festival street to the cave's skylight. Eight big huts stand round it, each
  one you can walk into, after the film's village frames: log stairs up to
  a plank porch with a railing, a doorway wide enough for three, lattice
  windows over bands of coloured scales, a log-cabin room inside with a
  straw mat, a pillow, a low table, a rug and a potted plant, and a big
  mushroom-shaped thatched roof over the porch. Two are plank huts on the
  ground under wide thatched roofs; two round thatched huts stand at the
  edge. Built by `art/blender/houses.py`.
- In the middle of the village, the tall wooden watchtower stage where
  announcements are made: log legs braced with crossed boards, a platform
  three metres up with a railing, stairs up its back and a conical
  thatched roof. Four tiki torches stand in front of it, lit at night.
- Logs to sit on round the stage, potted plants by the porches, baskets of
  fruit, flowering bushes and grass round the huts.
- The jungle fills the island's interior, dense like the film's: a
  canopy of tree clumps whose round crowns run together, nearly two hundred
  palms among them and thick along the beaches, a dozen big trees with
  buttress roots and hanging vines, and under them all ferns, cycads, red
  ti plants, bromeliads, monstera and flowering bushes (purple, white,
  yellow, red, pink), thickest along the paths. The ground under the trees
  is shaded. Everything sways gently in the wind, outlines and all.
- Crops grow along the fields' rows, just west of the festival street.
- Blue butterflies flutter round flowering bushes, mostly near the beach
  and the village.
- The island's layout is a file, `public/data/layout.json`: where every
  prop stands, which way it faces and what its signs say, which group it
  is drawn with, and the island's named places. The Blender build reads it
  too, to keep the jungle clear of the props.
- Places have names. Walking into one shows its name for a moment under
  the title: お祭り通り, 村, 浜辺, 畑, 桟橋, 洞くつの天窓, 東の浜, and the
  sand, the jungle, the lagoon, the reef and the deep sea elsewhere. The Test panel's info line shows it too.
- A free camera in the Test panel (フリーカメラ), for looking round the
  island quickly: fly the way the camera looks with the stick or WASD,
  drag to look round, pinch, scroll or E and Q to rise and sink, Shift to
  go faster. ここへ移動 puts the character you control down under it.
- For checking the island against the film: in development, `__dev.shot('aerial')`
  in the browser console frames the island as the film's aerial shot does,
  through the camera it was laid out with (in a window shaped like the
  frame, about 1.86 : 1). From high above, the sea reaches further and the
  haze thins, so the island still reads.
- Day and night: a whole day passes in 24 minutes, starting at ten in the
  morning. The sky goes from dawn pinks to bright blue, to a golden
  afternoon, an orange and pink dusk and a deep navy night with twinkling
  stars and a big full moon outlined with the pen, its light broken in a
  road across the sea. The light, the sea, the clouds and everything on
  the island follow the hour. At dusk the huts' windows, the ferry's
  windows and the lanterns light up warm, and go out with the dawn. The
  time shows by the title.
- The Test panel has a 時間 section: 朝, 昼, 夕方 and 夜 jump to dawn, noon,
  dusk and night, and 時間を止める stops the clock.
- The sea is coloured by its real depth: pale aqua at the water's edge,
  turquoise over the lagoon, which spreads wide round the island as in
  the film's aerial shot, blue past the reef, fading into the deep beyond
  the island's map. The surf follows the coastline, and the
  waterline is drawn with the pen wherever the ground meets the water,
  round the island.
- The sea and the clouds travel with the camera, so from anywhere on the
  island the horizon line sits on the sea's far edge and the clouds stay
  far off in the sky.
- Characters walk up and down the island's slopes, wade only ankle-deep,
  and stop at cliffs, steep rock, the skylight's edge and the foot of
  every rock landmark, hut, stall, palm and tree trunk. They can walk out along the pier to its end.
  They climb steps no higher than a stair's (so they walk up a hut's
  stairs onto its porch and into its room, and up the stage, but not up
  the porch's side), walk under roofs, and can't walk under a hut. The
  camera never dips into a hill behind them, and comes in front of a rock,
  a wall, a roof or a tree's crown rather than behind or inside it.
- The waterline follows the height grid, the same edge the water stops at
  and characters wade to, so it runs smoothly round every shore. The rocks
  draw it too, where they stand in the water, down in the skylight too.

**Performance**

Measured in the browser. With the whole cast and crowd (11 characters) at
the head of the pier, at the default camera: about 580k triangles in 110
draw calls, up from 535k now that the jungle is as dense as the film's.
Without the cast (measured before the island was laid out after the film):
the festival street 433k, the village 375k, the jungle 210k, from high
above 450k in 137 draw calls. The plan's phone budget is 150 draw calls
(met) and 150k triangles (not met, by three to four times); everything
outlined is drawn twice, once for its pen line. To get there:

- Rocks are grouped by where they stand, so a group out of view is not
  drawn. Small props (baskets, pots, logs, starfish) and the plants under
  the jungle's canopy are drawn only near the camera.
- The huts, the canopy and the palms come in two versions: in full near
  the camera, and light (roofs and walls; coarse crowns; plain palms)
  beyond. A hut's room is drawn only close up.
- Palms, baskets, pots, the stalls (half as many triangles each, so forty
  cost little more than twenty), the arch's flowers, the understory's
  leaves, the rocks' crowns and the canopy have fewer triangles than at
  first.
- Every sign's words share one 2048 x 1024 texture, packed tallest first,
  as sharp as fits.
- Props that never move are joined into a few meshes per group (the
  festival, the village) or patch of the island, with one outline each.
- Plants planted many times are kept once each in the plants file, with
  where each copy stands, and joined at load: the file went from 9 MB to
  1.9 MB.
- The drawing resolution steps down when the frame rate stays under 48
  for a few seconds, and back up when there is room again.

**Changed**

- Building the props or the village with `--only` no longer overwrites
  their .blend file with just the one prop.
- The offline cache now keeps the island's height grid and layout file,
  and files up to 4 MB.

**Removed**

- The M0 test beach, a small disc of sand.
- Diving, swimming and everything underwater, from the plan (none of it
  had been built): you wade in the shallows, and only the rowboat goes
  onto deeper water.

## M0.1 — Downloaded cast and the island outfit (2026-10-16)

Checked in the browser against film frames 9 and 14 and the official
character cards, from the front, side and back. Not yet checked on a real
phone.

**Changed**

- Chiikawa, Hachiware and Usagi now use the downloaded rigged models,
  converted by `art/blender/import_characters.py`: posed, scaled for the
  game, and split into the game's soft-body parts.
- Faces are each model's own face art, baked to a texture. Expressions and
  blinking are drawn over it in the same places.
- Hachiware's cap and the inner ears come from the models' painted masks,
  so their edges are smooth and outlined like the film. Hachiware's cap
  sits higher than the model paints it (its lower edge raised 0.08 head
  radii on the face), as in the film, so his brows show on white forehead
  and the crown sits above them.
- The cast is as squat as the film's characters. The downloaded models
  stood a head on a long body; the converter now lowers the head and
  squeezes the body under it, keeping the face, ears, arms and feet as
  modelled.
- Arms rest held out to the sides, like the character cards. Raised high,
  they stop before sinking into the head and come forward instead, so waves
  and cheers stay in view.
- One pen for the whole world: every line is 1.8 cm in the world (2% of a
  cast member's height), as thick as the grass skirt's strokes. That covers
  characters, outfits, crown flowers and skirt strokes; the palms, log,
  starfish and held onigiri; the clouds; the horizon and the waterline; and
  the emotes.
- The clouds are cartoon puffs with flat bases, and the sea is round and
  stays blue right up to the horizon line.
- The palm's fronds are solid jagged blades that can carry an outline, and
  the log's cut ends have an inked rim and growth ring.
- Hitoha and Futaba, the islanders, are shaped like Chiikawa now. They are
  converted from Chiikawa's model without the ears and tail, grey all over,
  with leaves on top (Hitoha one, Futaba two) and a fringed grass skirt of
  their own in the same grey. They stand about 2.5 head radii tall, like
  the official plush. Their faces are only cheek marks, four bold strokes a
  side, with no eyes, brows or mouth.
- Hitoha and Futaba are unique: there is one of each, standing together on
  the beach, and no other islander has their leaves. Both are in the Test
  panel as characters of their own; Hitoha replaces the old "Islander".
- The background crowd is generic islanders only, built the same way from
  Chiikawa's, Hachiware's and Usagi's models: round, cat or bunny ears
  instead of leaves, and a grey flower crown, as in the film's crowds.
  Every islander in the crowd shows their cheek marks.
- The background crowd's islanders are light copies, about a quarter of the
  triangles of the full models: simplified head, body, arms and ears, no
  feet (always under the skirt), and coarser skirts and crowns. They look
  the same from the game's camera. Hitoha and Futaba keep the full models.
- Chiikawa's brows, cheeks and closed mouth are repainted.
- Leaf veins are drawn as the film draws them, rising at about 45 degrees
  from the midrib, and fade out on leaves too small on screen to hold them.
- `build_characters.py` builds no character for now: it is the parts kit for
  characters without a downloaded model.
- The game is in Japanese only. English and Simplified Chinese are gone,
  along with the Test panel's language choice. Hitoha and Futaba are
  written in katakana: ヒトハ and フタバ.
- Sitting is a real sit. The body settles onto its bottom with a little
  bounce and keeps its shape, and the legs stretch out in front with the
  soles just out from under the tummy. Before, it only squashed the body
  down. In the island outfit the skirt spreads on the ground and covers the
  feet, as in the film's campfire scene. Dozing sits the same way, nodding.
- Every action shows its own expression, even when one is chosen in the
  Test panel. The chosen expression shows between actions.
- Hopping stretches and squashes about a third as much.

**Added**

- Momonga joins the cast.
- The island outfit as an asset of its own, one per wearer: a flower crown
  and a grass skirt fitted to each character's head and body. The crown's
  clovers always face the camera, and the garland arches over the head from
  every side, as the film draws it. The skirt is tied just below the hands
  and flares out to the ground. Like the film's, it has no line along the
  hem, and its fringe strokes have rounded ends and start just above it.
- The **Island outfit** chip in the Test panel takes the outfits off and
  puts them back on.
- Hand-painted faces. Each cast member's face is a set of full-size layers
  in `art/faces/<id>/`: eyes, brows, mouths, cheeks, tears, sweat and more,
  with a guide image to paint over. Its `expressions.txt` says which layers
  make up each expression. The converter packs them for the game and never
  changes them; a mistake in `expressions.txt` stops the rebuild and names
  the line.
- Eight expressions, each character with its own combinations: neutral,
  smile, happy, determined, worried, teary, sobbing and shocked. Blinking
  and bowing swap in the closed eyes, and dozing the sleeping eyes where a
  face has them (Usagi's `eyes sleep`); talking and eating move between two
  mouths. Sitting, talking, the hula and bowing use the neutral face, and
  being startled shows shocked, then worried. The islanders keep simple
  drawn faces, without the old nose blush, wavy "S" mouth or big shocked
  eyes.

**Removed**

- The flying tears when crying, the sweat drop when startled and the
  sparkles when hopping and cheering. The painted faces have their own
  tears and sweat.

**Fixed**

- Dark patches on Momonga's cheek tufts and toes, which are stored
  inside-out in the downloaded model.
- Thin limbs (Momonga's arms and feet) drawn entirely in the outline
  colour.
- Hairlines inside the crown flowers (and, less visibly, on starfish and
  palm fronds): the outline pass no longer moves surfaces that face the
  camera, so their triangles cannot fold over at inward corners and show
  through.

**Measured** in the browser on the test beach, with the four cast members,
Hitoha, Futaba and five background islanders on screen. The frame rate could
not be measured this time, because the browser pane was throttling every
page.

| Frame rate | Draw calls | Triangles | Download, compressed |
|---|---|---|---|
| not measured | 58 | 210k | 1.7 MB |

**Known gaps**

- 210k triangles is over the plan's 150k budget for a mid-range phone. The
  five background islanders are only about 30k of it; the rest is the cast,
  Hitoha and Futaba at full detail, with their outfits. Measure on a real
  phone before cutting more.
- The downloaded models came without an author or a licence. See the
  README before publishing.

## M0 — Scaffold and first characters (2026-10-16)

Built and tested in the browser at phone and desktop sizes. Not yet checked
on a real phone.

**Added**

- Vite, TypeScript and Three.js project, installable as an offline-capable
  web app.
- Blender build script that models Chiikawa, Hachiware, Usagi and an
  islander (Hitoha, one leaf) and exports them for the game, with
  turnaround preview renders.
- Toon shader with warm brown outlines, near-flat shading, Hachiware's cap
  pattern, grass-skirt fringe lines and leaf veins.
- Soft bodies: squash and stretch, lean, and springy ears, skirts and
  sprouts. Usagi's ears bend in two segments.
- Drawn faces with 11 expressions, blinking, gaze toward the camera and
  talking or chewing mouths.
- 12 actions plus jump: wave, hop, hooray, bow, sit, doze, eat, chat, look
  around, startled, cry and hula.
- Effects: flying tears, sweat drops, sparkles, ! and ?, Zzz, music notes,
  hearts and speech bubbles.
- Blender props script that models a palm tree, a log, starfish and an
  onigiri, with preview renders.
- Test beach with sand, sea, foam, sparkles, sky, clouds, and the Blender
  props.
- Touch joystick, camera drag and pinch, jump button, and keyboard and
  mouse controls.
- Test panel to switch characters, line them up, and trigger any action,
  expression or language.
- Japanese, English and Simplified Chinese text. Japanese is the default
  unless the device is set to English or Chinese.

**Measured** in the desktop browser with all four characters on screen:

| Frame rate | Draw calls | Triangles | Download, compressed |
|---|---|---|---|
| 60 FPS | 16 | 103k | 0.9 MB |

**Known gaps**

- Chinese character names (吉伊, 小八, 乌萨奇) are the common fan names. No
  official Chinese names were found to confirm them.
- Futaba (two leaves) and the generic islander variants come in M3.
