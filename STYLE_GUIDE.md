# Style Guide — Mermaid Island

Distilled from the 61 images in `reference images/`. This is the visual
contract for every model, colour and scene I build. Colours are my estimates
from the images, to be tuned by eye once things render.

The `reference images/` folder stays local. It is listed in `.gitignore` and
never pushed, because it is other people's artwork.

---

## 1. The overall look

- **Two moods, one island.** Daytime is bright, saturated and cheerful:
  turquoise sea, white sand, lush greens, festival confetti. Night is deep
  blue, starry, moonlit, quiet, with warm bonfire light. The film leans on
  this contrast and so will we.
- **Lines are dark brown, not black.** Every character outline in the anime
  is a warm dark brown. Black is reserved for the Siren's hair.
- **One bold pen for the characters and everything made.** As in the
  film, line art belongs to the characters and their outfits, crown
  flowers, skirt strokes, the props they hold, and to everything made by
  hand: the houses and their furniture, the stage, the stalls and their
  boards, the bunting's flags, the lanterns, the banners and the arch, the
  poles, the pier, the torches, baskets, pots and logs, and the duck
  ferry, all drawn with the same pen. Only the land is painted without
  lines (below). The pen is 1.8 cm in the world (2% of a cast member's height, a
  little heavier than the film's 1.4%), the same on everything at the same
  distance. Nearer things get bolder lines and further ones lighter, never
  under half the pen where the camera is looking. Lines painted into
  textures (emotes, a log's cut ends) use the same width, except on the
  tiniest effects such as tears, where it is capped so their shape reads.
  See `src/world/Ink.ts`. The pen draws only along the silhouette and where
  a piece crosses another, never across a surface facing the camera, so a
  flat face shows no stray hairlines (the characters' line in
  `CharacterMaterial.ts` follows the same rule as `Ink.ts`).
- **Characters are flat; backgrounds are painted.** Characters are flat
  colour with almost no shading, made darker and warmer only where they
  stand in the trees' shade (in the jungle's shade the film's white comes
  out a dark olive beige). The land is painted without lines, like the
  film's backgrounds (`src/world/Look.ts`): the ground, rocks, trees,
  palms and plants, water, sky and clouds; the houses and stalls carry the
  pen over their painted colour. All of it in warm sunlight with cool blue shadows
  that the rocks, trees and houses cast, dappled where the sun comes
  through the leaves, the jungle under its canopy in deep shade with the
  dapples bright in it, soft gradients across the turn from light to shade,
  haze into the distance and a warm haze where the light comes into a
  clearing, the jungle's depths fading into a soft teal haze (golden
  toward the sun) while what is near stays dark and clear, a soft glow
  round the brightest light and the film's colour grade. Clouds are many
  and each its own shape, cumulus heaped of round lobes like a
  cauliflower that fold softly into one another, round puffs and long
  flat banks along the horizon, white where the light finds them and a
  pale sky-blue in their shade, flat and soft at the base, never a row of
  one cut-out nor a stack of separate balls; seen from high above they
  float below as round cauliflower tops with their shadows on the sea.
  The sky and its clouds, the glow round the sun and the colour the
  distance fades to are the same wherever the camera stands: seen up
  through the trees or out of the jungle, the plain blue of the film's
  open skies with its white clouds (`jungle 5`), never paled, glowing or
  emptied of clouds because the camera is under the crowns.
  Built things show their flat faces: each side of a plank, a post or a box
  takes its own light, never blended into the next, while logs, lanterns
  and thatch stay round. Stone splits into slabs or beds, each its own shade, stained
  and streaked, with dark cracks between and moss in cushions lit along
  their tops; low down in the jungle's damp it is filmed green in broad
  patches. Trees' heads are heaped of rounded leafy lobes like a
  cauliflower's, on tall pale olive-tan trunks forking into limbs, never
  one smooth dome; palms fringe the jungle where it meets the beaches and
  the village. The jungle's domes are caps of greenery on blocks of pale
  stone that show clear below them, never a ball of trees on its own.
  Thatch lies in rows of straw, each row's ragged edge a dark line over the
  one below. Leaves gather in round puffs overlapping like
  scales, yellow-green toward the sun and blue-green away from it, the
  crown's edge broken into puffs. Bark is furrowed, patched with pale
  lichen and lit warm orange on the sun's side. The sea is a deep teal
  seen across it from the shore, paling into a hazy blue toward the
  horizon; seen from above, a rich turquoise over the lagoon's sand (never
  a washed-out mint), pale and clear only in its shallowest water at the
  sand's edge, azure where it deepens. Seen across
  it, the sky catches in its ripples in broken flat patches, long nearby
  and finer toward the horizon; the sun glitters on it in small flecks, a
  few anywhere and thick along its path; seen from above, the sun is
  netted in fine bright lines on the sand under the shallows. It is darker
  where the pier, a boat or a cliff shades it, and whoever wades in it has
  foam round their legs and broken rings spreading from them, each staying
  where it was made as they walk on and turn, never following them. Whoever stands
  in it or by it, the pier and the ferry show in it faintly, as real water
  shows them: broken by the ripples into drifting strokes, most where the
  water is seen across, much of the water's colour in them. Never a flat
  colour, never a crisp mirror. Only your own head, as you lean over the
  water out of your own eyes and look straight down, shows clearly in it,
  just under you, looking back up, as a face bent over calm water does;
  the ripples still wave it a little, and the rest of you is as faint as
  anyone. Never a flat picture of you out on the water. The sea
  cliffs are pale cream sandstone in long beds, tufts of leaves on their
  ledges and creepers hanging over their lip. Grass is clumps, light
  yellow-green patches with sharp blade tips along their tops over a plain
  green, the nearer over the farther; packed earth has long soft sweeps
  of the brush and a few pebbles, darker toward its edges; where grass
  meets earth it breaks over the edge in tufts, never a clean line. Still water mirrors what
  stands round it, darker and greener; falling water is a soft veil of
  streaks, glowing over its lip. Nights are one royal blue, as the film's
  night frames measure it: a deep navy in the shadows (never black, never
  grey), cobalt through the middle, a bright azure where the moon falls
  and a pale blue white in the lights, with little red in any of it, never
  a murky grey, teal or violet layer over the land. Clearings and open sand
  lie pale in the moonlight; the trees and every leaf lie darker than the
  sand and rock round them, a dark green navy (navy in their shade, cobalt
  at most on their lit edges, seen from above as from within the jungle),
  a hint of teal or violet in them. The moon's shadows are soft, as the
  film paints them: what the moon does not reach, under the trees, down
  the gorge and along the paths under its walls, is a clear royal blue
  whose rock, leaves and pebbles are easy to make out, never sunk in navy;
  only the deepest gaps go navy. What is colourful keeps its own colour, only darker and
  bluer, and the cast glow a pale blue white. The moon glows in a wide halo
  in a sky thick with pale cyan stars and rims the very edges of leaves,
  trunks and rocks in cool cyan; torches burn in big licking cartoon
  flames, and they, lanterns and lit windows glow and light what is round
  them warm, out to the dim edges of their pools, firelit faces a warm
  cream. Inside a lit room by night the room keeps its own colours as
  its lamp lights them, as the film's rooms at night: 島二郎's wood a
  golden tan, a hut's walls their sage, never a saturated orange and never
  the night's blue, the cast in it the night's pale blue; seen from
  outside its windows and doorway glow warm. Dusk is a cool steel blue; the golden hour
  floods the jungle with golden light, its haze gold toward the sun and
  thin elsewhere; the evening's haze takes the sky's colours, never a
  green fog.
