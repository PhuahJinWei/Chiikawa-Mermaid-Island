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
  See `src/world/Ink.ts`.
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
  seen across it from the shore, bright turquoise over the lagoon's sand
  seen from above, paling into a hazy blue toward the horizon. The sea
  cliffs are pale cream sandstone in long beds, tufts of leaves on their
  ledges and creepers hanging over their lip. Grass is clumps, light
  yellow-green patches with sharp blade tips along their tops over a plain
  green, the nearer over the farther; packed earth has long soft sweeps
  of the brush and a few pebbles, darker toward its edges; where grass
  meets earth it breaks over the edge in tufts, never a clean line. Still water mirrors what
  stands round it, darker and greener; falling water is a soft veil of
  streaks, glowing over its lip. Nights are moonlit royal blue, the land
  darker than the sky, clearings pale in the moonlight, each thing
  keeping its own colour, only darker and bluer, the moon glowing in a
  wide halo in a sky thick with pale cyan stars and rimming the very
  edges of leaves, trunks and rocks in cool cyan, the jungle violet navy,
  teal and violet; torches burn in big licking cartoon flames, and they,
  lanterns and lit windows glow and light what is round them warm,
  firelit faces a warm cream. Dusk is a cool steel blue; the golden hour
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

| Character | Height | Body | Head features | Crown | Notes |
|---|---|---|---|---|---|
| **Chiikawa** | 1.0 | Warm white #FBF7EE | Two small round ears on top | Pink #F9DCE1 / #FFF1F3 | Most expressive face; often teary or anxious. |
| **Hachiware** | 1.0 | Warm white | Blue cap shape over top of head #5E8FC4 with two pointed cat ears; split down the forehead. Its edge sits about 0.4 head radii above the eyes, well clear of the brows | Pale aqua #D3F2EE / #EAFBF7 | Small blue tail tuft at the back. |
| **Usagi** | 1.15 | Pale yellow #F8E4B4 | Two tall upright ears, pink inside #F3A9B8; two arched brow lines on forehead | Yellow #FBF5A8 / #FFFBD2, small, at ear base | Often carries a torch or food. Energetic, mid-jump poses. |
| **Rakko-sensei** | 1.1 | Cream #F1E3C4, short fur ticks around the edge | Small dark brown ears #3E2A23, dark brown paws, tan 4-point star scar on forehead #C9A46A | White | Calm half-lidded eyes. Carries a sword and wears a cape when not in island outfit. Plays a small ukulele at the bonfire. |
| **Momonga** | 1.0 | White, fluffy cheek tufts | Round ears with pale blue insides, small blue nose dot | Lavender #D4CEF4 / #E9E5FB | Huge fluffy pale-blue tail #BDE7EA behind. Sly, cute-acting. |
| **Kurimanju** | 1.0 | Peach #F6D8B8 | Brown chestnut cap #7A4B2E covering top of head, tiny round ears | Pale green #CDEBB0 | Holds a drink, relaxed. |
| **Shisa** | 1.0 | Cream #F7EDCB | Cat-like ears, orange flame-shaped mane on both sides #F2A65A, thick orange brows | Peach #F6B99A | Cheerful. |
| **Furuhonya** (crab) | 1.0 | Soft pink #F6CFCF | Coral crab claws on top of head #F28B8B, two tiny antennae, pink cap | White with pale blue | Present at the beach at night. |
| **Islanders** (incl. Hitoha, Futaba) | 1.1 | Grey-mauve #988584 (sampled from the film) | Leaf sprout on top of head (same grey, dark vein lines). No eyes, brows or mouth: only cheek marks, four bold hatch strokes a side | Grey crown of the same flowers in daily scenes | Shaped like Chiikawa: a round head on a fringed grass skirt of the same grey, stub arms at the waist. About 2.5 head radii tall, like the official plush. **Hitoha has one leaf, Futaba has two, and they are the only islanders with leaves.** Generic islanders vary: some have rabbit-like ears, cat ears, round ears or a small spike instead. |
| **Small mermaids** | 0.6 | White round head #FFFFFF | Rust-red cap patch on top #C8462E with two tiny black antennae; startled "O" mouth; small dot eyes | None | White fin-hands with three lines, pink waist band #F5B3BE, rust scaled tail #C2553E with a curled fin. There are at least two; they ride on the Siren's head. |
| **Siren** | ~2.5 | White #FFFFFF | Black hair cap with a widow's peak down the forehead #141214; two black fluffy bun-ears with red fan inserts #C8361F; whiskers; big round eyes, red irises when angry | None | White body, broad white fin-hands, pink waist band, coral scaled fish tail #C8584A. Looks cute when calm, menacing when angry: red eyes, open toothy mouth. |
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

### Village (`islanders 1`, `siren 2`, `chiikawa 3`, `chiikawa 7`)

- Huts raised on short wooden posts, **large mushroom-shaped thatched
  roofs** in straw brown. Their walls are timber frames of thick round
  log posts and round log rails (along the foot, under the windows, along
  the top), every panel shingled with overlapping round scales: greens
  (light green, sage, olive, yellow-green) with now and then an orange
  one, or warm colours, teal, orange and red. Tall windows in heavy board
  frames with deep sills, green panes with two thin bars and a double
  white zigzag. Porches of wide planks on a thick log edge with no
  railing, chunky log steps, plank doors with dark C-shaped handles, and
  potted plants on the porch: a gnarled succulent in a terracotta pot,
  purple thistles in a round clay pot.
