# Changelog

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