- **Judged at full resolution.** A big window starts below full
  resolution (three quarters on a 1920 x 1200 screen) and the game draws
  finer or coarser as the frame rate allows. The pen and the HUD keep their
  size on screen, but the brushwork and the soft blur of what is nearest
  are measured in drawn pixels, so they come out coarser when it draws
  coarser. Judge the look, and take captures to set beside the film, at
  full resolution (in development, `__game.setPixelRatio(1)` first).
- **No light without a source.** Everything lit takes its light from
  something that gives it: the sun or the moon, the sky's light (on what
  faces it, in the air as haze, on the sea), the hour's light on what is
  painted flat (the cast, the pen's lines, the falling water, the
  confetti), the moon's cool rim, and the island's own lights (torches,
  lanterns, lit windows and the lantern light baked into the houses); in
  the forbidden cave, its own (below). Only the sky with its moon, stars
  and clouds, the flames, the lanterns and lit windows, and the cave's lake
  give light of their own. Nothing else has a colour of its own lit in a
  shader (no glow put on for looks, no fixed colour standing in for light),
  nothing is lit by a light that does not reach it, and a shadow or
  anything else laid over the ground only takes light away: its colour is
  the light where it lies (the cast's shadows, the clouds' shadows on the
  sea), never a fixed colour that comes out lighter than dark ground. A
  glint is its light's: the sun's on the water is the hour's light there,
  white by day, golden in the golden hour. In development
  `__dev.islandDark()` puts out every source the island has and finds
  nothing still lit in its views by night and by day, and
  `__dev.caveDark()` does the same in the cave; run both after any change
  to how anything is drawn or lit.
- **What an opening shows is there from any way off.** Whatever is drawn
  only near (the forbidden cave's inside, the houses' rooms) is drawn
  whenever an opening into it can be seen, or stands behind something that
  hides it from there (a window's pane, which turns opaque beyond the rooms'
  reach): never a hole through the rock or the ground onto what lies
  beyond, as the cave's mouth and skylight once showed from afar. In
  development `__dev.seeThrough()` looks into every such opening from
  beyond where its inside stops being drawn and fails on any hole; run it
  after any change to what is drawn only near, or how near.
- **Everyone is a round blob.** Head and body are one soft shape, wider at
  the head, with tiny stub arms and almost invisible feet. Heights are close
  to one head tall. This is a gift for procedural modelling.

## 2. Shared costume: the island outfit

On the island almost every character wears the same two items. In the
game they are one asset per wearer, fitted to that character and kept
separate from the character model (see `art/blender/outfits.py`).

- **Flower crown.** A tight garland of small clovers with three round,
  knobbed petals, alternating Y and upside-down Y, each outlined in brown.
  It sits at the top of the head, just under the ears. Hachiware's sits on
  his cap, and Usagi's is a small cluster at the base of her ears. The film
  draws every flower face-on, even at the edges of the head, and the
  garland dips toward the sides from whichever angle it is seen. Each crown
  alternates two tints of one colour. The plush toys add a tiny pearl to
  each flower; the film does not.