- Round beehive thatched huts with a topknot also appear.
- Inside the huts (the film shows none; the game's own): a roomy log-cabin
  room furnished in the village's own materials, wood, woven straw and
  rattan, clay, stone and bamboo, nothing modern. A log bed with knobbed
  posts, a woven rattan headboard and a spindled footboard, a thick futon
  under a patchwork quilt; a plank bookshelf of
  books and scrolls; a kitchen of a clay stove and pot, a counter with a
  stone basin fed by a bamboo pipe, bowls on a shelf and a clay water jar;
  a low round table with cushions on a woven rug; a paper lantern.
- The watchtower stage in the middle: squared timber legs splaying out to
  the ground, each side braced with two tiers of big crossed planks over
  cross beams, an open platform with no railing on a thick rim of two
  boards, posts leaning out from its corners, and a tall conical thatched
  roof about twice as wide as the tower. Tiki torches stand in a row in
  front of it.
- Sandy packed-earth paths with scattered confetti during the festival.
- Festival stalls along the beach front: square, roomy booths, as deep as
  they are wide, a step apart on thin posts under a flat roof, with deep
  coloured header boards for the name (pink crêpe stall, purple, orange)
  across the front and down both sides, each about three times as long as
  it is deep, the hand-lettered sign covering each board's whole face (the
  sides repeat the front's), with a scalloped trim in white, yellow or
  blue along their bottoms and paper lanterns hanging under the front; a
  back wall of upright stripes in warm red-orange shades with a work table
  along it, and a counter as tall as the cast, framed in pale grey with
  white menu tags hanging off it. The booth is wide, so the tall counter
  reads long and low: about two and a half times as wide as the counter is
  tall. The islander keeping a stall stands on a raised floor behind its
  counter, their head showing over it, the board above them.
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

- Small log cabins of pale round logs on short stilts, the logs' cut ends
  stacked at the corners, under steep gable roofs of wooden shingles
  (orange or tan) with a window lying in the slope. The door is in the
  front gable end, a plank door with a small diamond window and a long
  handle, up two or three half-log steps; the gable over it is boarded
  cream or pale green with chevrons and a small four-paned window.
- Inside: bare log walls, a plank floor, big many-paned windows full of
  flowers outside, and a red cloth hammock slung across the room from
  hooks, before the window opposite the door. The film lays white futons
  out on the floor at night; the game's rooms are left empty but for the
  hammock.
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

### Jungle (`chiikawa 2`, `11`, `13`, `15`)

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
  rounded shrubs on top, greenery hanging over the edge in places.
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
  than it, a deep blue sea, blue-grey sand and deep blue silhouettes,
  never black; only firelight and lit windows stay warm.

### Night feast (`chiikawa 10`)

Dozens of islanders seated in rows on the sand in warm firelight, plates of
food and cups on the ground, everyone toasting. This is the festival.

### The stepping-stone gorge (`parkour stone landmark 1` to `3`, `river below parkour stone landmark 1`, `2`)

- A wide river of pale, bright blue water between sheer white limestone
  cliffs, grass and shrubs along their tops, greenery spilling over.
- Across it, tall thin pillars of the same pale rock, cracked and stained,
  each with a flat round top of bright grass, a short jump apart, from one
  clifftop to the other.
- At the foot of a cliff, a narrow riverside path of rounded pebbles and
  boulders, ferns and dark leafy plants at the rock, vines hanging down it,
  leading along the water to a wooden restaurant.
- 島二郎, the restaurant: a ramen shop, its name on a weathered board hung
  by two ropes from a rough crossbar over the jungle path to it, vines
  with heart-shaped leaves wound round its posts and hanging from the bar.
  Built as the village builds (log posts, plank walls, thatch), open at the
  front under a navy curtain between red paper lanterns, a counter with
  stools, bowls of ramen heaped with bean sprouts.

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
- Before it on the sand, a weathered grey board on one post, 立入禁止!!
  written on it top to bottom in dark brush strokes.

### The forbidden cave (`cave 1`, `cave 2`, `cave 3`, `chiikawa 17`)

- Entered on foot through its one mouth on the west beach; a boat crosses
  its sea.
- Dark blue rock walls with cyan rim light on the edges.
- **The heart of the cave:** a round opening in the ceiling, ringed by
  hanging vines, with the full moon directly above. A wide shaft of
  moonlight falls onto still, glowing water. Sparkling particles drift in
  the beam and low mist hugs the water. From above, this opening is a
  round hole like a well's mouth, hidden deep in the jungle on the spur
  over the cave, trees crowding its edge and ferns along it: the jungle
  floor runs right to a worn lip of stone, the sides drop sheer as a
  well's do, then open out below into the dome over the water. The cave is
  a secret place, no path leading to it or to its mouth.
- A flat stone ledge beside the water, lit by a small fire, where the Siren
  and the mermaids sit.

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
| Sand | #EBC48F | #3A3F66 |
| Foliage | #3FA34D, #8FD16A, #1F6B3A | #1A2B3A |
| Karst rock | #C9D6D9 | #3B4A66 |
| Thatch / wood | #C9A46A / #8A5A3B | — |
| Fire light | — | #FFB347 core #FFE58A |
| Moon | — | #F5F1C9 |
| Character outline | #5A3A2E | same |

## 6. Gaps I still have

Nothing here blocks Milestone 0. These would sharpen later milestones.

- The forbidden cave's inside between its mouth and the moonlit chamber
  under its skylight, and the ground beyond it (`cave interior 1` to `8`
  show it: a passage on foot, the cave's sea crossed by boat, the round
  chamber, landed ground).
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