- **Grass skirt.** Light green (#C6EE86), short: tied just below the hands
  and hanging to the ground, about as wide as the lower body. Brown
  fringe strokes drawn with the pen, with rounded ends, start a little
  above the hem and rise about halfway. There is no line along the hem: the grass simply ends, and
  the side outlines taper off just above it. The characters' arms rest on
  top of the skirt, never inside it.

On arrival day (pier scene) the trio wear their normal look: no crown, no
skirt, Chiikawa with a pink bear pouch, weapons strapped on. That could be a
"first day" outfit, but the island outfit is the default.

## 3. Character sheets

Scale unit: **1 = Chiikawa's height.**

In the game Chiikawa is 0.91 m tall and the villagers about a metre, their
eyes about 0.6 m up, and what is made for them is their size, not a
person's: a villager's kitchen counter about half as high as they are, a
stall's counter at their chest, a stool's seat about a third. 島二郎's shop
is his size, a big man's, so its door, stove, table and chair stand over
the cast, as the film's do. The understory's small plants come up to about
a villager's height, the big-leaved ones over them.

| Character | Height | Body | Head features | Crown | Notes |
|---|---|---|---|---|---|
| **Chiikawa** | 1.0 | Warm white #FBF7EE | Two small round ears on top | Pink #F9DCE1 / #FFF1F3 | Most expressive face; often teary or anxious. |
| **Hachiware** | 1.0 | Warm white | Blue cap shape over top of head #5E8FC4 with two pointed cat ears; split down the forehead. Its edge sits about 0.4 head radii above the eyes, well clear of the brows | Pale aqua #D3F2EE / #EAFBF7 | Small blue tail tuft at the back. |
| **Usagi** | 1.15 | Pale yellow #F8E4B4 | Two tall upright ears, pink inside #F3A9B8; two arched brow lines on forehead | Yellow #FBF5A8 / #FFFBD2, small, at ear base | Often carries a torch or food. Energetic, mid-jump poses. |
| **Rakko-sensei** | 1.1 | Cream #F1E3C4, short fur ticks around the edge instead of a line, as the film draws him | Tiny dark brown ears #3E2A23 low on the head's sides (much smaller than Chiikawa's), dark brown paws and feet, tan 4-point star scar on forehead over his right eye (the user's painting, a face layer) | None: never the island outfit (white crown), which is his only from the Test panel | Calm half-lidded eyes. Always in his own clothes (the user, 2026-10-22): a white cape #DDE2DE wrapped round his neck in a flat band and hanging down his back, and his sword after the user's drawing of it (a broad grey faceted blade, modelled a cool #C6D0E6 so that it shows grey under the game's warm sun, white guard, banded white grip and pommel), which he carries slantwise on his back, its hilt over his right shoulder, and only now and then holds up in his right paw. Plays a small ukulele at the bonfire (a plain one until there is a frame of the film's). Chiikawa's model with only these differences, after the official plush (`[3d model] rakko`) and `[anime] rakko 1`: converted by `art/blender/import_characters.py`; the cape by `outfits.py`, the sword and ukulele by `build_props.py`. |
| **Momonga** | 1.0 | White, fluffy cheek tufts | Round ears with pale blue insides, small blue nose dot | Lavender #D4CEF4 / #E9E5FB | Huge fluffy pale-blue tail #BDE7EA behind. Sly, cute-acting. |
| **Kurimanju** | 1.0 | Peach #F6D8B8 | Brown chestnut cap #7A4B2E covering top of head, its edge lowest in front and behind and rising to the sides; tiny round ears low on the head's sides | Pale green #CDEBB0 | Holds a drink, relaxed. Few expressions: the extreme ones (sobbing, shocked, angry) are his special face, mouth wide open; no brows but when serious (the user, 2026-10-22). Chiikawa's model with only these differences (the user, 2026-10-22), after the official plush (`[3d model] kurimanju`): converted by `art/blender/import_characters.py`, the cap drawn there as a mask. |
| **Shisa** | 1.0 | Cream #F7EDCB | A mane of petals #F4AD82 (soft salmon orange), three a side down the head from under the ears, each the shape the user drew (a domed top, a little hooked tip, a full curve back), its straight edge along the head's outline so that the head's line runs over it, the upper over the lower, flat as felt, each outlined; ears the same petal only longer, cream, standing on the head's top corners; the drawing's little curl in each, in the pen (a short stroke out from the head's line in a petal, an arch in an ear), on their fronts only; thick orange brows (the face's to paint); a little tail tuft in the mane's colour | Peach #F6B99A | Cheerful. She is Hachiware's model with only these differences (2026-10-22), after the official plush (`[3d model] shisa`), the official drawing and the user's petal drawing. Converted by `art/blender/import_characters.py`, which builds the mane and ears (`PETAL_OUTLINE`). |
| **Furuhonya** (crab; she) | 1.0 | Pale pink #FBE5E1 | Two coral-pink claws #F2B0B3, each about a third of the head's width, standing up from the head's upper sides where the ears would be, shaped as the user drew them: round as a lily pad, a notch for the pincer's gap at the top on the outer side, a wide foot; two tiny dark antennae on top between them, thin as pen strokes; a soft coral-pink cap #F2B0B3 over the top of the head, its edge half a head radius over the eyes in front and a little lower at the sides, with no line along it; no ears, no tail | White with pale blue #DDEFF5, on the cap's edge | Present at the beach at night. Chiikawa's model with only these differences (the user, 2026-10-22), after the official plush (`[3d model] furuhonya`) and the user's close picture of her face: converted by `art/blender/import_characters.py`, the cap drawn there as a mask. |
| **Islanders** (incl. Hitoha, Futaba) | 1.1 | Grey-mauve #988584 (sampled from the film) | Leaf sprout on top of head (same grey, dark vein lines). No eyes, brows or mouth: only cheek marks, four bold hatch strokes a side | Grey crown of the same flowers in daily scenes | Shaped like Chiikawa: a round head on a fringed grass skirt of the same grey, stub arms at the waist. About 2.5 head radii tall, like the official plush. **Hitoha has one leaf, Futaba has two, and they are the only islanders with leaves.** Generic islanders vary: some have rabbit-like ears, cat ears, round ears or a small spike instead. |
| **Small mermaids** | 0.7 | White round head, the Siren's (Chiikawa's) | Rust-red patch #C8462E over the top of the head, rounding down to just above the eyes in front and a little higher behind, with two tiny black antennae on it; startled "O" mouth; small dot eyes; no whiskers | None | Two, exactly alike, the Siren's own shape made smaller (the user, 2026-10-22): her fin-hands with two lines on each, pink waist band #F5B3BE, rust scaled tail #C2553E curling to a heart-shaped fin. 0.7 times Chiikawa to the tips of their antennae, as `cave interior 7` and `8` measure them beside the cast. In the film they sit before the Siren on the ledge (`cave interior 7`, `8`) and ride on her head (`[anime] siren 1`). Their shape follows the user's own drawings of them from the front, the back and the side, and the official plush. Modelled by `art/blender/build_mermaid.py`. |
| **Siren** | 3.6 | White #FFFFFF | Black hair cap with a widow's peak down the forehead #141214; two black fluffy bun-ears with red fan inserts #C8361F; whiskers; big round eyes, red irises when angry | None | White body, broad white fin-hands, pink waist band, coral scaled fish tail #C8584A. Looks cute when calm, menacing when angry: red eyes, open toothy mouth. 3.6 times Chiikawa to the tops of her bun-ears (about 3.3 m), as `cave interior 7` and `8` both measure her beside the cast on the ledge. Her shape is the user's own drawings of her from the front, the back and the side: Chiikawa's round head (the cast's own), her eyes 1.95 head radii over her base, a short white torso under it running on into the tail in one smooth shape (her tail is part of her, never a second layer she wears), the band flush round her waist, a round bowl of tail leaning back into its curl, simple round fin-hands spread out and down with two lines on each, and her tail curling under her and up behind to a heart-shaped fin. Modelled by `art/blender/build_siren.py`. |
| **Big mustached man** | ~2.0 | Peach/orange, human-like large body | Mustache, lightning-bolt scar, small topknot | None | Wears a dark loincloth printed 味自慢 ("proud of our flavour"). Sits at the night feast toasting. Very likely the island's food-shop owner (島二郎); I'll confirm before naming him in game. |

### Faces (all cute characters)

- Eyes: vertical black ovals with one white highlight. Half-lidded or
  arc-closed when happy or sleepy.
- Cheeks: pink oval blush #F4A6A6 with three or four short dark hatch
  lines. Islanders have the hatch lines without the pink.
- Mouth: a tiny "ω" cat mouth, or a small open mouth with pink tongue.
- These live on a face texture atlas, swapped per expression.

## 4. The island

### From above (`mermaid island 1`)

- **Shape:** a rounded, slightly wide island, sandy ring all around. Flat,
  as the film's later frames show it: the jungle, the village and the
  festival lie low, a metre or two over the sea, and only the karst stands
  up out of it. (The island has grown north and west since this shot, for
  the places those frames show.)
- **Karst pillars:** seven tall pale grey-white limestone towers #C9D6D9
  standing in a ring round the island's middle, jungle on their tops and
  white rock standing out of it: rounded knobs on the flat-topped ones,
  spikes on the two tallest. Many more short, wide pillars hide in the
  forest, mesas thick with trees on top with only a sliver of rock showing;
  one carries a great dome of trees. These are the island's signature
  silhouette.
- **Interior:** dense rounded tree canopy, darker in the north-west. In the
  middle of the ring of pillars, round turquoise water shows through the
  trees: the pool of the jungle waterfall (`waterfall`), deep in the
  jungle.
- **South coast:** the main beach, the festival's colourful stalls right
  behind it, a short wooden pier pointing out to sea and the duck ferry at
  anchor out in the bay. Farm plots just west of the festival. Low layered
  rocks behind the night beach at the east end.
- **Sea:** brilliant turquoise near the island #2FD1B8, deepening to blue.
  Small rock spires stick out of the water around the edges, especially to
  the east and west.

### Village (`islanders 1`, `siren 2`, `chiikawa 3`, `chiikawa 7`, `villager hut exterior 1`, `2`)

- Huts raised on short wooden posts under **beehives of golden straw**,
  centred over the walls and about twice as high over the eaves as the
  walls are tall, rounding over to a neck tied round with a few turns of
  rope, a knot of straw gathered in bunches above the tie. Straw, not a
  turned shape: the outline swells and dips a little, short dark strokes
  of straw are scattered over it, the straw's ends hang ragged below the
  rim. Their walls are timber frames of thick round log posts and round
  log rails (along the foot, under the windows, along the top), every
  panel shingled with overlapping round scales: greens (light green, sage,
  olive, yellow-green) with now and then an orange one, or warm colours,
  teal, orange and red. Tall windows in heavy board frames with deep
  sills, green panes with two thin bars and a double white zigzag, their
  sills at a villager's eyes (`villager hut exterior 2`), so the band of
  scales under them is short and the villagers see out of them. Porches
  of wide planks on a thick log edge with no railing, chunky log steps,
  and potted plants on the porch: a gnarled succulent in a terracotta pot,
  purple thistles in a round clay pot. A villager's hut has one door of
  brown planks, the brown of its posts, with dark marks of their grain and
  a dark C-shaped handle,
  no window in it, opening outward (to the left, as one looks out).
- Round beehive thatched huts with a topknot also appear.
- Inside a villager's hut (`villager hut interior 1` to `10`, the top view
  `6` for where things stand, the door at the front): teal walls patterned
  in big round scales, framed by grey-brown logs along their feet, at the
  windows' sills and along their tops, posts in the corners braced by
  curved branches; plank shutters at the windows (swung back flat against
  the wall in the game, so the windows stay clear); light planks
  underfoot; overhead the straw's dark underside rising to a peak on
  rafters radiating from a hub, battens across them, a lantern hanging
  from the hub. Furnished as the film's: along the back wall from the left
  a cream kitchen counter (two drawers at its end beside a pale post, then
  a pair of wide doors, dark knobs where they meet, a white wavy line
  strung with dots near their tops and white clouds along their feet), a
  round iron stove at its end, a grey sink with a curved tap, a cutting
  board and fruit, and a rail of black pans, a cloth and wooden spoons
  over it, then a tree-stump stool by the head of a low dark-wood single
  bed running along the right wall to the room's middle (a thick pale blue
  mattress and a long white pillow, no quilt); a little table of fruit in
  the front right corner; in the middle of the left wall a tall orange
  bookshelf tapering as it rises, white pegs down its sides, on round
  feet, and toward the door a potted monstera on a little table and two
  brown woven vases; before the door a round cream rug patterned in blue
  round a white flower, two domed straw cushions on it. The furniture is
  the villagers' size: the counter's top about half as high as they are,
  the stool's seat about a third, the bed about one and a half villagers
  long, the bookshelf a little taller than they are; the rug and its
  cushions, the doors and the windows are as wide as the film's.
- The plank huts, on the ground under wide thatched hip roofs, are
  villagers' huts too: inside, the same room as the stilt huts', laid out
  the same way, and the same one plank door, opening outward onto a
  landing of planks.
- The watchtower stage in the middle: squared timber legs splaying out to
  the ground, each side braced with two tiers of big crossed planks over
  cross beams, an open platform with no railing on a thick rim of two
  boards, posts leaning out from its corners, and a tall conical thatched
  roof about twice as wide as the tower. Tiki torches stand in a row in
  front of it.
- More tiki torches stand about the village and light it by night, each
  its own warm pool with the moon's blue between: two on the plaza's
  edges, one between the lane's northern huts, one in the plank huts'
  yard, one where the path north leaves the plaza and two along the guest
  houses' path. They stand on open sand clear of the plants, and out of
  the film's frames of the lane and the guest house.
- Sandy packed-earth paths with scattered confetti during the festival.
- Festival stalls along the beach front: square, roomy booths, as deep as
  they are wide, a step apart on thin posts under a flat roof, with deep
  coloured header boards for the name (pink crêpe stall, purple, orange)
  across the front and down both sides, each about three times as long as
  it is deep, the hand-lettered sign covering each board's whole face (the
  sides repeat the front's), with a scalloped trim in white, yellow or
  blue along their bottoms and paper lanterns hanging under the front; a
  back wall of upright stripes in warm red-orange shades with a work table
  along it, and a counter at the chest of the cast standing at it, framed
  in pale grey with white menu tags hanging off it. The booth is wide, so
  the counter reads long and low: about four times as wide as it is tall.
  The islander keeping a stall stands on a low floor behind its counter,
  showing over it from the chest up, the board above them.
- Each stall has its own things on its counter and work table, after what
  it sells: a kebab stall's two tall doner spits on the table behind its
  counter with their heaters glowing behind them; a candy-floss stall's
  steel spinning tub, and its bags of floss in bright colours hanging along
  the back; a griddle stall's pancakes on the griddle, squeeze bottles of
  sauce, bottles of water, oil and soy sauce, a box of chopsticks, trays of
  spring onion and red ginger and stacked white foam takeaway boxes. The
  tall things stand to the sides and at the back, so the keeper's face
  shows over the counter. Triangle bunting strung between palms
  and, along the festival street, from tall poles standing between the
  stalls, two strings sagging from each pole to the next.
- The signboards are hand-lettered: chunky, rounded letters filling the
  board, a little uneven, as if brush-painted. They are white or pale with a
  dark brown outline on coloured boards, and coloured on white ones, often
  beside a small picture of what the stall sells (a kebab, an octopus, a
  pineapple). The cloth banners are in wobbly, rounded pink writing, as if
  done with a felt-tip pen.
- A tall welcome arch: two tall poles with gold balls and ribbons carry a
  deep arching wooden board, about five times as long as it is deep, reading
  島へようこそ ("Welcome to the island") in brown hand-writing. It is wreathed
  in big round yellow flowers with green leaves, packed along its top and
  bottom and trailing down the poles. Below it hangs a white cloth banner,
  Welcome to Shima in pink, narrower than the arch and tied to the poles
  by ropes at its corners. The banners across the festival street are
  tied the same way.
- Potted plants, baskets of fruit, logs as benches.

### How the village is laid out (`village 1`, `3` to `7`)

- Houses stand in groups, never in a ring: the islanders' own huts
  together, facing each other in pairs across sandy lanes or side by side
  round a yard; the guest houses together in their own corner.
- The watchtower stage stands at a corner of a sandy clearing, among the
  jungle's flowers with a low fence and a palisade of rough posts by it,
  not in the clearing's middle; the islanders gather before it.

### Guest houses (`guesthouse exterior 1`, `2`, `guesthouse interior 1` to `4`)

- Small log cabins of pale, creamy round logs on short stilts, the logs'
  cut ends paler still round a darker heart, stacked at the corners, under
  steep gable roofs of wooden shingles (orange or tan) lying in rows that
  step down the roof, with a window lying in the slope and pale
  bargeboards along the gable ends, crossing at the top. The door is in
  the front gable end, a plank door with a small diamond window and a long
  handle, up two or three half-log steps (logs split down their length,
  flat face up, their cut ends showing); the gable over it is boarded
  cream or pale green with chevrons and a small four-paned window. The
  orange house's long sides are boarded and painted a grey green.
- Inside: dark brown round logs, their cut ends showing pale down the
  sides of the windows and the doorway; a floor of light planks; the
  roof's dark boards on rafters overhead; big many-paned windows with deep
  sills, full of flowers outside; and a red cloth hammock slung across the
  room from hooks, before the window opposite the door. The film lays
  white futons out on the floor at night; the game's rooms are left empty
  but for the hammock.
- The wood is painted as 島二郎's is, all over the island: grain streaking
  along each log, board and plank, finer lines among them and a few
  lighter ones, knots with the grain swirling round them, nail heads with
  rust under them on the planks, darker long edges and ends; out in the
  weather greyer, paler patches, damp toward its foot and cracks along the
  logs where they dried. Painted wood (the boarded sides, the gables, the
  stalls' stripes and counters, the cream sign boards) has its paint worn
  through to the wood along its edges, at its corners and here and there,
  a dark rim round each bare patch. Bark (the fallen logs, the stage's
  palisade, the branch the sign hangs from) is long ridged plates split by
  dark furrows, moss and pale lichen on it. The logs' sawn ends stay pale
  and ringed, as drawn. Never a flat colour on anything made of wood.
- Lots of greenery right round them: banana plants, flowering bushes
  (pink, purple, red), monstera, ferns, palms over them; a path of packed
  earth past their doors.

### Pier (`chiikawa 8`)

Rough wide planks, round log posts at the edges, sitting right on vivid
green-turquoise water you can see sparkles in. Confetti welcome on arrival.

### The bay (`bay 1` to `bay 5`)

- The bay's sand stands above the sea, level with the pier's deck: along
  its edge a low wall of timber, planks laid on edge behind round log posts
  a couple of metres apart, drops straight into the water. The posts' cut
  tops stand a little proud of the sand, like stumps.
- A row of plain clay pots on the sand behind the wall, either side of the
  pier; palms and the jungle's canopy behind them.
- The festival's stalls and arch stand back from it across open sand.

### Jungle (`chiikawa 2`, `11`, `13`, `15`, `jungle 6`)

- Tall palms with striped trunks, ferns, cycads, big monstera leaves.
- Flower bushes everywhere: purple violets, white jasmine, yellow
  hibiscus, red flowers, birds-of-paradise. A bush is a mound thick with
  oval leaves, light and dark, each with its midrib and veins, overlapping
  down it like shingles, standing out all round its edge and up from its
  crown, so its outline is leafy, never a smooth ball, and its dark heart
  shows only deep between the leaves, from low down or above, painted
  there as leaves further in. Its flowers have five rounded petals round a
  yellow heart, facing every way among the leaves, some in twos and
  threes.
- Soft clover ground cover and bright green grass clearings.
- Paths of trodden earth, a warm ochre a little darker than the sand,
  wandering and wider and narrower as they go, worn paler down the middle
  and darker toward their edges, where the grass creeps in over them in
  tufts; under the trees shaded, never lost (`jungle 6`). Never a strip
  of even width with ruled edges.
- The ground runs right up to the rocks and cliffs: grass and ferns to
  their foot, sand to the rock on the beach, darker and damp close in,
  pale stones fallen from them lying about, more close in and in clusters
  (`parkour stone landmark 3`, `cave entrance 3`), only where the ground is
  level enough to hold them, each round where it lies. Never a ring of pale
  grey or a band of pebbles round them, never a stone drawn out up a steep
  slope; the gorge's riverside bank of pebbles is its own.
- Blue butterflies; bubbles float in one clearing.
- Golden backlight through the canopy in the late afternoon.

### Jungle waterfall (`waterfall`)

- A narrow white waterfall pours from a gap in the top of a wide cliff of
  pale, damp limestone, grey with green in it, many times wider than it is
  tall: upright slabs, mossy ledges, curtains of vines hanging down, ferns
  and moss draped over it, trees along its top.
- It falls into a dark green pool at the cliff's foot, with a soft white
  mist where it lands. Sunlight falls into the clearing from above, onto
  the cliff and the pool; the bank it is seen from lies in the shade of
  dense trees, and the characters standing there are darker for it.
- On the bank: dark earth and moss; monstera leaves and a red ti plant to
  the left, a leaning mossy slab of rock at the water; to the right a big
  tree with buttress roots and hanging aerial roots, bromeliads (pink,
  orange, red) on a mossy rock, ferns, white flowers.

### Sea cliffs (`sea cliffs`)

- Tall cliffs of level-bedded sandstone, cream and tan in bands, split
  into blocks by upright joints, stepping in and out bed by bed. Grass and
  leafy shrubs on top, greenery hanging over the edge in places.
- Leafy clumps sit on the ledges down the face, where a bed juts out past
  the one above: low cushions of leaves in runs along a ledge with bare
  rock between, some spilling over its lip, painted in puffs as the bushes
  on top are, smaller. Never a string of round beads along every ledge.
- They run away along the coast into the distance, their faces catching
  the sun. Turquoise water at their foot, deep blue further out.
- A tall sea stack of the same bedded rock stands off the coast, stepped,
  narrowing and leaning a little, a smaller rock beside it.
- Seen from a grassy headland lower than the cliffs, its edge dropping
  sheer to the sea.

### Beaches at night (`beach 1`, `2`, `3`, `fire by the beach`)

- Navy sky full of stars, a bright full moon with a long reflection streak
  on calm water.
- Dark rocky headland at the east end of the beach, palms leaning over the
  sand.
- Starfish scattered on the sand. Bonfire of crossed logs with a big soft
  cartoon flame casting an orange pool of light.
- Everything is painted in blues: a royal-blue sky, clouds barely lighter
  than it, a deep blue sea, moonlit blue sand and deep blue silhouettes,
  never black; only firelight and lit windows stay warm.

### Night feast (`chiikawa 10`)

Dozens of islanders seated in rows on the sand in warm firelight, plates of
food and cups on the ground, everyone toasting. This is the festival.

### The stepping-stone gorge (`parkour stone landmark 1` to `3`, `river below parkour stone landmark 1`, `2`)

- A wide river of pale, bright blue water between sheer white limestone
  cliffs, grass and shrubs along their tops, greenery spilling over.
- Along every tall cliff's top the bushes grow as the jungle on the rocks'
  tops does: each heaped of rounded leafy lobes, of every size, in clumps
  of a few to a dozen with grass between, some set back from the edge and
  some leaning out over it, an odd big one. Never a row of round balls.
- The gorge's dry head, between the river's end and its mouth onto the
  lowland, is choked by a rockfall: big blocks of its white limestone, split
  flat on their sides and tumbled wall to wall, blocks lying on blocks,
  smaller ones at its foot, moss in patches on some. It stands clear of the
  stepping stones, the river running on to its foot so the water meets the
  rocks. Never a row of upright columns, never a cap of moss on every block.
- Where the river meets the sea its deep blue-green fades into the beach's
  pale shallows over its last stretch, never a line of surf across the
  water between them.
- Across it, tall thin pillars of the same pale rock, cracked and stained,
  each with a flat round top of bright grass, a short jump apart, from one
  clifftop to the other.
- At the foot of a cliff, a narrow riverside path of rounded pebbles of
  every size, the small ones packed between the bigger, mossy in patches
  and darker where the water wets them; boulders worn round and sunk in the
  bank along the water's edge, a few more fallen at the cliff's foot, small
  stones lying about them; the rock's foot pale and damp, ferns and dark
  leafy plants thick along it, vines hanging down its face in strands
  (`river below parkour stone landmark 1`). Never a row of eggs or pillars
  along it, never one even size of pebble. It leads along the water to a
  wooden restaurant, the way up to it walled in by jungle.
- 島二郎, the restaurant (`shimajiro exterior 1`, `2`, `shimajiro interior 1`
  to `3`, the user's `shimajiro sketch front` and `sketch three quarter`): its
  name on a weathered board hung by two cords from a low branch of a big
  tree beside the jungle path to it, the branch reaching out over the path,
  vines with heart-shaped leaves draped along it, hanging from it either side
  of the board and wound round the trunk (the film's frame of the way there,
  the user's). The shop is a tall box of a building clad in
  weathered planks, grey brown, each a little lighter or darker, their grain,
  knots and nail heads painted, between dark square posts that part its front
  into three bays: a low bench with a terracotta pot of purple flowers and a
  gourd of a vase on the left; the plank door with a small square window and
  a thick board over it in the middle, opening outward, standing swung out
  on its black strap hinges; two riveted iron plates over boards
  running up and down on the right. A deep cornice runs round its top; over
  the front a wide board stands up off it, painted a pale cream, worn and
  stained, 島二郎 on it in dark brown, a green enamel lamp on a curved arm
  over it; behind it a gable roof of dark boards, a stovepipe through it.
  Down its left side a lean-to of rusting corrugated tin over stacked blue
  and red beer crates of brown bottles, bottles on the ground and a white
  bucket of sticks, a four-paned window under it. Beside the shop on the
  right, the tall standing sign, cream paint stained with rust, 貝汁 down it,
  nearly as tall as the board's top, on two legs, its own lamp on a pole
  wound with vines. At night both boards glow warm under their lamps, the
  windows and the door's small window lit orange, the night's blue round
  them. The signs' words are the user's own hand-lettering.
- It stands deep in the jungle, which closes in on its back and sides: big
  heart-leaved elephant ears either side of the standing sign and its lamp
  and by the lean-to, banana plants, monstera, ferns, red ti and flowering
  bushes crowding up to its walls, palms and trees overhead. Before it the
  yard of bare trodden earth, tufts of grass along its edges, the path to it
  between low ferns.
- Inside, the film's room: warm golden planks laid across the walls over
  boards running up and down below a dark rail, wide planks underfoot, a
  boarded ceiling on beams; by the door the kitchen, against the side wall
  on the door's right as one looks out: a pale blue stove with three knobs
  and its oven's door to the room, big steel pots and a brass one on it,
  ladles on a rail and pans on a shelf over it on the wall, a brown jar and
  a pale celadon one on the floor between it and the door; across the room a
  simple table under a four-paned window, a chair with a navy cushion and a
  low stool, a glass of water and a bowl on it; the menu's three plaques
  (貝汁, カツカレー, メニュー) beside the window; strings of pale blue shells,
  starfish and beads hanging in the corner; a branch hung on strings; a green
  enamel lamp hanging in the room's middle, lighting it warm and even at
  night. The floor is bare planks (the user, 2026-10-21).

### The forbidden cave's entrance (`cave entrance 1` to `4`, `cave signboard 1` to `3`)

- On a beach on the west coast: a terraced coastal outcrop, a rocky
  hillside of bare stone rising out of the sea at one end in rounded,
  bulging tiers, each stepping up and back from the last, along the back of
  the beach to the jungle's higher ground (the user's sketch of it: low
  steps at the water, climbing to a flat top; level lines across its face
  where it steps, short cracks running down it). Greenery fringes the high
  tiers' tops and hangs over their edges here and there; palms and jungle
  beyond its high end. Nothing to walk on over it.
- At its foot over the sand, close to the sea, a dark arched opening into
  the rock, a few times the cast's height, a vine or two hanging over its
  side. Open sand before it: no trees or plants in the way.
- A few steps out on the sand before it, one thick plank of pale
  weathered wood on one post (a pale cream by day, about #E3E6B2, its grain
  a little darker; blue-grey by moonlight), about as tall as Momonga, 立入禁止!!
  written on it top to bottom in dark brush strokes.

### The forbidden cave (`cave 1`, `cave 2`, `cave 3`, `chiikawa 17`, `cave interior 1` to `8`)

- Entered on foot through its one mouth on the west beach; a boat crosses
  its sea.
- Lit by its own dark, not the night's moonlit blues, as measured on the
  film's frames: walls a near-black navy (about #030F41), floors a dark
  blue a little lighter (the film's sand away from the torch, about
  #020F2E), royal blue (about #0528A0) only where something lights them,
  the rock round the glowing water a little lighter (#0A2260). Light only
  where something gives it: the film's glow on the beach's water, which
  nothing there would give, is left out, and so is its band of mist over
  the lake (flat sheets of mist, seen along the water, read as a slab of
  light); the light in the air is the shaft's rays down the well. Nothing
  in the cave has light of its own but the lake's glow, the torches and the
  fire: the crystals are dark, as the film's, but where light catches them;
  what is made (the boat, a torch's stick, their lines, a rice ball in hand)
  is lit as the cast are where it is; a shadow only darkens. A torch makes a small bright pool of
  pale cream (about #C8C3B9 on the rock), the dark close round it; on the
  water it shows as a column of short golden strokes. The cast glow a pale
  cyan (#9BE3F9), warm on their torch side.
- The passage: a tunnel little bigger than the mouth, its vault rippled
  with flowstone that the torch lights a warm beige, broken stone along its
  walls and pebbles on its floor (`cave interior 1`).
- The cavern's beach: dark blue sand, the rowboat drawn up on it, the water
  beyond glowing blue with sparkles, heavy rounded rock round it (`cave
  interior 2`). The sea on from it is dark (`cave interior 3`).
- Whoever wades in the cave's water has foam round their legs and broken
  rings spreading from them, as in the sea; the boat afloat has foam along
  its sides, a wavering V of wake behind it as it goes, bending after it as
  it turns, and rings trailing it, and an oar's blade a splash and a small
  ring where it goes in and comes out. Every ring stays where it was made.
  They are only as pale as the light that falls on them: bright on the glow
  and in a torch's pool, faint in the dark, never glowing of their own.
- The boat is dry inside: its floor, never the water over it, from in it
  or looking into it. The torch is the cast's size, a short stick held at
  the side with a small flame whose tip reaches the top of the bearer's
  head (Chiikawa stands 0.9 m), never a pole twice their height.
- Its rock is never smooth plaster anywhere: heavy rounded masses up the
  walls of its wide places, flowstone in runs down the passage, rounded
  masses piled up the chamber, darker in their hollows and paler on their
  ridges; in the dark their forms still show, a little more of the
  painted dark's blue along their edges, as the film paints dark rock.
- Dark blue rock walls with cyan rim light on the edges.
- **The heart of the cave:** a round opening in the ceiling, ringed by
  hanging vines, with the full moon directly above. A wide shaft of
  moonlight falls onto still, glowing water. Sparkling particles drift in
  the beam and low mist hugs the water. From above, this opening is a
  round hole like a well's mouth, hidden deep in the jungle on the spur
  over the cave, trees crowding its edge and ferns along it: the jungle
  floor runs right to a worn lip of stone, the sides drop sheer as a
  well's do, then open out below into the dome over the water. The cave is
  a secret place, no path leading to it or to its mouth. The water glows a
  bright cyan-blue (about #38AEFE) in a disc under the opening, fading to a
  deep blue toward its shore, sparkles winking on it, a band of mist low
  over it far off; pale columns of rock stand round its edge (`cave
  interior 4`, `5`). Its walls are never a smooth bowl: the rock hangs in
  folds down them, ridges of every width, some into the water and some
  ending short of it, with broad masses standing out and dark hollows at
  the water's edge, darker in its hollows, paler on its ridges and rimmed
  in cyan where it turns from the eye toward the water; its doorways are
  arches worn by the sea. From the water the sky shows up the well, ringed
  by leaves, its rock dark and layered (`cave interior 6`): no trees over
  it from below, though from above they crowd round it (`cave interior
  5`); the leaves round its edge in the night's navy.
- Past the skylight's chamber, deeper in, a dark chamber of its own: a
  broad ledge of the rock at its back beside the water, big enough for the
  Siren, giant as she is, to rest on by the cast. It is a shelf the sea
  has left, never a stage: lying low, its top just over the water (its lip
  a sixth of the cast's height), cobbled all over with flattish rounded
  stones of every size packed close, its edge wandering into the water,
  its ends narrowing away into the wall. The wall behind it rises in tall rounded lobes of
  the rock, the crystals at its back toward either end, and nothing stands
  on it apart like a prop. A small fire lights it, turning the cobbles a
  warm magenta against the blue, where the Siren and the mermaids sit
  (`cave interior 7`, `8`). In the film the Siren's own glow lights it,
  its walls a brighter indigo. In the game she is no light: the cave's
  own light, the fire and the torch light her as they light the cast. She
  rests on the ledge south of the fire, facing the water, so that seen from
  it she sits to the fire's right and the cast to its left, as in the film.
- Daylight comes in only where it truly can: bright at the mouth's rim,
  gone a few metres in; down the skylight's well a slanting beam and a
  sunlit patch on the water that move with the hour (the moon's, pale, by
  night); nowhere else.

### Arrival ferry (`boat`)

A big white duck ferry, outlined with the pen as the film draws it, after
the film and the user's sketches of it from the front, both sides and
above (the side sketches set its heights and the neck's line, the top one
its outline from above, the front ones its cross-section). Simple and
round all over, with no hard edges and nothing boxy: the body is a bell
in section, widest low down and rounded underneath, and an egg from
above, widest at the cabin's front wall and narrowing round the head at
the bow. At its front a tall, bendy neck, broad where it rises from the
bow, its back curving in to a slim waist and out into a head that is
round from above, a small dot eye on each side and a long, flat yellow
bill. Behind the neck an open-air deck with no roof, where the passengers
sit, a railing across its front from the neck and along its open sides.
Behind the deck the cabin: its rounded front wall faces the deck, inked
round its arch and along its foot, with a door at the bottom in the
middle and a small window high up to the right as you face it, just
showing past the neck from in front. Its round roof curves down to a
little flat tail at the waterline. Paned windows of pale blue glass lie
on the cabin's curved sides like paint. A door in the hull's left side
under the deck, none on the right. White with the sea's blue in its
shading toward the water. At anchor out in the bay.

## 5. Palette

| Use | Day | Night |
|---|---|---|
| Sky | #6EC6F0 → #CFEFFF, white puffy clouds | #0F2350 → #1E3A7A, stars |
| Sea, shallow | #2FD1B8 | #1B3C6E with moon streak #E8F1FF |
| Sea, deep | #1AA6C9 → #0B3D7A | #050B1E |
| Sand | #EBC48F | #2D53CD (moonlit, `cave entrance 1`) |
| Foliage | #3FA34D, #8FD16A, #1F6B3A | #08204C, a dark green navy, its lit edges #11387A (`cave interior 5`) |
| Karst rock | #C9D6D9 | on the night's blue, as the foliage |
| Thatch / wood | #C9A46A / #8A5A3B | — |
| Fire light | — | #FFB347 core #FFE58A |
| Moon | — | #F5F1C9 |
| Character outline | #5A3A2E | same |

## 6. Gaps I still have

Nothing here blocks Milestone 0. These would sharpen later milestones.

- A clear look at the food-shop building and its owner.
- What sits at the top of the karst pillars, if the film ever goes there.

Where reference is missing, I will invent in the same style and flag it.

## 7. Online reference: expressions and poses

**Chiikawa Comic Studio**, https://nankachiisakutekawaiiyatsu.comic.studio/
A fan-run comic maker. Most of its sprites are cut from the official LINE
stickers and official illustrations, so they are Nagano's own drawings.
I browse it in the built-in browser while building faces and actions;
nothing is downloaded.

| Character | Sprites, approx. |
|---|---|
| Chiikawa | 135 |
| Hachiware | 120 |
| Usagi | 75 |
| Rakko | 12 |
| Shisa | 6 |

Momonga, Kani (Furuhonya) and Kurimanju also have sets, not counted.

- **Use it for** the face-part library: eye shapes, brows, mouths, tears,
  sweat drops and symbols. Also for action poses such as bowing, cheering,
  lying in bed, peeking round a corner, trembling, rolling and Usagi's
  upside-down ヤハ, and for how ears and bodies squash in motion.
- **Not covered:** the Siren, the mermaids, the islanders and the food-shop
  owner, even with the site's spoiler switch on. The plush photos and film
  frames stay the reference for those, and for all 3D proportions.
- Sprites are small thumbnails: good for shapes, not fine detail.
- A few sprites may be fan edits. When one looks off-model, trust the film
  frames.
- Reference only. No image from the site goes into the game or the repo.
