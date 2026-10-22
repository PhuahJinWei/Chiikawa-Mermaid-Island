# Changelog

## M1 — Island (in progress, branch `m1-island`)

Checked in the browser from the pier, the festival street, the village and
inside a hut, the jungle, the fields, the waterfall's bank, the night beach
and the foot of a pillar, from high above, side by side with the film's
aerial shot from the camera the island was laid out with, and at dawn,
noon, dusk and night; walked up a hut's stairs into its room and up the
stage, and along every path. Not yet checked on a real phone.

**Added**

- Life on the island (the user, 2026-10-22: we are one of many on it, not
  its middle), in `src/life/`. Everyone who lives here goes about a day
  planned each morning: asleep from midnight to six (the islanders in the
  villagers' houses, two to a house, you among them; Chiikawa, Hachiware and
  Usagi in one guest house, Shisa with Kurimanju, Momonga with Furuhonya,
  Rakko alone), out to the places they like and their habits at set hours,
  meals at the festival's stalls, five of which islanders keep open each day
  while others line up before them, the night beach's feast round its new
  bonfire from dusk, home before midnight. They find their way on a
  half-metre grid of the island built as needed, give way to one another,
  give way slowly to you when you keep pushing into them, look at one
  another as at you, chat, hop or wave back when you hop. Far off they are
  moved without being drawn. The Siren swims out to play some afternoons
  with her little mermaids and lurks at sea at night, red-eyed, sinking from
  sight as you come near.
- Twenty-one islanders, each a little different in tint, of five kinds of
  day (the fields, the beaches, the plaza, the paths, the festival's
  street); four more villagers' houses for them (a third pair of stilt huts
  where the lane meets the fields, a plank hut and a beehive hut in the
  yard), and the fields made smaller from their east end to make room (the
  user's). The jungle is planted as before round the village, only what
  would stand in the new houses left out, and they have plants of their own.
- What you do with your paws (`src/core/Play.ts`): pick up what you look at
  (the shells and starfish the sea leaves each morning, the stage's ukulele,
  the torch by your door), hold it in your right paw, which shows at the
  bottom right of the screen out of your own eyes (`HandView`), keep six
  more in your pouch, put it down where you look, give it to whoever you look
  at, eat or drink it a bite at a time, play the ukulele, carry the torch
  (lit at night, it lights the ground and those round you). The stalls hand
  over what they sell; the islanders carry it off and eat it. Sit on any
  seat; in your own bed at night, sleep through to the morning. Twenty-nine
  things to hold, built in Blender (`art/blender/build_items.py`), with their
  icons.
- Talking (はなす): whoever you talk with stops and says a line like them,
  for the hour and what they are doing; a first set of lines in
  `locales/ja.json` for the user to look over.
- Everyone who lives here can do what you can (the user, 2026-10-23: the
  same authority as the player).
  - Their paws are yours: a thing in the right paw and a pouch of six
    slots (`src/life/Hands.ts`), taken up, put down, given, eaten, drunk,
    played and kept by the same verbs as yours, under the same rules of
    whose a thing is. What lies about as no one's is whoever takes it up.
    What someone put down is theirs: anyone else borrows it (かりる), and it
    goes back where it lay by the next morning, or is handed back to its
    owner. What is given is its taker's. What has a place of its own (the
    stage's ukulele, the torch by your door) goes back there each morning.
  - The pouch stacks (the user, 2026-10-23): each slot holds up to 99
    things of one kind, its count on its corner, each thing keeping whose
    it is. A slot tapped (or 1 to 6) takes what is in your paw onto its
    own stack, else into the pouch, and gives one of the slot's into your
    paw; what you pick up goes onto its stack first.
  - What has been bitten into goes into no pouch (the user): put away, it
    is gone, eaten up. Nor can it be put down or given: the action button
    says たべきる (のみきる) and finishes it. The same for everyone.
  - A stall hands over nothing to you with no room for it in your paws:
    its keeper says 「ごめんね、手がいっぱいみたい…」 and you step out of the
    line, to come back once you have made room.
- What you look at is shown (the user, 2026-10-23: what the button would
  act on, and where おく would put a thing, felt random), `src/core/Focus.ts`:
  a small cream ▽ with the pen's line, drawn as the marks over heads are,
  floats over the thing, person or seat you look at, bobbing, and glides to
  the next one you look at rather than popping; holding something, where
  it would be put down shows a ghost of it, as it would lie, the ▽ over
  that: see-through, pale, its rim glowing softly, breathing a little,
  drawn as one sheet (its own far side never showing through), and dimmed
  by the night as everything is. It is marked as the cast are, so the film
  look's paint and depth of field leave it as drawn: as scenery they had
  smeared it into blotches, and a faint pen line round it showed through
  its own creases as dark streaks (the user: "looks like it is glitching"). (An orange halo round the thing's own
  line was tried first and dropped the same day: the user, "overkill", a
  thing "suddenly wrapped by an orange thick outline". A mark apart from
  the thing, the same for everything, was the right shape. The preview was
  first a flat paper copy with the pen's full line, which the user found
  looked "like a real thing placed".)
- What you look at is steadier: it is whatever is nearest the middle of
  your view (within 15°, not 22° as before), the nearer of two as near;
  people no longer have a head start over things; and what you looked at
  last frame is kept until it has left the middle (19°) or something else
  is clearly nearer it, so the button no longer flickers as you sway.
  - What they do next out and about is chosen as they go
    (`src/life/Choices.ts`), by what they need (something to eat, company,
    fun, growing with the hours), what they like and what is about them:
    one of their places, eating what they have, playing what they have
    (up on the stage if it is near, those about coming to listen and
    dance), a word with a friend, a keepsake for a friend, a keepsake put
    down in their own room, giving back what they borrowed, a look at
    something lying about, or, rarely (the user: not a common behaviour),
    taking it up: at most once a day each, and not soon after anyone else.
  - They choose by what a thing is for and whose it is, never by its name:
    whatever lies about is part of their choosing as soon as it lies there.
  - Gifts are kept: what you give them that is not eaten goes into their
    pouch, where it was let go of before.
  - They grow fond of you (hearts in your notebook) for gifts (more for
    what they like), for words, for answering what you do, for being
    served at your stall, a little less for being pushed. They remember
    what you gave them and speak of it. Fond of you, they come over to
    greet you once a day, now and then with a keepsake for you; hungry,
    they come to ask for what you have to eat.
- And you can do what they do: behind the counter of a stall no one keeps
  today you keep it (みせばん), and whoever comes to eat may line up at it
  for you to hand them its goods (わたす), till you walk off. Playing the
  ukulele, those about come to listen and dance.
- What lies about comes from `public/data/things.json` (the user,
  2026-10-23: to add and scatter things across the island with nothing else
  to change): things with places of their own, and what each morning lays
  about an area. A new kind of thing from the build
  (`art/blender/build_items.py`) is taken in at load as a keepsake if
  `src/life/Items.ts` has no entry for it.
- Everyone where you left them (the user, 2026-10-23). The island's clock is
  kept and goes on from the same hour, so a save now keeps where each who
  lives here stands and which way they face, the seat they sit on (a bed, a
  seat in their room, a log, a seat by the feast's fire) and whether they
  are inside their round hut. Loading it, they are back there and take up
  their day from there: sleepers asleep, sitters seated, walkers walking on.
  Anyone whose place cannot be stood on now is put where the hour has them.
- The welcome on a new island (the film's arrival, `bay 5`), on your first
  day (or with `?fresh`): the cast gathered under the welcome arch as the
  game has long had them, which the hour's placing had been undoing at once,
  and the islanders lining the way up the beach from the pier in two rows on
  either side, all turned to you. They wave and cheer, each of the cast with
  a welcome of their own (Chiikawa's ワァ…！, Usagi's ヤハ〜！), cheering you as
  you come past; once you are up the beach, they go off into their day one
  after another.
- Footprints in the sand (the user, 2026-10-23), `src/world/Footprints.ts`:
  everyone walking on sand near you, you among them, leaves a print of each
  foot as it comes down, the size of their foot and turned the way they
  walk, and both feet where they land from a jump. Faint on dry sand,
  clearer and darker on the damp sand by the water; gone in about two
  minutes, forty seconds by the water. Painted into the ground itself from a
  map of the 24 metres round the camera, which costs next to nothing (under
  0.05 ms a frame on the desktop, 2.4 MB on the graphics card). None on
  grass, earth, pebbles, decks, in the water or in the forbidden cave. Once
  there are 300 of others' prints, only those walking nearest you leave more
  (yours always), so the beach is never trodden all over.
- No one held up by anyone for long (the user, 2026-10-23: they push one
  another too, as you push them). Someone standing about steps aside, as
  slowly as their weight lets, when a walker keeps walking into them; of two
  walking into each other face to face, the lighter steps aside and waits a
  moment; held up all the same (by someone seated or keeping their stall, in
  a crowd), a walker squeezes past, the two of them a little squashed. Stuck,
  they seek their way again round whoever stands in it, and no one stops to
  stand about in a doorway or a narrow way. They never move you: standing in
  someone's way, they ask you to let them by (ちょっと通るね) and go round you,
  or wait at a door you stand in. In three minutes each of the morning, lunch
  and the feast, the walkers held up for more than five seconds went from 18,
  19 and 12 to none, the longest from 45 seconds to 4.
- Talking with someone, they stay with you: walking into them while they
  talk, thank or answer you only stops you (they had been pushed, startled
  and a little less fond of you in the middle of a line), and after their
  line they stay turned to you a moment before going back to what they were
  doing, and its face.
- The きもち button (the user, 2026-10-22), up by the test toggle, or R:
  wave, bow, cheer, hop, dance, chat, look about, start or cry yourself
  (1 to 9 on the keyboard while it is open). Whoever is near may answer it.
  Seated, you get up first; eating, you stop. Out of your own eyes you feel
  it: your view dips with a bow, sways with a dance, glances left and right
  as you look about; your paw comes up to wave, cheer, dance or wipe your
  eyes; your own words (わーい！) and marks (♪, ！, ？) show low in the
  middle of the screen, as do your hearts as you eat.
- The notebook (ノート): where each of the cast is and what they are doing,
  the islanders counted, and the album of photos taken with the camera
  button, to save or share; the sound on or off.
- The island's sound, made as it plays: the sea as near as it is, wind and
  birds, crickets at night, the waterfall, the festival's murmur, the
  feast's fire, footsteps on sand, wood, grass or in the water, Rakko's
  ukulele at the feast and yours, a hum from the sea where the Siren lurks.
- The island kept as you left it (`src/core/Save.ts`): the hour and the day,
  where you stood, your paw and pouch, what lies about. `?fresh` starts
  anew.
- The island's ground, built in Blender by `art/blender/build_island.py`,
  first after the film's aerial shot, traced through a game camera matched
  to the shot, then grown to the north and west for what the film's later
  frames show: a rounded island about 340 metres across and 285 from north
  to south with a sandy ring all round (narrow where the jungle runs down
  to the water in the west and north, widest on the night beach), flat and
  low as the film draws it, grass inland, the festival behind the bay's
  quay, fields just west of it, the village's clearing deep in the jungle
  and paths between them up to the waterfall; in the north-west a tableland
  of white limestone cut through by a gorge. Its colours are painted into
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
  sea spires in six clusters round the lagoon.
- The jungle waterfall, after the film's frame of it, deep in the jungle
  in the middle of the island: the round water the aerial shot shows
  through the trees in the ring of pillars is its pool. A narrow white
  waterfall, streaming down and churning white where it lands, pours from
  a notch in a long, low wall of damp, mossy limestone split into upright
  slabs, running from the foot of the north pillar, hung with curtains of
  vines, into a deep green pool at its foot, in a gentle hollow open to the
  sun; the jungle stands back from it, so its water and the waterfall show
  through the trees from the aerial shot's camera. The pool is water of its own,
  higher than the sea and without surf: characters wade only at its edge,
  and the pen draws its waterline on the bank and the rock. Round it, as in
  the frame: dark earth and moss on the bank, monstera and red ti plants,
  ferns, a leaning mossy slab of rock, bromeliads on a mossy stump, white
  flowers and a big tree with buttress roots; the bank it is seen from lies
  under a clump of trees whose crowns close in overhead, and more stand
  either side of the pool, hiding the pillars beyond. A path comes up from
  the village and goes on past it to the sea cliffs; the place is named
  森の滝.
- The sea cliffs on the north-east coast, after the film's frame of them,
  where the aerial shot hides the coast behind the pillars. Tall cliffs of
  level-bedded cream-and-tan sandstone, stepping in and out bed by bed and
  split into blocks by upright joints, with grass, rounded shrubs and
  hanging greenery along their top, rise sheer out of deep turquoise water
  round a cove and run away along the coast. A sea stack of the same
  bedded rock stands off the cove's mouth with a smaller rock beside it. A
  lower grassy headland at the west end, reached by a path past the
  waterfall, looks across the cove at the cliffs; the place is named 北の崖.
  Inland the land on top rises gently from the headland's height to the
  cliffs', so the path climbs it.
- The forbidden cave's entrance, on the west coast, after the film's frames
  of it and the user's sketch: a terraced outcrop of bare rock rising out
  of the sea in flat-topped tiers, each stepping up and a little back from
  the last, along the back of a beach to the end of a spur of the
  tableland, nowhere on it to walk. Its faces step in at a ledge or two and
  lie in level beds split by joints; a fringe of bushes grows along the
  high tiers' tops, some hanging over their edges. At its foot, close to
  the sea and over the open beach, an arched mouth opens into the dark, a
  few vines hanging beside and over it, and nothing grows on the sand before
  it (no trees or palms within 15 metres, no plants within 12); the place is
  named 西の浜. Three metres out on the sand before the mouth stands the No
  Entry sign, as the film's (`cave signboard 1` to `3`): one thick plank of
  pale weathered wood, its grain running up it and a corner knocked off,
  on one post, about as tall as Momonga, 立入禁止!!! lettered down it in two
  columns with scratches at its corners, from the user's painting. Walkers
  go round it either side into the mouth.
  Its inside follows.
- The forbidden cave's inside, built in Blender with the island
  (`art/blender/cave.py`) after the film's frames of it (`cave interior 1`
  to `8`), and checked side by side with them from the same views. From
  the mouth a passage on foot runs back under the outcrop, a tunnel little
  higher or wider than the mouth, its vault rippled with flowstone and hung
  with small stalactites, broken stone heaped along its walls and pebbles
  over its floor. It opens into a cavern where the cave's sea comes in onto
  a little beach, the rowboat drawn up on its sand, rounded knobs of rock
  hanging from the roof (0.6 to 1.1 m across; they had been twice that,
  too big), dark but for the torch carried through it. The
  sea runs on east under the spur, dark, through a doorway in the dome's
  wall into the round chamber under the skylight: its water glows blue,
  brightest under the opening, sparkles winking on it and motes drifting
  over it. Its rock hangs in folds down the vault, as the film's does
  (`cave interior 4`): ridges of every width side by side, some on into
  the water, some ending short of it in a rounded lobe, broad masses
  standing out into the water and dark hollows at its edge; stalactites
  hang where the vault leans in over the water. Fluted columns of rock
  stand out of the water before the wall in clusters, low shelves of rock
  lie along the shore, dark boulders break the water, and both doorways
  are arches worn by the sea. Up the well the rock's beds wander up and
  down round it, and its foot rounds over unevenly, dark and wet, rather
  than ringing the vault in pale stone. The rock is painted darker in its
  hollows and paler on its ridges, and lit pixel by pixel toward the
  glowing water, catching the film's cyan along its edges; far off across
  the water, low down, it shows through a faint haze of the lake's light.
  The cave's daylight is the island's own now, the sun's and the sky's as
  they light the ground outside, blue from the sky; it had been about
  twice as bright and white, the dome a plaster grey by day. As cheap to
  draw as before. The rest of the cave the same: up the walls of the
  cavern and the sea's ways and over them, heavy rounded masses of rock,
  bigger the wider the cave, as the film's (`cave interior 2`, `3`);
  flowstone hanging in runs down the passage's walls (`cave interior 1`);
  the chamber's rock in rounded masses piled up its walls, its doorway an
  arch; all of it painted darker in its hollows and paler on its ridges. In
  the dark its forms show, as the film paints them, by a little more of the
  cave's painted dark along their edges (not on the floors, which stay as
  dark as they were). Low down, by the water and the floors, the rock is as
  it was, and nothing hangs lower than 1.9 m over the water or a floor: the
  boat's rower and walkers pass under (a rock over the cavern's water had
  come low enough to keep the boat from turning off the beach). As cheap
  to draw as before. Looking up the skylight's well from the water, the
  sky shows ringed by the plants at its edge, as in the film's frame of
  it (`cave interior 6`): the trees that crowd round the opening, as
  they do from above (`cave interior 5`), are not drawn while you are
  deep in the cave, where they had filled it. What is seen up the well
  keeps the island's night colours, the leaves round its edge a moonlit
  navy where they had been black (the cave's own rock and water are as
  they were, to the pixel). Through a doorway in the
  dome's far wall the sea runs on east, deeper in under the high ground,
  to a chamber of its own past the skylight's, dark but for its fire, as
  the film's (`cave interior 7`, `8`): a broad ledge of the rock at its
  back, with room on it for the Siren, giant as she is, to rest by the
  cast as she does in the film. It is twice the size it was, about 120 m²,
  20 m across and 8 m deep at its middle; the chamber has grown round it,
  its wall 10 m from its middle where it had been 7.6, its doorway where
  it was.
  The ledge looks left by the sea, of the cave's own rock, and lies low
  as the film's does: its top only 13 cm over the water (its lip about a
  sixth of the cast's height; it had stood 57 cm, about as high as
  Chiikawa), its edge wandering as it drops sheer into the water, and its
  ends narrowing away into the wall rather than stopping square. It is
  cobbled all over with rounded stones packed close, flattish and bedded
  in it, of every size, bigger toward the back, with a few bare patches of
  the rock between them; wet down its lip, dry on top. Behind it the
  wall rises in tall rounded lobes of the rock side by side, where six
  boulders had stood on the ledge apart like props, and the crystals stand
  at its back toward either end. As cheap to draw as before. Walking to
  its low front you stop at the brink, as at a wall, rather than step off
  into water too deep to wade. Anywhere in the cave, the floor's height
  blending down into deep water had let walkers stand at such a brink
  with their feet sunk in it (more than a metre at worst); the dome's
  little rocks by the shore now take a walker only where they can stand.
  Getting out of the boat by the crystals or the fire sets you beside
  them rather than in them, from where you could walk off over the sea's
  floor.
  The place is named ひみつの洞窟.
- The cave has its own light, whatever the hour, measured on the film's
  frames: its walls a near-black navy, its floors and the tops of its
  stones a dark blue a little lighter, the rock round the lake lighter
  still; the
  water's glow; and a torch carried through it, a small bright pool of
  cream light with the dark close round it, the flowstone showing where it
  falls. The outside's light comes in only where it truly can. The sky's,
  by the mouth and down the skylight's well, is baked into the rock as the
  share of rays from each point that leave the cave by them: the mouth's
  rim lit as the beach outside, a metre in a quarter of that, dark by
  three. The sun, or the moon once it has set, shines in where a line to
  it passes out through the mouth's arch or up through the well's foot and
  rim, onto the threshold when it is in front of the mouth and down the
  well in a beam that slants as it goes over, laying a bright patch on the
  water that moves with the hour; the shaft of it shows in rays, and by
  day the bright water lights the dome's walls a little. Whoever stands in
  it is lit as by day outside. Nothing else lights it: where nothing shines,
  the cave is dark. Nothing in it has light of its own but the lake's glow,
  the torches and the fire: the water's dark is the cave's dark seen in it,
  the cast's pale glow the painted dark's light on them, the motes over the
  lake lit by it, and the crystals dark, as the film's, but where light
  catches them. The boat and the torch's stick are lit as the cast are,
  so they read in the dark, and so are their lines (they had been drawn
  in the daylight outside, brown lines in the dark); a rice ball in hand
  is lit as the hand holding it, and the sky's haze in the air stays
  outside. A dark test in the dev tools (`__dev.caveDark()`) puts out
  every light in the cave and finds nothing in it still lit, in each of
  its views by day and by night. The
  ledge's fire is redder, turning the cobbles round it the film's warm
  magenta. The night's moonlit colour grade gives way to the cave's own a
  few steps in from the mouth. The cast in it are a pale glowing cyan, as
  the film draws them there, a warm cream on the side turned to a torch.
  Walking in it you hold the torch up, its flame over your head.
- Shadows only ever darken the ground they lie on. The soft brown shadow
  under each of the cast, and the one a lantern or a torch throws, had been
  laid on as a see-through brown, lighter than the ground wherever the
  ground was darker than it: at night, and on the cave's floor. Its brown
  is now the hour's light on the ground, so by day it is as it was, by
  night it is dimmer, and in the cave it only darkens.
- A dark test for the whole island in the dev tools (`__dev.islandDark()`),
  as the cave's: it puts out every source of light the island has (the sun
  and the moon, the sky's light on what faces it, in the air and on the
  sea, the hour's light on the cast and on what is painted flat, the
  moon's rim, the clouds', the lanterns, windows and torches and the light
  they throw, the houses' baked lantern light, and the cave's own), draws
  eighteen views at 22:30 and at 11:00 (the festival's plaza and its
  street, the village's plaza, the lane, the plank huts, a guest house, the
  beach with the moon's road, the quay, the bay from the water, the night
  beach, the waterfall, the sea cliffs, the stepping stones, the riverside
  path, the way to 島二郎, the fields, the cave's mouth and the whole
  island from high up) and finds nothing in any of them still lit, in
  about five seconds. A fixed colour, a stray light, a fixed-colour patch
  laid on the ground and a glowing material, each planted in a view, are
  caught. Its first run found the festival's confetti, whose colour was a
  copy of the hour's light that nothing put out with it: it now takes the
  hour's light itself, no change to see. By day it found the glints and
  the clouds' shadows below. Every view checked against captures taken
  before at both hours: 29 of 32 the same to the pixel, the other three
  within the few pixels two loads of the same page differ by.
- The cave's rowboat (PLAN.md 6.2). Beside it the action button (乗る) gets
  you in, and from the beach pushes it off into the water. The stick steers
  it, as walking is steered, the boat turning gently and pulling ahead at
  up to 3 metres a second; it keeps to water deep enough to float in,
  turns only where it has room to, and backs water when steered behind it.
  At the beach or the ledge the button (降りる) gets you out, and landed at
  the beach the boat is drawn up onto the sand again, where walkers go
  round it. In the boat the torch stands at its bow, lighting the way, its
  flame mirrored in the water ahead as a column of short golden strokes.
  From deep in the cave the jungle and rocks outside are not drawn but for
  the jungle round the skylight, which shows up its well: at 1488 x 800 on
  the dev PC the lake's view takes 19 to 20 ms, the ledge's chamber's 16
  and the passage's 14 (the lake's took 24 to 32 drawing them all).
- The stepping stones across the gorge, after the film's frames of them:
  six tall pillars of the gorge's white rock standing in its river, each
  topped with a flat round mat of grass, 40 to 90 cm apart, from a pillar
  standing against the north rim's cliff, level with its grass, to a shelf
  of rock jutting from the south rim's cliff over the riverside path.
  Characters walk out onto the first from the rim, jump from stone to
  stone (from each edge at a walk, or easily at a run) and walk off the
  last onto the far rim. Miss one and they fall into the river and climb
  out on the riverside path, as Chiikawa does in the film.
- The riverside path along the foot of the gorge's south wall is a bank of
  rounded pebbles, pale greys, some cooler and some warmer, each lit along
  one side, with boulders half in the water along its edge and ferns,
  monstera and red ti plants at the wall's foot, as in the film's frames of
  it. It passes under the stones' shelf on its way to the restaurant.
- 島二郎, the restaurant at the end of the riverside path, after the film's
  frames of it (`shimajiro exterior 1`, `2`, `shimajiro interior 1` to `3`)
  and the user's sketches of it: a tall box of a shop clad in weathered grey
  brown planks between dark square posts that part its front into three
  bays (a bench of potted plants, the plank door with its small square
  window under a thick board, opening outward, two riveted iron plates over
  boards running up and down), a deep cornice round its top, a wide cream board standing up
  off it over the front with 島二郎 on it and a lamp over it, a gable roof of
  dark boards behind, a lean-to of corrugated tin down its left side over
  beer crates, bottles and a bucket of sticks, and beside it the tall
  standing sign, 貝汁, under its own lamp on a pole wound with vines. Inside,
  the film's room of warm planks over boards below a dark rail: the kitchen
  against the side wall by the door (a pale blue stove with big pots on it,
  ladles and pans over it, two jars), a table under the window with a chair
  and a stool, the menu's three plaques, strings of shells and starfish, a
  lamp hanging in the room's middle. It stands deep in the jungle, which
  closes in on it. Its sign hangs over the path from a low branch of a tree
  beside it, vines draped along the branch, as in the film's frame of the way
  to it; its signs are the user's own hand-lettering; the place is named
  島二郎. Built by `art/blender/shimajiro.py` (the sign over the path by
  `art/blender/build_props.py`, its tree and the jungle round the shop by
  `art/blender/build_island.py`).
- The bay is the festival, laid out as in the film's arrival: a short
  wooden pier (rough planks on log posts, over turquoise water) reaches out
  from the middle of the beach, and the white duck ferry lies at anchor out
  in the bay, bobbing, as in the film's aerial shot. The bay is a quay, as
  in the film's frames of it: its sand stands level half a metre over the
  sea out to a low wall of timber, upright planks close side by side
  between log posts every two metres, their cut tops a little proud of the
  sand, dropping straight into water a metre and a half deep; the pier's
  deck meets the quay's top. Past the wall's ends the sand runs down to the
  sea as a beach. The ferry is built
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
  bay, a step apart, following its curve, either side of an opening in
  line with the pier. The welcome arch spans the opening: a
  wooden board reading 島へようこそ!! wreathed in big yellow flowers, with
  ウェルカム・トゥ・シマ on the banner below. Through it, a street as wide as
  the arch runs inland, six stalls down each side facing in, and two
  across its far end facing back toward the arch, either side of the path
  on to the village; past them the street's ground runs on as open sand.
  The whole festival stands on level ground; the path climbs to the
  jungle only past the street's end. Twenty-eight stalls in all, square
  booths under signboards across their fronts and down their sides
  (じゃがバター, たこ焼き, いか焼き, りんごアメ, ケバブ, 冷しパイン,
  わたあめ, クレープ, やきそば, かき氷 and more), each with what it sells
  and its tools on its counter and work table, bunting with
  paper lanterns strung along the beach rows, from pole to pole down both
  sides of the street and across it, white banners reading いらっしゃいませ!!
  and たのしんでね tied by ropes to the street's poles, poles of pink
  lanterns, palms behind the stalls and confetti over the beach and the
  street.
  Behind each row of stalls runs a back alley of packed sand, clear of
  plants, for the islanders who keep them.
  Built in Blender by `art/blender/build_village.py` (the arch and banners
  by `art/blender/houses.py`).
- The village lies in the jungle in the middle of the ring of pillars, on
  the path from the festival street to the waterfall, its houses in groups
  of their own as in the film's frames of it: a sandy plaza where the
  islanders gather, the islanders' own houses to the west of it, and the
  guest houses in a glade of their own to the north-east. Four big stilt
  huts face each other in pairs across a sandy lane running from the
  plaza to the fields, each one you can walk into, after the film's
  village frames: chunky log stairs up to a porch of wide planks on a
  thick log edge, with no railing and potted plants on it, a doorway wide
  enough for three, its one plank door swung out onto the porch, walls
  shingled all over in round scales between thick log posts and rails,
  tall windows in heavy frames with a double white zigzag, a room inside
  as the film's villager's hut, and a beehive of straw over it all, tied
  in a knot at its top. Two plank huts stand side by side on the ground
  under wide thatched roofs, the same room and door in them, with two
  round thatched huts beside them, in a yard to the north-west. Built by
  `art/blender/houses.py`.
- The guest houses, where the visitors sleep, after the film's frames of
  them: four small log cabins of pale round logs, their cut ends stacked
  at the corners, on short stilts under steep gable roofs of wooden
  shingles, two orange and two tan, each with a window in its roof's
  slope. The door is in the front gable end, up three half-log steps, a
  plank door with a diamond window and a long handle; the gable over it
  is boarded cream or pale green, patterned with chevrons round a small
  window. Inside, the room of bare log walls and a plank floor is empty
  but for a red cloth hammock slung from wall to wall before the window
  opposite the door; the windows light up at night. Each
  stands in a crowd of flowering bushes, banana plants, monstera, ferns,
  red ti and cycads, palms over it, along a path through their glade.
- At the plaza's north-east corner, the tall wooden watchtower stage
  where announcements are made, facing the plaza, after the film's:
  squared timber legs splaying out to the ground, braced on every side
  with two tiers of crossed planks over cross beams; an open platform 3.6
  metres up on a thick rim of two boards, with no railing; posts leaning
  out from its corners to a tall conical thatched roof twice as wide as
  the tower; and stairs up its back. Its edge still keeps whoever stands
  on it from stepping off. Four tiki torches stand in a row in front of
  it, lit at night, a palisade of rough log posts runs out either side of
  it, and the jungle's flowers crowd behind, as in the film's frame.
- Log benches round the plaza and in the lane, potted plants by the
  porches, baskets of fruit at the stage's foot, flowering bushes and
  grass round the huts.
- The jungle fills the island's interior, dense like the film's: a
  canopy of tree clumps whose round crowns run together, nearly four hundred
  palms among them and thick along the beaches, a dozen big trees with
  buttress roots and hanging vines, and under them all ferns, cycads, red
  ti plants, bromeliads, monstera and flowering bushes (purple, white,
  yellow, red, pink), thickest along the paths; banana plants, their long
  paddle leaves torn here and there, round the guest houses. The ground under the trees
  is shaded. Everything sways gently in the wind, outlines and all.
- Crops grow along the fields' rows, just west of the festival street.
- Blue butterflies flutter round flowering bushes, mostly near the beach
  and the village.
- The island's layout is a file, `public/data/layout.json`: where every
  prop stands, which way it faces and what its signs say, which group it
  is drawn with, and the island's named places. The Blender build reads it
  too, to keep the jungle clear of the props.
- Places have names. Walking into one shows its name for a moment under
  the title: お祭り通り, 村, 浜辺, 畑, 桟橋, 森の滝, 北の崖, 渓谷, 西の浜, 東の浜,
  and the sand, the jungle, the lagoon, the reef and the deep sea elsewhere. The Test panel's info line shows it too.
- A free camera in the Test panel (フリーカメラ), for looking round the
  island quickly: fly the way the camera looks with the stick or WASD,
  drag to look round, pinch, scroll or E and Q to rise and sink, Shift to
  go faster. ここへ移動 puts the character you control down under it.
- For checking the island against the film: in development, `__dev.shot('aerial')`
  in the browser console frames the island as the film's aerial shot does,
  through the camera it was first laid out with (in a window shaped like
  the frame, about 1.86 : 1), its lens widened since to take in the grown
  island. From high above, the sea reaches further and the haze thins, so
  the island still reads. `waterfall`, `cliffs`, `bay`, `cave`, `stones`,
  `riverside`, `shimajiro`, `village`, `lane` and `guesthouse` stage the
  film's frames of those places the same way.
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
  and stop at cliffs, steep rock and the foot of
  every rock landmark, hut, stall, palm and tree trunk. They can walk out along the pier to its end.
  They climb steps no higher than a stair's (so they walk up a hut's
  stairs onto its porch and into its room, and up the stage, but not up
  the porch's side), walk under roofs, and can't walk under a hut. The
  camera never dips into a hill behind them, and comes in front of a rock,
  a wall, a roof or a tree's crown rather than behind or inside it.
- The waterline follows the height grid, the same edge the water stops at
  and characters wade to, so it runs smoothly round every shore. The rocks
  draw it too, where they stand in the water, the sea's or the pool's.
- Hand-lettered signboards, as the film's are. Every sign the game types
  words on has a template to paint over in `art/signs/_guides/`: each
  stall's header board (painted once, it shows on the board across its
  front and on those down both its sides), the arch's board and banner,
  and the street's banners. A template is the sign's lettering area at 800 pixels a metre
  (a stall's is its board's whole face, so its sign fills it edge to edge),
  in its board's colour, with the typed words faint on it. A transparent
  PNG painted over a template and saved in `art/signs/` takes the place of
  the typed words. `art/blender/build_signs.py` draws the templates and
  copies the paintings into the game at its own sharpness, black paint
  turned to the film's dark brown as on the faces. It redraws a template
  only while it is as it drew it, so a painting saved over one by mistake
  is kept. A painting that no longer fits its template's proportions (its
  board since reshaped) shows as it was painted, centred, never
  stretched. A stall's sign painted solid to its edges gives the stall's
  board its own colour, so the board's top and ends match it; the board
  is shaded flat, as the sign on its front is, and in the film look the
  signs take the sun's shadows with their boards, so the two meet unseen
  in sun, shade and firelight. A sign without a painting keeps its typed
  words. How to paint them is in `art/signs/README.md`. All but 島二郎's
  (34 in all) are painted: the cave's No Entry sign (painted three times
  as sharp as the rest, since the film shows it close; its painting,
  `cave warning signboard.png`, is named in the user's own words, which
  the build knows), and among the rest
  the arch's 島へようこそ!! and its Welcome to Shima
  banner, the street's いらっしゃいませ!! and たのしんでね, and 味じまん
  お好み焼き on a red board at the street's far end, as the film has it
  there, in place of トロピカルジュース.
- Everyone keeps their eyes on you (the user, 2026-10-22). Before, those
  within 4 m of you turned their whole bodies to face you.
  - Within 4 m, the cast, Hitoha and Futaba, the crowd and the Siren turn
    their heads to you: to the sides, and up and down too, as when you
    stand somewhere high.
  - A body turns only once its head has turned as far as it goes, about
    29°. Then it turns after the head, unhurried, and the head straightens
    as the body comes round. When you go, they turn back.
  - Looking up or down is a gentle nod, half of the way to your eyes and
    at most 14°: all the way looked weird.
  - Every head is now a part of its own (HEAD, a thirteenth part in every
    rig) that turns about its neck, where it grows wider than the body.
    Its ears, leaves and flower crown go with it.
  - Every character and outfit was rebuilt. Models built before this turn
    only their bodies.
- The Siren, the giant mermaid of the forbidden cave, resting on the
  chamber's ledge past the skylight's dome (the user, 2026-10-21).
  `art/blender/build_siren.py` builds her in the cast's own form: their
  vertex format and rig, their pen and their flat shading, and a face
  painted in layers in `art/faces/siren/`.
  - Her shape is the user's own drawings of her from the front, the back
    and the side, and her head is the cast's: Chiikawa's head from the
    downloaded models, as round as every other Chiikawa model's, at her
    size.
  - She is 3.6 times Chiikawa's height to the tops of her bun-ears, about
    3.3 m, as `cave interior 7` and `8` both measure her beside the cast.
  - Her body is one smooth shape, her tail part of her and never a second
    layer she wears (the user, 2026-10-22). Her eyes are 1.95 head radii
    over her base, and a short white torso shows under the head, running
    on into her coral tail. A pink band lies flush round her waist, inked
    along both edges. The tail's round bowl is rowed with scales and leans
    back under her into its curl, as the drawing from the side has it.
  - A black hair cap covers the top and back of the head. Its edge is the
    curve the user drew over her from the front and the side: a
    round-footed widow's peak hanging down between her eyes, flaring into
    the two round humps of her white face, then sweeping down behind her
    eyes.
  - Two fluffy black bun-ears sit at the head's top corners, each with a
    red fan in front. Simple round fin-hands spread out and down from her
    sides, two lines on each. Her tail curls round under her and up behind
    her to a heart-shaped fin.
  - Her face's first layers are templates for the user to draw over (never
    overwritten), the cast's whole set of layers and all nine expressions:
    from the film where it shows her face (calm, after `[anime] siren 2`
    and the plush; singing, after `cave interior 7`; teary, after `cave
    interior 8`; angry, red-eyed with a toothy mouth, after `[anime] siren
    3` and the angry plush), the rest after the cast's own sets, her
    whiskers on every face. Angry is a ninth expression (怒り, the user's
    choice); the rest of the cast show their neutral face for it until it
    is painted.
  - The Test panel's セイレーン section calms her (おだやか) or rouses her
    (おこる: her fin-hands spread out wide and held, her angry face), and
    takes you onto the ledge before her (会いに行く). She sits south of the
    fire, facing the water, so that from the water she is to the fire's
    right and the cast to its left, as in the film; walkers go round her.
  - She keeps her eyes on you within 6 m, as everyone does (below), more
    slowly. As tall as she is, up close you saw only her chin, so her head
    bows to you in a gentle nod (the user, 2026-10-22). Her body turns
    after her head as everyone's does, and what keeps walkers off her
    fin-hands and tail fin turns with her. When you go, she turns back to
    the water.
  - She is no light: the cave's own light, the fire and the torch light her
    as they light the cast (the user, 2026-10-21).
  - She costs about 0.4 ms a frame at 1280 × 720 in the chamber, two draw
    calls and 67,000 triangles with her pen; she is drawn with the cave.
- Kurimanju, a visiting guest, stands with the cast under the welcome arch
  (the user, 2026-10-22).
  - Built from Chiikawa's model, changing only what the official plush
    (`[3d model] kurimanju`) shows is their own, as the user asked.
  - They are peach, with a brown chestnut cap over the top of the head.
    Its edge is lowest in front and behind and rises to the sides. The
    converter draws it as a mask (its `cap` option) in even coordinates
    of its own round the head: the downloaded model's own UVs left the
    edge ragged.
  - Their tiny round ears sit low on the head's sides (its `ears`
    option), and a pale green crown sits on the cap.
  - Their face is the user's own painting (`art/faces/kurimanju/`, started
    as a copy of their Chiikawa layers). Kurimanju hasn't many expressions
    (the user, 2026-10-22): the extreme ones, sobbing, shocked and angry,
    are his special face (`special.png`, a whole face of its own, mouth
    wide open), and he has brows only when he is serious (determined).
  - Their face's guide is drawn from their own head as the game shows it:
    peach, the cap on it and the ears where they now sit. Baked from
    Chiikawa's model, it had shown Chiikawa's white head with no cap and
    the ears on top (the user noticed).
  - Always with a drink (PLAN.md): a can of it in one hand, upright, which
    goes with the hand as Kurimanju sits or waves with the other and is put
    down while they eat (the user, 2026-10-22). The can is a new prop in
    `art/blender/build_props.py`: a gold label between a silver foot and a
    silver top narrowing to a rolled rim round its lid, 17 cm tall, drawn
    with the pen and lit as the hand holding it is (720 triangles). Any
    character can carry one (CharacterDef.carries).
- Rakko-sensei, a visiting guest, stands with the cast under the welcome
  arch on Chiikawa's other side (the user, 2026-10-22).
  - Built from Chiikawa's model as Kurimanju is, changing only what the
    official plush (`[3d model] rakko`, front and back) and `[anime] rakko
    1` show is his own.
  - He is a tenth taller than Chiikawa, as the style guide has him (the
    converter's new `scale` option).
  - He is cream, with tiny dark brown ears low on the head's sides (much
    smaller than Chiikawa's, as the official drawing and plush have them:
    the user) and dark brown paws and feet.
  - His face is the user's own painting (`art/faces/rakko/`, started as a
    copy of their Chiikawa layers), his tan star scar over his right eye
    among its layers. A layer named `scar` now shows on every face, as the
    cheeks do. The converter's new `mark` option, which first drew the
    star on his model as a mask, is kept for marks to come. His face's
    guide shows his head as the game does: cream, the dark ears where they
    now sit.
  - As the film draws him (`[anime] rakko 1`), no line runs round his head
    and body: short strokes of fur instead, in from their edge, square to
    it or a little askew and unevenly spaced, in the pen. The game draws
    them round the outline as it is seen (CharacterMaterial's FUR, from
    the converter's new `fur` option), 24 round his head and a few along
    his body's sides.
  - He never wears the island outfit, only his own clothes (the user,
    2026-10-22): his cape and his sword. The island outfit is his only
    from the Test panel (ラッコ：島の衣装). 島の衣装 takes either off.
  - His cape, after the film and the official drawings: white cloth
    wrapped round his neck in a flat band under his head, thin enough
    to leave his lower body in view (the user), and hanging from it down
    his back to the ground, its hem rising to its front edges, open at
    the front. It is an outfit of its own (`art/blender/outfits.py`
    `cape_pieces`) and sways and settles with him as the grass skirt
    does (2,900 triangles).
  - His sword, after the user's own drawing of it: a broad grey blade (a
    cool grey, so that it shows grey in the game, where the sun's warm
    light on what is held had turned the drawing's own grey beige)
    widening from the guard to its shoulders and coming to a point, a
    ridge line up its middle (broken a little above the guard) meeting
    two lines from the shoulders like a cut gem's facets; a white guard,
    a white grip banded with three dark lines, a white pommel; 0.4 m long,
    as on the official plush (`art/blender/build_props.py`, 590
    triangles).
  - He carries it on his back (the user): slantwise across it over his
    cape, its hilt up and out over his right shoulder, where it shows
    past the foot of his head from the front, as the official drawing
    has it. Only now and then does he hold it, in the Test panel's
    剣をかまえる (shown only for him): up in his right paw, his face
    serious, its point leaning forward and out clear of his head. The
    film has him hold it up before him in both paws, but his stubby arms
    reach no further in than his sides, and his head is too big for a
    blade held before it.
  - His ukulele (PLAN.md), which he plays from the Test panel's ウクレレ,
    shown only for him: held across his tummy in front of his cape's band,
    its neck up to his left, his right paw strumming, swaying a little to
    the beat. No frame of the film's ukulele yet, so it is a plain one,
    honey wood with a darker neck (1,980 triangles). The bonfire he plays
    it at is not built yet.
- Furuhonya (古本屋), the crab, a visiting guest, stands on the night beach,
  the east end of the main beach, facing the sea (PLAN.md; the user,
  2026-10-22).
  - Built from Chiikawa's model as Kurimanju and Rakko are, changing only
    what the official plush (`[3d model] furuhonya`, front and back) and
    the user's close picture of her face show is her own.
  - She is a pale pink, with no round ears and no tail. A soft coral-pink
    cap covers the top of her head, as the user's picture has it: its edge
    half a head radius over her eyes in front and a little lower at the
    sides, under her crown, and only a change of colour, with no line
    along it (the rig's new `maskLine`). It is drawn as Kurimanju's cap is
    (the converter's `cap`).
  - Two coral-pink claws stand up from her head's upper sides where the
    ears were, in the shape the user drew them: round as a lily pad, with
    a notch for the pincer's gap at the top on the outer side, and a wide
    foot running into her head. They are as big beside her head as the
    user's picture has them, each about a third of its width. They are set
    a little behind its middle, so her head's outline crosses their feet
    as the drawing has it. They lean out a little and are puffed thinner
    toward their edges (the converter's new `claws` option, its outline
    traced off the drawing), and bob as ears do.
  - Two tiny dark antennae stand on the top of her head between them, thin
    as the pen's strokes (the user; the converter's new `antennae`
    option), and bob with them.
  - Her crown is white and pale blue, sitting on the cap's edge (the
    crown's new `cap` mode).
  - Her face starts as a copy of the user's Chiikawa layers, to repaint
    (`art/faces/furuhonya/`): the plush has big round eyes, two short
    double lines for brows and an open cat mouth. Her face's guide shows
    her head as the game does: the cap, the claws and the antennae on it.
  - 8,700 triangles, 0.98 m to the tops of her claws.
- Shisa, a visiting guest, cheerful, stands with the cast under the
  welcome arch, at the back on the left beside Hachiware, where the mane
  shows from the pier (PLAN.md; the user, 2026-10-22).
  - Built from Hachiware's model, the set's cat, after the official plush
    (`[3d model] shisa`, front and back) and the official drawing the user
    gave. In cream, with the drawing's little tail, Hachiware's tuft, in
    the mane's colour.
  - A mane of petals on each side of the head, three a side, from under
    the ears down past the cheeks, in the drawing's soft salmon orange.
    Each petal is the shape the user drew (the converter's
    `PETAL_OUTLINE`, traced from their stroke): a gently domed top out to
    a little hooked tip, and a full curve back down. Its straight edge
    lies along the head's outline, as on the user's close-up of the
    drawing, so the head's line runs over it and only the dome, tip and
    curve show. The user turned down a first mane of pointed flames, then
    soft round petals ("soft flower petals"), then petals turned the wrong
    way round.
    - Each is a flat piece of its own, like felt, with its own line, the
      upper ones over the lower ones. A root out of sight in the head
      holds it on.
    - The converter's `mane` option places each petal between two heights
      on the outline.
  - The ears are the same petal, only longer (the user: "her ears are
    petal shaped too (but longer)"). They stand on the head's top corners
    with their tips where the drawing's are, higher than Hachiware's ears,
    which are dropped. They are on the ears' parts, so they still twitch
    (the converter's `petal_ears` option).
  - Each petal and ear has the drawing's little curl in it, traced off the
    user's close-ups (`PETAL_CURL`, `EAR_CURL`). In a petal it is a short
    stroke out from the head's line, a third of the way across. In an ear
    it is an arch over its middle, as an inner ear's crease.
    - The curls are drawn with the pen (`pen_stroke_bm`): the outline's
      own ink and width (1.8 cm), round-ended. Each is laid as its piece
      is, so it bends and stretches with it, 3 mm off its front face, with
      no line of its own. The back stays plain, as the drawing shows only
      the front.
  - Shisa's face guide (`art/faces/shisa/_guide.png`) is now drawn from her
    own head, with her ears, mane and curls. It had shown Hachiware's ears.
  - A peach crown high on the head.
  - Shisa's face starts as a copy of the user's Hachiware layers, for the
    user to repaint (`art/faces/shisa/`). The plush has big round eyes,
    thick orange flame-shaped brows and a wavy cat mouth.
  - 12,900 triangles, 0.91 m to the tips of her ears.
- The Siren's two little mermaids (the user, 2026-10-22).
  `art/blender/build_mermaid.py` builds one model for both, and
  `src/characters/LittleMermaids.ts` keeps them with her.
  - They sit side by side before her tail on the ledge, facing the water
    as she does (`cave interior 7`, `8`).
  - Now and then (every 25 to 45 s) they hop up together onto her head,
    the second a moment after the first, to sit on its top between her
    bun-ears for 12 to 25 s, then hop back down (`[anime] siren 1`).
  - Roused (おこる), she has them up on her head until she calms.
  - On her head they ride it as she nods to you or turns. Like everyone,
    they keep their eyes on you within 4 m, and walkers go round them on
    the ledge.
  - The Test panel's セイレーン section sends them before her (人魚：前) or up
    onto her head (人魚：頭の上). A staged shot's `mermaids` places them.
  - They are the Siren's own shape made smaller, as the user asked: her
    head (Chiikawa's), body, band, tail and fin-hands, built with her
    script's own helpers. They are as finely made as the cast, 12,000
    triangles each.
  - What differs follows the user's drawings of them from the front, the
    back and the side, and the official plush. A rust-red patch runs over
    the top of the head, rounding down to just above the eyes in front and
    a little higher behind, with two tiny black antennae on it. They have
    no bun-ears, no black cap and no whiskers. The tail is rust, its
    scales bigger for their size.
  - They are 0.7 of Chiikawa's height to their antennae's tips, as `cave
    interior 7` and `8` measure them beside the cast (0.67 and 0.75).
  - Their one face, two dot eyes and a round open mouth, is a template
    for the user to paint in `art/faces/mermaid/`, with the dots closed to
    dashes for their blinks.

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
  as sharp as fits; faces painted alike (a stall's three boards) share one
  patch of it.
- Props that never move are joined into a few meshes per group (the
  festival, the village) or patch of the island, with one outline each.
- Plants planted many times are kept once each in the plants file, with
  where each copy stands, and joined at load: the file went from 9 MB to
  1.9 MB.
- The drawing resolution steps down when the frame rate stays under 48
  for a few seconds, and back up when there is room again, though never
  back to a resolution that proved too slow until the window changes. It
  goes down to half the screen's own (it had stopped at the screen's own),
  and a big window starts below full, at the steps that keep it within
  1.5 million pixels: a 1920 x 1200 window starts at three quarters
  (1440 x 900). The pen and the HUD keep their size on screen. On this PC
  (Radeon 780M) the waterfall frame at 1440 x 900 takes 16.5 ms, against
  45 ms at full size before, and holds 60 frames a second on the festival
  street.
- The film look's finishing passes draw the same picture for a quarter of
  their cost. They had all run on pictures of four samples a pixel, which
  every pass wrote and resolved before the next could read it; now only
  the scene is drawn with four (the plants' cut-out leaves need them), into
  a picture of its own resolved once, the depth of field, the brushwork
  and the glow draw one sample a pixel in half floats, and the colour grade
  draws straight to the screen, taking over the last pass's work. Drawn
  through both, the waterfall frame and the festival street at 11:00 and
  at 20:00 differ by at most one step in 255. Measured with the GPU's
  timer (the median of about 18 frames drawn back to back): at 1920 x 1200
  a frame takes 26 ms against 45 (the scene alone about 20, so the passes
  went from about 25 ms to 6); at 1105 x 781, 12.5 ms against 18.7.
- Once the graphics card has the island's shapes, the page lets go of its
  own copy of them: the plants, the props, the rocks and the cave, some
  240 MB of vertices that had been held twice (`releaseOnUpload` in
  `src/world/Stage.ts`). Nothing reads them after the island is built;
  each mesh's bounds are worked out first, and a mesh first drawn later
  lets go of its copy then. Once the island had been looked round, the
  page's memory was about 120 MB where it had been about 290, and the
  views drawn before and after are the same to the pixel. As the
  graphics card's copy is then all there is, a lost GPU context (a phone
  taking the graphics back) starts the game again, rather than going on
  without the island's shapes and the painted wood.
- The understory is put together only near the camera. Its 11,549 plants
  are copies of 58 shapes, and joined into their patches all at once they
  were 3.7 million vertices, 176 MB on the graphics card, of which the
  camera only ever draws a few patches (within 34 m). Each patch is now
  put together from the shapes once the camera comes within 6 m of its
  reach, a few thousand vertices a frame (about a third of a millisecond
  on the dev PC), and let go of again 12 m beyond it: running through the
  village, the jungle, the waterfall's clearing and along the river and
  back held 29 MB of it on average and 43 MB at most, with nothing to put
  together all at once after the first frame. The patches are joined
  exactly as before, to the bit, so they draw the same and cost the same
  to draw: eight views of the plants by day, dusk and night match those
  from before to the pixel, but for a few pixels of the noise between page
  loads. The plants load in 0.74 s, against 0.90. Drawing every copy from its shape in one batch (three's
  BatchedMesh) was tried first: 2 MB, but on the festival street each
  frame took 2 to 3 ms more of the graphics card, the browser drawing each
  copy on its own.
- What lies about (the sea's shells and starfish, the torch by your door,
  whatever anyone puts down) is drawn a kind at once: near the camera, one
  draw of a kind's bodies and one of their pen lines, however many of it
  lie there, each in the trees' shade where it lies (`src/life/Things.ts`).
  Each thing had been two draws of its own, and a hundred on screen had
  cost 1 to 3 ms a frame. With 127 things lying about the festival its view
  takes 146 draw calls against 294, and with 327 still 146. Drawn both ways
  in one page, seven views differ in at most 347 pixels in 786,432, single
  pixels scattered over the things themselves where their shading turns
  (the graphics card rounding one way of placing them differently from the
  other). What anyone holds is drawn as before.
- The trees' shade on what lies about follows the sun, and by night the
  moon, as the characters' does (the user's, 2026-10-23): it had stayed as
  it was when the thing was put down. Each frame 24 things near the camera
  are looked at again in turn, so over half an hour of the island's day 49
  things in the jungle's dappled shade changed by at most 0.2% of a full
  shade a step, never further than that from the shade they lie in. With
  355 things near, all that lies about takes 10 to 15 µs a frame.

**Changed**

- Put where the hour has them (after a night's sleep, a staged shot), no two
  of those out and about stand on top of each other (1.5 m apart where there
  is room), they face the way their place looks out (the sea, the stage)
  rather than anywhere, and by the feast's fire they sit straight down where
  they are put, where they had all got up again to go to other seats.
- Furuhonya's coral cap is a little taller (the user, 2026-10-23): its edge
  now sits 0.42 head radii over her eyes in front, just over her brows, and
  0.36 at the sides (it was 0.5 and 0.44). Her crown sits on the edge, so
  it came down with it. Her face guide (`art/faces/furuhonya/_guide.png`)
  is redrawn with the new cap.
- The island's twenty-one islanders no longer look alike (the user,
  2026-10-23: more variety, now that there are more of them). Only three
  heads took turns before (round, cat and long bunny ears), each islander
  under the same crown. Their heads now vary as the film's crowds do: the
  welcome crowd from behind (`bay 1`, `bay 5`) and the festival's
  (`festival 1`, `festival stall 1-4`).
  - Nine kinds of head:
    - no ears, the most common;
    - round ears;
    - cat ears;
    - long bunny ears;
    - short bunny ears, as the festival's dango keeper's;
    - a spike curving over to one side;
    - a small knob on top;
    - two little horns;
    - one horn to the side.
  - They take turns, so no two neighbours or housemates share a head.
  - About one in four goes without a crown, as some of the welcome crowd
    do.
  - Every islander is the same islander grey, Hitoha's and Futaba's
    #988584, crowns too (the user). The crowd was a teal grey before.
  - The six new kinds are light copies as the rest of the crowd are
    (2,600 to 3,800 triangles, about 30 KB each with its crown). The
    converter's `head_top` option builds the spike, knob and horns
    (`HEAD_TOPS`), and `--only` now takes several ids at once.
- The characters' arms bend (the user, 2026-10-22: the stubs were "too
  short and there are no joins", so a wave, holding a thing or a paw below
  the mouth was almost impossible). This was studied from the user's
  sprites, the film, the official figures and 3D ad, and how others rig
  Chiikawa (see `src/characters/Arms.ts`).
  - The converter replaces each downloaded stub with a round mitten arm
    in three parts: upper arm, forearm and paw. It is as thick and as long
    as the stub ("revert back to the original length, but now they have
    joins", the user said, after 1.6 and 1.2 times as long were both too
    long). Each joint bends across a soft band, so a bend reads as a
    curve; on so short an arm the two bands are kept from meeting.
  - The arm's root is not fixed to the body's side (the user's idea, after
    the drawings, whose paws sit on the face under the mouth). As a paw
    reaches before them, the root goes round the body toward the front
    and up it, under the head's edge, to under the mouth. It goes only as
    far as it must for the short arm to reach, along a way measured on
    each model (`armRoots`). Points by the face, and a root on the head,
    turn with the head as it watches you.
  - The points paws reach for are measured by the face: how far ahead its
    mouth is. Momonga's head is wide with its fluffy cheeks but its face
    is as far forward as Chiikawa's, and measured by its head's width its
    paws fell short. Each point is checked in the game to be within reach
    of every cast member.
  - Poses can reach a paw to a point as well as turn the arm by its
    angles. The motions use this:
    - eating and crying: both paws up under the mouth;
    - talking: a paw before the chest;
    - startled: both paws up held before the chest;
    - bowing: paws together before the chest;
    - sitting: paws on the tummy;
    - waving: a paw up at the side, wagging at the wrist;
    - cheering: both arms flung up and out;
    - the hula and the hop: elbows and wrists flowing;
    - at rest: arms soft at the elbow; anything held is brought up before
      them.
  - Rakko holds his sword in both paws and plays his ukulele with both:
    one paw strums, the other is on its neck.
  - A paw's line is pulled further toward the camera than the arm's, so
    its whole round line shows when it is held close before the body.
  - Every cast member, both named islanders and the background crowd have
    these arms. The Siren's fin-hands and the little mermaids are as they
    were.
- Every character's face is baked again from the user's latest layers in
  `art/faces/` (the user, 2026-10-22), all of the cast, the islanders, the
  Siren and her little mermaids rebuilt. Their new sweat drops show on
  Chiikawa's, Hachiware's, Momonga's and the Siren's worried faces, and
  Kurimanju, Rakko, Furuhonya and Shisa wear their own paintings.
  - Only Kurimanju's and the Siren's recipes (`expressions.txt`) have an
    Angry line yet. The others show their neutral face for it.
  - Rakko's "eyes sad" layer is in no recipe, so it is left out.
- What is made for the villagers is their size (the user, 2026-10-21):
  out of a villager's own eyes, 0.63 m up, the huts' furniture, the
  festival's counters and the small plants had stood a person's size over
  them. The cast are about a metre tall, Chiikawa 0.91 m.
  - The villagers' furniture is 0.68 as big, each piece made smaller about
    where it stands against its wall or in its corner (FURNITURE in
    `art/blender/houses.py`): the kitchen counter's top at 0.49 m, about
    half a villager, as the film's (`villager hut interior 2`, `4`), where
    it was 0.72 m, over their eyes; the sink, the stove, the pans' rail and
    the fruit with it; the stump stool's seat 0.29 m (0.42); the bed 1.47 m
    long (2.16); the bookshelf 1.21 m, still a little taller than a
    villager (1.78); the little tables, the monstera and the vases. The
    rooms, the rug and its cushions and the doors are as they were. In the
    stilt huts and the plank huts alike.
  - The villagers' windows' sills stand at their eyes, 0.6 m over the floor
    (WINDOW_SILL), where they had stood over their heads (0.92 m in the
    stilt huts, 0.85 in the plank huts): a villager sees out of them, and
    from the porch the band of scales under each is as short as the film's
    (`villager hut exterior 2`), the pots before them reaching up to their
    sills. The stilt huts' windows' tops are level with the door's (2.05 m,
    from 2.3), so they keep about their shape; the plank huts' are as they
    were (1.85). Inside, the logs along the walls at the sills' height stop
    at the counter, its tap and its cutting board standing up past them.
  - A stall's counter stands at the chest of an islander at it, 0.58 m
    where it was 0.9 (as tall as a customer, after the user's wish of
    2026-10-19), its keeper on a floor 0.12 m up (0.66), so they show over
    it from the chest up, as in the film's stall frames; the work table at
    0.5 m (0.98); the header boards, and so the arch, the banners and the
    bunting, where they were. The goods stand on the new counter and table.
  - The understory's small plants, up to a villager's height and a half,
    are drawn 0.62 as big, the taller ones less smaller and the tallest
    (over 3.4 m: the banana plants and elephant ears) as they were, so the
    big leaves still stand over the villagers as the film's do
    (`underScale` in `src/world/Vegetation.ts`): half of them had stood
    over 1.3 m, two in three over a villager's head. They are drawn at
    their places, so the jungle is planted as it was, a little sparser
    near the ground; the understory's memory on the graphics card is as it
    was.
  - Kept as the film's: 島二郎's shop and its furniture, his size, a big
    man's (his stove stands over Chiikawa in `shimajiro interior 2`); the
    guest houses' hammock, slung high over the floor as in `guesthouse
    interior 2`; the porch pots, the palisade, the torches, the cave's sign,
    the fallen logs and the stalls' goods.
  - No faces flicker in the huts, the stalls or the goods; the island's dark
    test and the see-through test pass; a walk test reaches every piece of
    furniture in the rooms, and each stall's keeper's spot, its steps and
    its customer's spot.
- The game is seen out of your own eyes (the user, 2026-10-21): you are a
  nameless islander, as the plan has it, standing on the pier as the game
  starts, the cast gathered under the welcome arch before you, where you
  had played Chiikawa from behind. You see yourself only in the calm
  water's mirror (see below). Your shadow stays on the ground under you, and what you hold, an
  onigiri as you eat, shows before you. Your eyes go with your jumps and
  falls exactly and ease up and down steps and over your walk's bob; they
  keep under the forbidden cave's roof where it hangs low over a jump.
  - The lens is wider than the film's: 78° tall on an upright phone (41°
    across, as much as its own camera shows), 60° on a wide screen (85°
    across); the film's 30° on an upright phone sees 14° across, too little
    to walk by. Pinching or the wheel narrows it toward the film's lens and
    back; a drag turns the view less the narrower it is. The Test panel's
    カメラをもどす levels your gaze and opens the lens again.
  - The depth of field softens only what is within about half a metre of
    your eyes, so the ground at your feet stays sharp; the pen is at its
    sharpest 3 metres ahead, about where those you meet stand.
  - You stop a little short of touching anyone you walk up to, and slide
    round them, where you had walked through them: your eyes would have
    passed into their heads. The follow camera's character stops the same
    way.
  - Measured against the follow camera from the same spots (the pier, the
    festival street, the village, the jungle path): 5 to 10% more
    triangles drawn and up to 14 more draw calls, 143 at the pier.
  - The follow camera from behind stays for testing, as 三人称カメラ in the
    Test panel; the lineup, the free camera and the staged film shots use
    it as before. The panel's character chips put you in anyone's eyes,
    じぶん (you) among them.
  - You can see yourself in the water. Looking down into calm water you
    stand in or beside, you lean over it as you would over a pond: your
    eyes go forward to your face, and looking straight down you see
    yourself just under you: your face, crown and ears looking back up at
    you, your head bowed over the water about its neck and your body
    leaning under it, your grass skirt under your chin, clearly, the
    ripples waving you a little and the sun's glints on you, in the light
    there (golden in the golden hour, the night's blue by night). At first
    the water could show you only the underside of your skirt, right under
    your eyes and as faint as everything it mirrors, so you saw nothing of
    yourself (the user noticed); then all of you, turned over flat and out
    where you looked, which the user found looked like a flat picture of you
    floating on the water before you; then only your head clear and the
    rest of you faint, which looked like a head floating with nothing under
    it (the user again). Everyone else's reflections stay as
    faint as before. The waterfall's pool, calm, waves you and everything
    in it less than the sea does. At a deck's edge over the water, the
    pier's end or the quay, you lean further out over it as you look down,
    or the deck would hide the water under it. The foam round your own
    legs is fainter out of your eyes, where its ring framed the water you
    look into. Only the water shows you leaning, and what you hold stays as
    it was; seen from behind (三人称カメラ) you stand as before. The dark
    tests pass, and by night and by day with you leaning over the
    shallows, the pool and the pier's end.
- The forbidden cave is a hidden place, as in the film. Its skylight, the
  round opening in the spur's top over the cave's sea, is smaller (13
  metres across where it was 21) and lies deep in the spur's jungle, about
  60 metres from where the stepping stones land, where it had lain on open
  grass beside their path. The high ground south of the gorge, the spur
  with the skylight among it, has no ramp up onto it any more: only the
  stepping stones reach it. No path leads to the cave's beach either; it is
  found by going through the jungle or along the shore.
- The skylight is a well opening into a dome, after the film's frames
  looking down into it and up out of it and the user's sketch, where it
  had been a hole ringed by a wide, raised lip of moss. The jungle floor
  runs right to its edge, cut out of the ground, where a worn lip of stone
  rounds over a hand's breadth above it, mossy in patches. Its sides drop
  sheer for nearly four metres, fluted and bedded and leaning in a little,
  so from above they show as a well's do, darker going down, moss hanging
  over the edge in tongues and vines down them to the well's foot. Below,
  it opens out into a dome over the cave's glowing water, about 21 metres
  across (see the cave's inside). Trees crowd round the edge, their crowns
  over it, the nearest the edge the lowest, and ferns and bushes grow along
  it, so it shows neither from the ground nor from the air but straight
  down, while from the water below the sky shows up through it, ringed by
  leaves, as in the film. Walkers stop a step short of the edge and cannot
  jump in.
- The guest houses are closer to the film's frames of them, outside and
  in. Outside, their logs are round where they had been eight-sided, paler
  and creamier, each a little lighter or darker than the next, their cut
  ends pale round a darker heart where they stack at the corners and meet
  the windows. The roofs' shingles lie in rows stepping down them, where
  lines had been drawn on a flat slab, between bargeboards along the
  gable ends that cross at the top, and the roofs are boarded underneath,
  so the eaves show wood. The steps are three logs split down their
  length, flat face up, their cut ends showing, where they had been planks
  on log rails; the floor's frame is dark wood like the stilts; and the
  orange house's long sides are boarded and painted a grey green, as in
  the film's frame of it. Their doors' planks are the brown of the frames
  round them, where they had been paler. Inside, the walls are dark round
  logs, their cut
  ends pale down the sides of the windows and the doorway, as in the
  film's frames inside, where they had been pale planks; the floor is
  light planks with staggered joins; overhead are the roof's dark boards
  on rafters and a beam along the ridge, where the orange of the roof had
  shown, and the gables' insides are boarded dark. The windows have deep
  sills inside. Round the houses the banana plants, monstera, cycads and
  ferns stand further out from the walls, so no leaf reaches through them
  into a room. Each log is one solid, its cut ends' faces coloured, where
  each had been three pieces, so outside a house is no heavier than
  before (5,500 triangles for the orange, 6,600 for the tan, where both
  were 6,600); its room, drawn only near, is 2,900 where it was 700.
- In the film look the guest houses' wood is painted with its grain, as
  the film paints it, where it had been flat colour: streaks running
  along each log, board and plank, finer lines close to, a few lighter
  ones and a small knot here and there, wandering a little as they run;
  strongest on the dark logs, floor and roof boards inside, faint on the
  pale logs outside, none on the cut ends or painted boards. The grain
  is painted as the picture is drawn, from the way each piece's grain
  runs (kept in the models), so it costs no triangles and no textures to
  download, and it fades out before it is small enough to shimmer.
  Measured on the dev PC at 1488 x 800 inside a guest house, wood filling
  the picture: 14.5 ms a frame against 14.3 without it.
- The four stilt huts are closer to the film's frames of a villager's hut,
  outside and in. Outside, the mushroom roof is gone: a beehive of golden
  straw rises from the eaves, centred over the walls and oval to hang out
  about as far over each, about twice as high over the eaves as the walls
  are tall, as in the film's frame of one (`villager hut exterior 1`). It
  rounds over to a neck where a rope is wound three times round it, its
  end hanging down the shoulder, and a knot of straw gathered in soft
  bunches stands above the tie. It is straw, not turned wood: its outline
  swells and dips a little, short dark strokes of straw are scattered over
  it as the film draws them, and the straw's ends hang ragged below its
  rim. Flat underneath from the walls to the rim, it reaches out over most
  of the porch. The walls, porch and stairs are as they were, but for the
  left wall's window, moved toward the back so the bookshelf stands in the
  middle of that wall as in the film's room, and the door: one door of
  planks the brown of its posts, with dark marks of their grain, no
  window in it, as the
  film's, hung on the right-hand post as one looks in and swung out onto
  the porch, where two leaves had folded back inside. Inside, after the
  film's frames of the room (`villager hut interior 1` to `10`, laid out
  as its top view has it): teal walls patterned in big round scales,
  framed by grey-brown logs along their feet, at the windows' sills and
  along their tops, posts in the corners braced by curved branches; the
  back and side windows' plank shutters swung back flat against the wall
  either side; light planks underfoot; overhead the straw rises to a peak
  on rafters with battens across them, the paper lantern hanging from
  their hub. Along the back wall from the left: a cream kitchen counter,
  its front as the film's, two drawers at its end beside a pale post, then
  a pair of wide doors with dark knobs where they meet, a white wavy line
  strung with dots across them near their tops and white clouds along
  their feet; a round iron stove on it at its end, a grey sink with a
  curved tap, a cutting board standing behind an apple, a peach and a
  pear, and a rail of black pans, a cloth and wooden spoons over it; then
  a tree-stump stool by the head of a single bed of dark wood that runs
  along the right wall to the room's middle, a thick pale blue mattress
  and a long white pillow on it. In the front right corner a little table
  set askew holds a melon and a peach. On the left wall, in its middle, a
  tall orange bookshelf tapering as it rises, white pegs down its sides,
  full of books; toward the door a potted monstera on a little table and
  two brown woven vases in the corner. Before the door lies a round cream
  rug patterned in blue round a white flower, two domed straw cushions on
  it. A hut is 12,200 triangles outside where it was 8,800, its room,
  drawn only near, 12,400 where it was 5,600; no faces that would flicker.
  Their models are now compressed and their night maps WebP, as the other
  props' have been since the download was halved: 0.47 MB a hut where it
  was 1.1.
- The two plank huts have the stilt huts' room and door, so every
  villager's hut is the film's inside, where theirs had been a log-cabin
  room of the game's own. Inside, the same teal walls of scales framed by
  logs, braced corners, shuttered windows and raftered ceiling with the
  paper lantern hanging from its hub, furnished as the film's room and
  laid out the same way, fitted to their smaller room (5.2 by 4.2 metres):
  the bookshelf a little narrower, the pans' rail a little lower under the
  lower walls. Outside, one door of brown planks swings out on the
  right-hand post onto a landing of planks twice as deep as it was, where
  a tall plank door had stood folded back inside, and the left wall's
  window is moved toward the back, as the stilt huts'; their plank walls
  and wide thatched hip roofs are as they were, the roof now open
  underneath over the room, whose own ceiling rises inside it. A plank hut
  is 3,500 triangles outside where it was 3,400, its room, drawn only
  near, 12,100 where it was 5,600; no faces that would flicker. Its model
  is compressed and its night map WebP, as the stilt huts': 0.42 MB where
  it was 0.81. In the stilt huts the rail of pans stops short of the
  corner's brace, and the braces stand a little out from the walls, clear
  of the shutter they pass.
- The village is relaid after the film's frames of it, its houses in
  groups of their own where they had stood in a ring round the stage:
  the stage at the plaza's corner, the stilt huts facing each other across
  the lane to the fields, the plank and round huts in a yard to the
  north-west, and the new guest houses in their own glade (see the village
  above). Its sand is the plaza, the lane and the yard; the path to the
  waterfall starts from the plaza, a path winds
  through the guest houses' glade, and the lane is the way to the fields.
  The jungle is replanted round it; the waterfall's frame is as before.
  Measured on the dev PC at 1488 x 800, a few hours into the day (warm):
  the plaza 21.7 ms, the lane 19.5, a guest house in its greenery 28.3,
  the waterfall frame 24.2.
- Jumps carry on through the air. A character jumping keeps going, over
  gaps, drops and water, comes down on whatever is under them when they
  land (the ground, a deck, a stone's top), and is stopped only by what
  stands higher than their feet; walking off an edge more than 60 cm high
  is a fall. Landing in water too deep to stand in, they climb out at the
  nearest bank a little over the water. Before, someone jumping still kept
  to ground they could walk on, so no jump crossed a gap or a drop.
- Characters no longer walk a step into the foot of the tableland's
  cliffs: its ground now rises from the foot of the cliff faces, where it
  had risen from just inside their line.
- The island has its third shape, after the film's later frames of it:
  bigger, grown most to the north and west (about 340 metres across and
  285 from north to south, on a map 520 metres square, where it was 290 by
  215 on 430), and flat, as the film draws it. The village, the festival,
  the fields and the jungle paths lie on level ground a metre or two over
  the sea, climbing to it from the beaches' tops over about twelve metres,
  and the karst stands up out of it sheer; the waterfall's pool, its wall
  and the pillars round it moved 40 metres north with the island, each
  pillar as tall over the ground round it as before. The bay is a quay of
  timber, its sand half a metre over the sea (see the bay above). In the
  north-west the land stands up as a tableland of white limestone 11
  metres high, ringed with sheer pale cliffs, cracked upright more than
  bedded, greenery spilling over their tops and shrubs along them, a strip
  of beach and palms at its foot by the sea. A gorge cuts through it from
  the waterfall's lowland to the west coast: a dry ravine at its head,
  then a wide river the sea runs into, 20 metres across between walls 27
  apart, with a narrow ledge along the foot of its south wall a little over
  the water, where a path runs down to the restaurant, 島二郎 (see the
  stepping stones, the riverside path and the restaurant above); the place
  is named 渓谷. A ramp climbs onto the tableland north of the gorge from
  beside the waterfall; the high ground south of it is reached only by the
  stepping stones. From there a spur runs out toward the west coast, the
  cave's skylight hidden in the jungle on its top, and ends against the
  terraced outcrop the forbidden cave opens in (see the cave above). The dark mound in the
  north-west stands on the tableland's north side, a little smaller. The
  jungle is replanted over the new ground, its trees standing back from
  the high ground's cliff tops and feet so the white stone shows. Every
  path, the riverside ledge, the ramp's top, the cave's mouth and the sea
  cliffs' headland can be walked to from the festival, and the skylight's
  edge over the stepping stones. The staged sea-cliffs view stands on the
  headland at the cove's mouth looking across it at the cliffs, the stack
  on the left.
  Measured on the dev PC at 1488 x 800: the waterfall frame takes 21 ms,
  the cave's beach 18 and the riverside ledge 16, of which the tableland's
  cliffs and the cave's rock (92,000 triangles) take about 1 to 3 ms where
  they fill the view (not compared with the old island, whose files this
  replaces).
- The island scene costs less to draw, the picture the same. The
  firelight's six lights are in the scene only while something burns:
  everything lit is drawn working out each light in the scene, burning or
  not, so by day they are out of it (the picture is pixel for pixel the
  same; both sets of shaders are compiled while the game loads, so dusk
  no longer stalls on them; the six lights have since given way to the
  light grid, below). The stone painter works its moss, turf and
  damp noise only where they can show. The sun's shadow map is 1536
  texels across where it was 2048, 5.5 cm a texel over its 84 m: in the
  waterfall frame about 2 pixels in 100 change by more than 8 steps in
  255, the soft shadows' edges a touch softer. Measured back to back on
  the dev PC at 1920 x 1200, the scene alone went from 34 to 27 ms on the
  jungle path and from 39 to 32 in the waterfall frame; whole frames at
  three-quarter resolution from 32 to 27 and from 33 to 30. The foliage,
  the biggest share (the canopy near and far and the bushes, about 15 ms
  of the path's scene), and the far canopy's range were measured and left
  as they are: beyond 140 m the far canopy costs about 1 ms and the
  island's vistas need it, and nothing cheaper draws the leaves the same,
  so they are the graphics setting's to trim.
- The festival's stalls are square and roomy, as the film's are: 2.4 m
  deep where they had been 1.5, as deep as they are wide, their fronts
  where they stood (each booth reaches further back), with a work table
  along the back wall and about a metre and a half for its keeper between
  it and the counter. Their header boards run down both sides as well as
  across the front, the scalloped trim along all three, and each stall's
  sign shows on all three boards, as the film repeats it on a stall's
  sides. Each stall has what it sells and the tools it is made with on
  its counter and its table, as its own prop (`goods_<kit>`, from
  `art/blender/stall_goods.py`, placed with the stall by the layout's
  `goods`): two doner spits glowing on the kebab stall's table, its pitas,
  sauces and cutting board; the candy-floss machine's open tub and its
  bags hung along the back; pancakes on the okonomiyaki griddle with
  bottles of water, oil and soy sauce, a box of chopsticks, trays of
  spring onion and red ginger and stacked foam boxes; takoyaki browning in
  their plate; candied apples and chocolate bananas on sticks; jars of
  juice; ramune cooling in a tub of water; a beer server and kegs; fryers;
  charcoal grills of yakitori, squid, scallops and sausages; crêpe and
  baby-castella griddles; rainbow ice cream; an ice shaver and its syrups;
  and the rest, 25 kits in all. Tall things stand to the counter's sides
  and at the back, so the keeper shows over its middle. The goods are
  drawn near, as small props are, about 52,000 triangles over the 28
  stalls: within the GPU timer's noise on the festival street, 0.3 ms on
  the beach row. The street's stalls, banners, bunting, lantern poles and
  baskets stand a metre further inland, so the deeper stalls of the beach
  rows keep a metre from the street's first; the alleys behind the stalls
  begin behind their new backs, and nothing grows within 0.6 m of a stall.
  Only five plants are gone; the rest of the jungle is planted just as
  before. Every keeper can still step up onto the floor behind their
  counter and every customer stand at it.
- The log benches' cut ends can no longer flicker. Their inked rim, pale
  wood and inked growth ring had been discs stacked 2 mm apart, close
  enough that from afar the nearer could flicker with the one behind; now
  they are bands side by side in the end's one flat face, looking just as
  before.
- The village's two round beehive huts are dressed as its other huts are:
  their straw domes hang in three tiers of thatch, each with a ragged,
  wavy hem, under a topknot tied round with rope; thick log posts stand
  round the pale mud wall, with log rails along its foot and top and flat
  stones round its foot; a plank door in a log frame with a lintel and
  a dark C-shaped handle, a step stone before it, small barred windows
  either side, and a potted succulent by the door. No palm grows up
  through them any longer, and no bush under their eaves: the palms and
  bushes planted round the big huts nearby had reached them, and nothing
  now grows within 3 metres of a beehive's middle. Only those four plants
  are gone; the rest of the jungle is planted just as before.
- The paths are trodden only off the sand. The path from the festival's
  plaza to the night beach had been painted across the beach as packed
  earth, which the film look's brushwork drew as a long dark smear; the
  beach is plain sand now, as the film's beaches are, and each path begins
  where the grass does. The jungle is planted just as before.
- The duck ferry is round all over, as the film's is. Where the bow met
  the deck its side had stood up a metre wider within a stride, which left
  a ridge and a dent round the front of the hull; the bow now swells into
  the deck's sides by degrees, and the deck's front edge curves round from
  above. The neck rises from the deck like a vase: its foot flares out in
  a curve onto the deck and the bow, as far as the hull's top lies under
  it, where it had stood in the hull with a crease round it and a lump
  behind. The deck's planks give way to the white softly round it. The
  hull is fused finer and kept so (about 32,000 triangles where it was
  11,000), so it shades as one surface, with no facets showing.
- The island has the film's look. The land is painted without lines, as
  the film's backgrounds are, while the characters, their outfits and held
  props, the duck ferry and everything made keep the pen. Sunlight is
  warm and the side turned from it cool blue, through a soft painted light
  ramp in place of the toon's three steps; the rocks, trees, houses, stalls
  and the ferry cast the sun's shadows round the camera; tree crowns and the
  jungle on the rocks are painted in leaf clusters lit on top, their edges
  broken into clusters; characters walking under the trees go dark and warm
  in their shade, as in the film's jungle; haze thickens into the distance,
  the brightest light (the sky, the waterfall) glows softly, and a colour
  grade finishes the picture. The earlier toon look, with the pen on
  everything, comes back with `toon` in the address (`?dev&toon`), for
  comparing the two while the film look is finished. On this PC (Radeon
  780M, 925 x 500) a frame at the waterfall takes about 11 ms, against 4 ms
  in the toon look: 5.5 ms of it the finishing passes (smoothing, glow and
  grade) and 1.4 ms the shadows. Not yet tried on a phone.
- The film look's detail, checked side by side with the film's waterfall
  frame. Stone is painted as the film paints it: limestone in tall upright
  slabs, bedded rock in long low blocks, each its own shade with flat
  patches of stain and streaks running down, a lit lip along its top and
  dark cracks round it that wander and taper; moss grows in clumps on what
  faces up and where the rock is mossy, painted as cushions lit along their
  tops. The waterfall's wall is hung with leafier vines and six curtains of
  hanging moss. Tree crowns and the jungle on the rocks are painted in round
  puffs of leaves overlapping like scales, each yellower toward the sun and
  bluer away from it; the crown opens between them at its edge and
  underneath, so the canopy over the waterfall's bank reads as leaves
  against the light. Bark is furrowed, lit warm orange on the sun's side and
  mossed on top; the big trees hang aerial roots. The waterfall is a veil of
  fine streaks the rock shows through at its sides, with soft mist where it
  lands, and the pool mirrors the rock and trees round it, darker and
  greener. The sun comes through the gaps between the leaves in dapples on
  the ground and the rock, the sky is paler and hazier, and shafts of
  sunlight slant into the waterfall's clearing. A frame at the waterfall now
  takes about 13.4 ms on this PC. Every plant had been sharing one compiled
  shader, so the crowns had never been painted in clusters; each kind now
  compiles its own.
- The film look's colour and leaves, measured against the film's waterfall
  frame. The grade is warmer through the darks and the middle (the pale sky
  left alone), its greens lean toward yellow and it has a fifth more
  contrast, bringing the frame's average colour and the hue of its greens
  within a few points of the film's; characters in the trees' shade keep
  the film's olive beige. Each plant's leaves now carry where on the leaf
  every point is, so they are painted as the film paints them: lighter
  toward the tip, with a midrib and side veins rising from it (lighter on
  green leaves, darker on the red ti), a monstera's splits cut in from its
  edge and a frond's leaflets parting toward its edge. More plants crowd the
  waterfall's pool, as in the frame: big monstera, red ti and cycads close in
  at the left, arching cycad fronds, white flowers and a cluster of
  bromeliads round the mossy stump at the right, ferns, monstera and ti in
  the far corners against the rock, and the ring of plants round the pool is
  a third denser. The cuts go through the picture's smoothing (alpha to
  coverage) rather than throwing points away, which kept the depth test
  that skips leaves hidden behind others: thrown away, a frame at the
  waterfall took 35 to 120 ms; now it takes about 17 ms on this PC.
- The film look's haze and the jungle's floor. By day the sky is brighter
  than white toward the sun and low down, so its light glows round the
  trees standing against it, and the haze thickens sooner, fading far
  trees and pillars into the pale sky. Under the canopy the floor is
  crowded as in the film's jungle: about four times as many ferns,
  monstera, cycads, ti plants, bromeliads and flowering bushes, larger than
  before and with more of the big-leaved kinds, on a dark olive, earthy
  floor; palms fill the gaps the canopy leaves (the canopy is planted
  first, about a thousand crowns), standing a few metres from the trees'
  trunks as well as along the beaches.
- The film look's brushwork: a last pass over the scenery as rendered
  gives each point the average colour of whichever corner of the patch
  round it is most even (a Kuwahara filter), so fine render detail settles
  into flat painted shapes with sharp edges between them, as the film's
  backgrounds are painted. Characters mark themselves in the picture's
  alpha and are left as drawn, so their lines stay crisp. It costs under a
  millisecond a frame on this PC. The waterfall's wall has nine curtains of
  hanging moss, and forty ferns and small plants grow out of its ledges and
  cracks. A frame in the jungle takes about 15.7 ms on this PC.
- The film look's depth of field: what hangs nearest the camera (closer
  than about three and a half metres) goes soft, as the film blurs the
  leaves nearest its camera, while the rest stays sharp, the characters
  always. At the waterfall, as in its frame: two more trees close the
  canopy over the bank, so the foreground lies in shade; the sky is paler;
  the bromeliads crown a tall mossy rock in the water just behind where
  the cast stands, beside the big tree, and the white flowers sit in the
  bank's near right corner. About 16.7 ms a frame there on this PC.
- The film look's shade under the trees. The trees' crowns hide the sky's
  light from what lies under them: under a closed canopy the jungle's
  floor, its plants and the trunks get under a third of it, a little more
  in a gap and toward the jungle's edge, so the jungle lies in deep shade
  with the sun's dapples bright on it, as in the film; the crowns' tops,
  the beaches and the clearings are lit as before. The crowns' shadows are
  fuller, so the sun comes through only where the leaves part widely. At
  the waterfall, as in its frame, the bank in front of the cast is dark
  against the sunlit fall, one of the trees over it now standing at the
  left over the plants there. The waterfall is wider and softer: finer
  streaks thinning away at its sides, white and glowing over the lip,
  misting where it lands in a bigger cloud of spray, no longer burned out
  to white; the sky's glow is set to the frame's. The wall has fourteen
  curtains of hanging moss and ninety ferns and small plants on its ledges,
  and bark has patches of pale lichen. Measured against the frame, the sky,
  the lip, the canopy, the ground and the frame's average brightness are
  within a few points of the film's. About 16.6 ms a frame at the waterfall
  and 16.7 ms in the jungle on this PC.
- The waterfall's sides, after its frame. On the right the stump by the
  big tree is pale limestone, mossy only on top, crowned with the film's
  showy bromeliads, stars of long pink, red, orange and yellow bracts
  standing out of their green, a cycad's fronds arching over them from
  behind; the big trees' bark is a paler tan. At the far left a low tree
  and big monstera, cycads and ferns fill the view where the pale foot of
  the pillar showed between the trunks. Low limestone, down in the jungle's
  damp, is filmed green in broad soft patches, darkening the waterfall's
  wall toward the film's mossy rock, and the falling water's body is
  greyer. A warm haze glows round the top of the falling water, softening
  the crowns over the wall into the light (a ball of haze worked into every
  material's fog; it fades away as the camera draws off). The plants at the
  waterfall's left now measure as the film's, and its wall and falling
  water are a step nearer. About 16.6 ms a frame at the waterfall and
  16.7 ms in the jungle on this PC.
- The film look's open sky. Looking out to sea, the sky's glow had washed
  everything near the horizon to white: the sky brighter than white
  belongs under the trees, as the film exposes for where its camera is.
  Seen from under the canopy the sky still glows round the trees; out in
  the open, on the beaches, the sea and in the clearings, it is the plain
  pale blue of the film's open skies, with white clouds, the deep blue sea
  out to the horizon and a soft glow only round the sun. The sky eases
  between the two as the camera goes in and out of the trees.
- Cycads after the film's, round its village and in its jungle: a short,
  thick trunk of overlapping scales, closed over on top by a woolly crown,
  and a fountain of twelve stiff feathery fronds, the inner ones standing
  up, the outer arching out and down at their tips. They had been a thin
  six-sided tube, open at the top so it looked hollow, under seven broad
  fronds. The rest of the jungle grows as before. A frame in the jungle
  takes about 17.8 ms on this PC.
- Canopy trees after the film's: each tree's head is heaped of rounded
  leafy lobes like a cauliflower's, bumpy all round its outline, on a
  taller trunk forking into limbs glimpsed between the lobes, where it had
  been one smooth dome over a thin trunk, like a mushroom; the big trees'
  heads are heaped the same way, and the far version keeps the bumps. The
  jungle's outermost metres, and those round the village's huts and the
  festival's stalls, are left to palms, as where the film's jungle meets
  its beaches and village; palms have a fuller head of long fronds
  drooping all round, two young ones standing up in the middle. The trees'
  and palms' shapes now grow from generators of their own, so changing
  them no longer moves the jungle round. About 16.3 ms a frame on the
  festival street, 16.5 ms in the village, 16.9 ms at the waterfall and
  18.3 ms in the jungle on this PC. The plants' file is about 6 MB (the
  canopy no longer carries leaf coordinates it has no use for), and the
  offline cache now keeps files up to 8 MB.
- The film look's nights, measured on the film's moonlit beach: the
  picture is painted in blues, each colour drawn by its brightness toward
  a blue that deepens in the darks (nothing goes black) and pales to white
  in the lights, firelight and lit windows keeping their warmth and the
  characters most of their own colours. The night sky is a royal blue,
  the clouds only a little lighter than it, and the sea a deep blue under
  the moon's road, where it had glowed turquoise. Dusk and dawn are as
  they were.
- The film look's open skies are the deeper blue of the film's open
  frames: the sky's pale haze, like its glow, now belongs under the trees.
- The village after the film's: its huts' thatch is painted in rows of
  straw, each row's ragged edge a dark line over the one below, where the
  roofs had been smooth brown domes; the clearing is sandy earth with a
  few patches of grass, where it had been mostly lawn; and the huts stand
  among flowering bushes, cycads, monstera, ferns and red ti, with palms
  over them.
- The film look's jungle depth: what lies deep under the trees fades with
  distance into a soft teal haze, golden toward the sun, as the film
  paints its jungle's layers and the jungle seen from its village; what is
  near stays dark and clear, and the open, and a clearing seen through
  the trees, stay clear (the depth-of-field pass reads the scene's depth
  and the trees' cover where each point lies).
- The jungle's trunks are a pale olive tan, as in the film's jungle
  frames, and its flowering bushes are thick with flowers. The
  understory's shapes now grow from a generator of their own, so changing
  them no longer moves the jungle round.
- The film look's clouds are its skies' clouds, where they had been eight
  copies of one flat cut-out low on the horizon. Some forty of them stand
  all round the sky and up overhead, each of its own shape: cumulus
  heaped of round lobes like a cauliflower, a few of them towering, round
  puffs high up and long flat banks along the horizon. Each lobe is
  shaded as a ball toward the sun, white where the light finds it and a
  pale sky-blue in its shade (measured on the film's sea cliffs frame),
  the lobes folding softly into one another with no seam between them,
  the cloud's flat base soft and in light shade, the low ones paling into
  the horizon's haze. The hour colours them (gold in the golden hour,
  rose and violet at dusk, moonlit navy at night), and seen from under the
  trees they are lost in the sky's pale glow, as in the film's jungle
  frames. Seen from high above, round clouds float below the camera where
  the film's aerial shot has them, their shadows dark on the sea. No
  measurable cost a frame from the ground on the dev PC; about 1.5 ms in
  the high aerial view.
- At the waterfall, as in its frame, a leafy bough hangs down out of the
  bank's trees close over the cast, dark and softened by the depth of
  field, framing the top left.
- The film look's sea, measured against the film's sea cliffs, boat and
  aerial frames: seen across it from the shore it is a deeper teal, most
  of all where it is deep, and it pales into the distance toward a hazy
  blue at the horizon (between its deep blue and the hour's sky) where it
  had stayed dark navy right up to it; seen from above, the lagoon is
  still bright turquoise over its sand.
- The film look's sea painted as the film paints its water, where it had
  been one flat colour by its depth. Seen across it from the shore, the sky
  catches in its ripples in broken flat patches, long nearby and finer
  toward the horizon, as in the film's frame of the bay from the water, in
  the sky's colours of the hour (golden in the golden hour). The sun
  glitters on it in flecks a little wider than they are tall, a few
  anywhere and thick along its path toward the sun, a glittering road
  under the low sun of the late afternoon, bright enough for the glow to
  halo them; the brushwork leaves them crisp. Seen from above, the sun is
  netted in fine bright lines on the sand under the shallows, as round
  the film's pier. What stands between the water and the sun shades it:
  the pier, its posts, the ferry, the sea cliffs and the sea stack. Whoever
  wades in it has foam round their legs where the water meets them and
  broken rings spreading out from them, each staying where it was made as
  they walk on and turn (at first each frame drew them round where they
  stood, pushed back along the way they were going, so that they swung
  round after them as they turned, which the user saw). The
  waterfall's pool stays as still as the film's, its ripples catching
  hardly any of the sky, the sun glittering on it only where it falls
  through the trees. By night only the shade and the rings show, and the
  moon's road is as it was. The open sea no longer looks for the floor's
  slope, which only the surf and the bands along the shore need, so a
  frame costs the same as before within the measuring noise in most views
  (from 0.9 ms less to 0.3 ms more, at 1024 x 768 on the dev PC), and up to
  about 1 ms more with the screen full of shallow water seen from above;
  the glitter and the net on the sand are about half of that, and a
  graphics setting can take either out of the water's shader (GLITTER,
  CAUSTICS). The island's and the cave's dark tests pass, and the island's
  by night and by day with the cast wading too.
- What stands in the calm water or by it shows in it, as real water shows
  it: whoever wades in the shallows or stands on the pier, the pier and the
  quay themselves, the ferry, and in the waterfall's pool whoever wades at
  its edge. Faint seen from above and more the further across the water it
  is seen, shifted about and smeared toward the eye by the ripples, broken
  by them into drifting strokes, with much of the water's colour in it:
  never a crisp mirror (a first try mirrored faces and blushes, which the
  user found too much). It is drawn each frame by a camera under the water
  into a picture half the frame's size, of only those things (the cast
  without their lines or shadows, and a copy of the pier and the quay of
  its own, as they are joined with the festival's stalls for drawing), and
  not at all unless the mirror image of one of them could be in view;
  those of the cast more than a couple of metres from the water are left
  out. About 0.05 to 0.3 ms for the mirror (1024 x 768 on the dev PC), the
  whole frame within the measuring noise but by the pier (0.4 ms more).
  The Test panel's 表示 has 水面の映りこみ to turn it off and on. The
  waterfall's pool now captures what it mirrors a face of its cube at a
  time, and only with the camera within 120 metres of it: all six at once
  had cost about 12.6 ms in one frame every half an hour of the island's
  day, wherever the camera was; a face is 1.4 to 4.9 ms. The pool looks as
  it did, and the dark tests pass with the mirror drawn.
- The film look's sea in the film's colours seen from above, where it had
  been a pale, washed-out mint (124, 255, 225, its green running past
  white), brightest and most saturated right at the sand, and blue nowhere
  near the island. Its lagoon is the richer turquoise of the film's aerial
  shot (53, 211, 176 against the frame's 59, 209, 170), pale and clear only
  over its first half metre at the sand's edge, as the film paints shallow
  water over its sand, and azure from a couple of metres down (41, 111, 197
  against 37, 124, 218 on the film's beach seen from above). Seen across
  from the shore it is as it was, as it already matched the film's beach
  frames, and so are the waterfall's pool and the toon look's sea. The
  sun's glitter seen from high above is a quarter as thick, where it had
  salted the water white. The sliver of ground showing under the water at
  its edge takes the new edge colour. The dark tests pass.
- The forbidden cave's water rings as the sea does. Whoever wades in it has
  foam round their legs where it meets them and broken rings spreading out
  from them. Round the boat afloat, foam laps along its sides, heaped at its
  bow as it goes ahead; its wake opens behind it in a wavering V, and rings
  trail it, fewer as it slows. Where an oar's blade goes in and where it
  comes out, a small ring, and a splash while it dips. Every ring stays
  where it was made, and the wake is the waves the bow made all along its
  way spreading out from where they were made, so as the boat turns its V
  bends after it, its far end fading, where it had swung round with the
  boat like a tail. They catch the light that falls on them there (the
  lake's glow, the torches', the sun's or the moon's down the skylight's
  well, the openings' sky, the cave's own dark) over the water's own, so
  they show pale on the glow and in a torch's pool and faint in the dark,
  and not at all with the cave's lights out. Drawing the cave's water
  filling the screen costs about 0.2 ms more with two of the cast wading
  and 0.5 ms with the boat rowing close by (1024 x 768 on the dev PC; the
  measuring noise is about 0.1 ms); the wake that follows the boat's way
  is about half of that, and nothing of any of them is worked out away
  from where they are. Both dark tests pass, and the cave's by day and by
  night with two of the cast wading and with the boat rowing round a turn,
  its wake and its rings out.
- The sea cliffs after the film's frame: their sandstone is a pale, quiet
  cream with tan beds, painted in long beds with few joints and little
  stain where it had read as a brick wall; tufts of leaves sit on the
  ledges where a bed juts out past the one above, and curtains of
  creepers hang over the lip of the tall cliffs, straight down past the
  beds' steps. The sea stack is a rounded, lumpy tooth of pale stone,
  wider at its foot. Grass on a rock's flat top is left as grass, no
  longer cracked like stone.
- The jungle on the rocks' tops is heaped of rounded leafy lobes, as the
  film paints it, like the trees: the great dome of trees on the mesa west
  of the waterfall had still been one smooth ball. That dome is now as the
  film's aerial shot has it, a cap of greenery on a tall block of pale
  stone that shows clear below it: the stone stands 12 metres higher, its
  cap is one broad, lobed mass overhanging its edge all round (as is the
  dark mound's in the north-west), with less hanging down over the stone,
  and trees at the foot of any rock but round the waterfall's pool grow a
  little shorter, so the stone shows above the jungle. The mesa keeps the
  footprint it had, so the jungle round it, and the waterfall's frame,
  are as they were. About 16.7 ms a frame
  at the waterfall, 13 ms at the sea cliffs and 10 ms on the beach on this
  PC.
- The island's ground rises steadily from the beach to the waterfall in
  its middle, where it had been a low belt round the coast and a plateau
  inland, met in steep banks. The village's clearing lies lower, at 3.5
  metres where it stood at 8: the way up from the festival's street climbs
  3 metres over about 20, where it had climbed more than 7 over 12 (up to
  42 degrees), and on from the village to the waterfall's bank it climbs
  evenly, nowhere steeper than about 16 degrees. Each tall pillar stands in
  a wide, gentle slope of its own, where neighbouring pillars' steep mounds
  had piled up into a high plateau in the east. Ground steeper than 27
  degrees has gone from 15% of the land to 3%. The beaches, the
  festival's level ground, the sea cliffs and the ground round the
  waterfall's pool are as they were, and the jungle is planted where it
  was, so the waterfall's frame is unchanged.
- Grass and earth painted the film's way, where the ground had been flat
  colour up close. The lawn is clumps of grass, light yellow-green patches
  with sharp blade tips along their tops over a plain green, the nearer
  over the farther, small near the camera and larger on into the middle
  distance, dark in the trees' shade. Packed earth (the paths, the
  village's clearing and the festival's street) has long soft sweeps of
  the brush, broad smudges and a scatter of pebbles, darker toward its
  edges. Where grass meets earth or sand, the border follows the clumps'
  tufted outlines, and tufts of deeper green grass line the paths'
  edges; patches of clover grow beside the paths and at the feet of the
  trees near them. The village's patches of grass are a deeper green,
  mostly round its clearing's edge, where they had been bright lime
  splashes. The build writes where grass, earth and sand lie beside the
  colour map; the waterfall's frame and its bank are as they were. The
  painting costs under 0.1 ms a frame on the dev PC.
- The ground at the rocks' feet as the film paints it, where a flat ring
  of pale grey two or three metres wide had lain round every rock, and a
  band of white pebbles round those on the beach. The ground runs right up
  to each rock now, grass to the foot of the pillars and cliffs as round
  the film's (`parkour stone landmark 3`), sand to the cave's rock as in
  `cave entrance 3`: darker and damp close in, mossy in the grass and
  gritty in the sand, ragged, with stones fallen from the rock lying about
  on it, thickest close in and in clusters, a few further out. Each stone
  is pale and rounded, lit along its sunward side, darker along the other,
  with a soft shadow beside it; the build writes how thickly they lie
  beside the colour map, and the film look paints them. The steep ground
  under the high ground's cliffs and down the gorge's walls is broken
  stone in the rock's own greys, brushed and with stones on it, where it
  had been flat grey. The stones cost at most about 0.2 ms a frame on the
  dev PC, where they fill the view.
- The paths as trodden, not ruled: each rounds its corners, wanders a
  little from side to side, swells and narrows, its edges ragged where the
  grass creeps in over them in tufts, worn paler down the middle and
  darker toward its edges, a warmer earth, as the film's jungle paths are
  (`jungle 6`). A path through the trees' shade stays a path, only
  shaded: painted over with the jungle's floor, it had ended in a point
  wherever the shade crossed it, as the path north to the sea cliffs by
  the bay did. The tufts and the clover along the paths follow their
  edges as trodden; the jungle is planted where it was (every tree and
  palm in its place), but for 112 small plants that would now stand on a
  path. A path stops where it meets the festival's ground or the village's
  clearing, rather than painting its end over them: the end of the path
  north from the festival's street had shown as a brown spot on its sand.
- The bushes along the tall cliffs' tops (the gorge's rims, round the high
  ground and the spur, the sea cliffs) are leafy now, where they had been a
  row of smooth green balls: each heaped of rounded lobes and painted as
  the jungle on the rocks' tops is, of every size, in clumps of a few to a
  dozen with grass between, some set back from the edge and some leaning
  out over it, an odd big one. The clumps on the ledges down the cliffs'
  faces are leafy too, where they had been strings of round beads, one
  after another all along a ledge: low cushions heaped of rounded lobes,
  wider than they are tall, about one in three spilling a lobe over the
  ledge's lip, growing in runs along the ledges with bare rock between.
  They are painted in puffs of leaves as the bushes on the tops are, but
  smaller puffs (0.75 m against 1.9) and fuller ones, so that a clump
  breaks into leaves only at its edge: in the crowns' big puffs these
  small cushions, seen from the side or from the boat below, had opened
  into tatters. The curtains of creepers hang as they did. About 11,100
  triangles more over the whole island (5,900 for the bushes along the
  tops, 5,200 for the clumps on the ledges).
- The gorge's dry head, between the river's end and its mouth onto the
  lowland by the waterfall, is choked by a rockfall: blocks of the gorge's
  white limestone fallen from its walls, split flat on their sides and
  tumbled wall to wall in three layers up to nearly 10 metres (the rims
  stand at 11), moss in patches on some, a few smaller ones at its foot
  and spilling out of the mouth, the ground round them damp and strewn
  with fallen stones. It stands back, clear of the stepping stones, and
  the river runs on to its foot, 6 metres further than it did, its bed
  shelving up under the first blocks so the water meets the rocks; the
  riverside path along the south wall reaches it. No one walks into the
  gorge that way any more: the path from the waterfall's bank ends at the
  rocks, and the riverside path and 島二郎 are reached the long way, up the
  ramp onto the high ground north of the gorge, across it and down by the
  west coast, about 470 metres from the festival's street where the way
  through the ravine was about 350. The 24 trees, 4 palms and 142 small
  plants that grew where it and the water now lie are gone; everything
  planted round it stands as it was, but for a clump of trees at the mouth
  that lost a tree to it. The camera may pass over a bare rock lower than
  it, as over this heap from the rims; it had been kept out of every
  rock's foot at any height. About 12,000 triangles more over the whole
  island (16,300 for the blocks, less 4,300 for the plants gone) and 70 KB
  more to download.
- Evenings and nights lit the film's way, where night had been one flat
  blue wash and the island's lights lit nothing. The tiki torches burn in
  big cartoon flames, a pale yellow heart with tongues of orange licking
  and wavering above it, twice the size they were; they, the lit windows
  and the lanterns glow, and light what stands round them warm,
  flickering: the ground and the stage round the village's torches flood
  orange, and anyone standing near them is firelit a warm cream against
  the night's blue. By night the land is painted in the film's royal blue
  (see below); open ground and clearings lie pale in the moonlight under
  the dark of the trees. What is colourful keeps its own colour under the
  night's blue, only darker and bluer (a red stall stays red, a blue one
  blue). The moon
  glows in a wide halo in a sky thick with pale cyan stars, and rims the
  very edges of leaves, trunks and rocks that turn toward it in cool
  cyan. The golden hour floods the jungle with golden light: everything
  warmer, the sky glowing gold seen from under the trees, and the
  jungle's haze gold over much of the way toward the low sun and a thin
  amber elsewhere; from then on through the dusk the haze takes the
  sky's own colours and thins as the light goes, so the evening jungle
  never fills with a green fog. The sunlight in the waterfall's clearing is gone after dark
  (it had shone on at midnight) and turns gold in the golden hour; the
  sea darkens with the sky at sunset, and dusk passes through the film's
  cool steel blue before the night. Under half a millisecond more a frame
  at night on the dev PC, and no measurable cost by day.
- Nights in the film's royal blue, where they had lain under a murky
  layer: grey and dim, the jungle olive and teal, the darks violet, the
  sand a grey lilac (the user set the game's view down the cave's skylight
  beside the film's frame of it). Each colour is now painted by its
  brightness onto one blue measured on the film's night frames (the
  skylight from above, the night jungle, the riverside path, the way to
  島二郎, the cave's beach under the moon): a deep navy in the shadows,
  never black, cobalt through the middle, a bright azure where the moon
  falls and a pale blue white in the lights, with little red in any of it.
  The jungle's leaves keep a hint of teal or violet, the sand is a
  moonlit blue, and the cast glow a pale blue white, as the film draws
  them at night. Firelight and lit windows keep their warmth out to the
  dim edges of their pools on the ground, a stall most of its colour, the
  sky and the sea theirs. The sky's light at night is stronger (1.0 where
  it was 0.42), so rock, leaves and pebbles in the shade still show their
  shapes. Seen down the skylight, the jungle round it went from a mean
  colour of (28, 49, 79) to (14, 62, 136), the film's (13, 46, 116). The
  cast had never kept their own colours at night as meant: the brushwork
  pass dropped the mark that tells them from the scenery before the grade
  could read it; it keeps it now. Nothing changes by day: the same frames
  by day, in the golden hour and at dawn are the same to the pixel.
- Trees and leaves at night are a dark green navy, darker than the sand
  and rock round them, as the film's (the user: its trees are darker, and
  greener). They had come out a bright cobalt, about twice as bright as the
  film's from above, the moonlit tops of the crowns painted as bright as
  open sand. Seen down the skylight, the crowns round it went from a
  brightness of 0.53 to 0.60 to 0.36 to 0.39, the film's 0.29 to 0.37,
  and lean a little teal; the jungle seen from within it was already the
  film's and hardly changes. Sand, rock, houses, stalls, the lights and the
  cast are as they were.
- Seven more tiki torches light the village at night, where away from
  the stage it lay dark (the user: too dark): two on the plaza, on its
  west side and at its south edge where the path comes in, one between
  the lane's two northern huts, one in the plank huts' yard, one where the
  path north leaves the plaza and two along the guest houses' path. Each
  throws the warm pool the stage's torches do, the moon's blue between
  them. They stand on open sand clear of the plants and out of the film's
  frames of the lane and the guest house, so the lane's, lit from the
  side, keeps its view through to the sea. By day the island's eighteen
  test views are the same to the pixel but for a torch far off in the
  plaza's, the festival's and the street's, and one torch's shadow in the
  plank huts' yard; the jungle grows as it did, the torches being left out
  of its planting as the festival's stalls are.
- The festival's stalls are the film's booths: where they were boxes 3.3
  metres high, each is now a booth 2.4 metres wide on four thin posts
  under a flat roof 2.75 metres up. A deep header board runs across its
  front for its name, about three times as long as it is deep, its sign
  covering its whole face, with a scalloped trim along its bottom (white,
  yellow or blue) and six paper lanterns hanging under it. At its back is
  a wall of upright stripes in two warm shades, and across its front a
  counter as tall as a customer standing at it, 0.9 metres, long and low
  as the film's, framed in pale grey, with white menu tags hanging off it
  and cups and a jar on top. Its keeper stands behind the counter on a
  raised plank floor two steps up, a step at each open side, so their
  head shows over the counter, as the film's islanders do, the board
  above them.
- The stalls can be walked into, to keep them: each booth is open at its
  sides behind the counter, with about a metre clear between the counter
  and the back wall and a metre between neighbouring booths, so its
  keeper walks in from the alley behind its row, steps up onto the floor
  and stands behind the counter, and a customer can walk up to the middle
  of every counter. This was checked for every stall with the game's own
  walking. The poles along the street stand at the fronts of the gaps
  between the booths, clear of the way in.
- The festival's signs in the film's proportions, measured on its arch and
  street frames. The welcome arch's board is deep, a fifth as deep as it
  is long where it had been a tenth, its top level with the poles' tops,
  which stand higher (6.4 metres), its banner's foot level with the
  stalls' tops. Big round yellow flowers are packed two
  deep along its top and along its bottom, clustering over its ends and
  trailing down the poles, with the pink lanterns stacked below them.
  The white banners are narrower and much deeper: the arch's
  ウェルカム・トゥ・シマ and the street's いらっしゃいませ!! and たのしんでね
  are each four or five times as wide as they are deep, where they had
  been sixteen. They no longer reach the poles but are tied to them by
  dark ropes at their corners, wound round the poles, as in the film.
- Bunting runs along both sides of the street, as in the film's street
  frame. Tall poles stand at the fronts of the gaps between the stalls and
  at the street's two ends, with two strings of flags sagging from each to
  the next and a paper lantern in each span, lit at night. The street's
  banners and the bunting across it are tied to these poles.
- The villagers' huts are roomier inside and furnished as islanders'
  homes, all in the village's own materials (wood, woven straw and
  rattan, clay, stone and bamboo, nothing modern): the stilt huts' rooms
  5.6 by 4.4 metres where they were 4.6 by 3.6, the plank huts' 5.2 by 4.2,
  under a little higher walls and wider roofs, still clear of their
  neighbours and of the jungle round them (planted just as before). Each
  has a log bed with knobbed corner posts, a woven rattan headboard and a
  footboard of spindles, a thick futon under a patchwork quilt with a sheet
  turned down over it, two plump pillows and a folded blanket at its foot,
  a chest at the bed's foot; a plank bookshelf
  of books, scrolls and a jar; a kitchen of a clay stove with a pot, a
  counter with a stone basin for a sink, fed by a bamboo pipe down the
  wall, a shelf of bowls and a clay water jar; a low round table with a
  teapot and cups and cushions round it on a woven rug; a paper lantern
  that lights the room at night; and a potted plant by the door. Walkers
  go round the furniture (checked with the game's own walking); the camera
  looks over it.
- The villagers' huts outside, after the film's frame of a hut's porch:
  the stilt huts' walls are shingled all over in overlapping round scales
  (greens, now and then an orange one, on the green huts; warm colours on
  the others) between thick log posts and round log rails along their
  foot, under their windows and along their top. Their windows are taller,
  in heavy board frames with deep sills, two thin bars down the green
  panes and a double white zigzag over them. A double plank door stands
  open, its leaves swung right back flat against the inside of the front
  wall either side of the doorway, each with a dark C-shaped handle. The
  porch has no railing, as the film's, its planks on a thick log edge, its
  log steps chunky, and on it stand the film's potted plants: a gnarled
  succulent in a terracotta pot and purple thistles in a round clay pot.
  The plank huts have the same heavier posts, rails, windows, handle and
  pots. About 0.2 to 0.3 ms more a frame in the village on the dev PC.
- The houses are lit at night by their lanterns, not their windows. A
  window had been a glowing block of glass, lit the same from inside and
  out, and the house's light hung in the middle of its windows. Now each
  room's paper lantern is its light, warm on the walls and furniture from
  where it hangs (a lamp of its own, brighter than the festival's lanterns
  and reaching little past the room), and the guest houses hang one from
  the ridge. Close up the windows are clear, inside and out: from inside
  you look out at the night through the bars and zigzags, and from the
  porch into the lit room. Further off a pane fades in to a warm glow,
  which stands in for the lit room (since the light grid, below, from 24
  to 32 metres, where the rooms' insides stop being drawn). The guest
  houses' gable and roof windows are cut through, so they too show the
  lit roof inside or the sky beyond. No measurable cost a frame (the night
  village, inside and out, about 11 to 13 ms before and after on the dev
  PC).
- Every light lights what it reaches at night, from any distance. Only
  the six lights nearest the camera had lit anything (of 51: four
  torches, 37 lanterns, ten room lanterns), so from about 40 metres the
  plaza's torches lit nothing, and where lanterns stand close together,
  along the festival's street, the six dimmed one another to almost
  nothing and left the street moon-blue. A grid over the island now
  lists which lights reach each two-metre patch, and everything lit (the
  ground, plants, rocks, houses, stalls) takes the few that reach it,
  with the same falloff as before. A room's lantern lights only its room,
  and its light, coming back off the walls, fills the room softly; it
  had lit the porch, the steps, the eaves and the sand round the hut
  through the walls and floor, and left the room itself murky. The
  windows' glass is clear as far off as the rooms are drawn (about 30
  metres), showing the lit room, and beyond that a calmer stand-in, short
  of the glow: the old one measured over three times as bright as the
  room it stood for. Measured at 1920 x 1440 on the dev PC in five night
  views, in one session: the six lights cost 1.9 to 2.8 ms a frame where
  there was firelight, the grid within the measuring noise (about 0.3 ms
  on average where the lanterns are thickest). The game no longer
  compiles a second set of shaders for the lights while it loads. How the
  firelight falls on the characters is below.
- The lanterns light a warm pool round where they hang, the night blue
  between the pools. With every lantern lighting at once, the festival's
  street had turned orange from end to end, more evening than night; a
  lantern now shines at three fifths of its old strength and reaches 6
  metres where it reached 8. Chosen from three settings side by side at
  21:00, in the player's view into the street and from above: what the
  lanterns add to the street's mean colour fell from 56 steps of red in
  255 to 24, the stalls staying warm. The torches and the rooms' lanterns
  are as they were.
- The firelight lights the characters from its side, as the film lights
  its cast by the fire (`chiikawa 6`). They had been warmed evenly all
  over, their backs as much as their faces, through walls, and with a
  round shadow straight down whatever the light. Now the four strongest
  lights reaching someone each warm the side turned toward them, through
  a soft edge, to a warm cream; the side turned away keeps the night's
  blue, the darker the stronger the fire, as the film exposes for its
  fire: lit by one torch from the side, Chiikawa's far side measures 114,
  120, 163 against the near side's 255, 242, 231, the film's frame 114,
  118, 133 against 244, 231, 215 (ours bluer, as our nights are). A
  wall, a roof, a rock or a stall between a light and someone shuts it
  out, coming and going softly as they pass (a pole or a post, too
  slender to shade someone whole, does not); a room's lantern lights only
  who is in its room, where its light, coming back off the walls, warms
  them all round, as it does the room. Each character's shadow from the
  strongest light leans away from it along the ground, longer the lower
  and further off the light. The lights and walls for all eleven
  characters take about 0.15 ms a frame on the dev PC in the festival's
  street, where every one of them has four. By day nothing changes.
- A house's lantern lights its room as it would really light it, baked
  into the house in Blender with Cycles: its light falls off across the
  walls and the floor, the corners and the ceiling away from it go dark,
  the floor is shadowed under the table, the bed and the shelves, and the
  light comes back off the wood as warm as the wood is. A room's light had
  been even all over, a flat fill with no shadows and no dark corners.
  The lantern burns twice as bright for it, so the side of the room it
  lights stays as warm as before while the rest falls away: inside a stilt
  hut at 21:00, the wall by the lantern measures 134 against 146 before,
  the wall across the room 75 against 115, the floor in the room's far
  half 109 against 170 (mean red, 0 to 255). Its light also leaves the
  house through the windows and the doorway, as it had not: onto the
  porch and the steps in the bake, then out over the sand, the paths and
  the plants, from any distance (from above the village, 85 metres off,
  each house throws its fans of light onto the sand). What stands in its
  way inside cuts it as the bake found: the windows' zigzag lattice falls
  on the sand in stripes. The stilt huts' door leaves had stood open into
  the room, the left one between the lantern over the table and the
  doorway, and kept all but a sliver of the doorway's light in; they now
  swing right back flat against the inside of the front wall (each 6 cm
  narrower, 0.58 m, so it ends short of the window beside it), and every
  house's doorway throws its full beam across the porch and down onto
  the sand: on a stilt hut's porch before the door the bake now adds 23
  steps of red in 255 where it added 3. Whoever stands in a doorway's or
  window's light is warmed by it from its side, about as much as by a
  festival lantern a metre and a half away. Blender bakes each house
  twice: a quick pass finds the faces the lantern reaches, and only those
  share the house's 512-texel map, at about 2.5 cm a texel (15 cm when
  every shingle outside took its share). The five maps come to 1.4 MB. By
  day nothing changes (not a pixel differs), nor in the toon look. About
  0.5 ms a frame for the bake and 1 ms for the light out of the houses, at
  1906 x 1562 on the dev PC in the lane between the stilt huts, within the
  measuring noise.
- The sun and the moon can be seen. They had always been in the sky, and
  they light the island and cast its shadows, but the camera, looking down
  at the player through its narrow lens, saw only 6 degrees above the
  horizon (14 tilted all the way): the sun was in sight only in the first
  and last 20 minutes of daylight, about 40 seconds a day, and the moon at
  full night never. Dragging the camera on down past level with the player
  now turns its gaze up, as far as 66 degrees above the horizon, the player
  out of the frame below. The sun is a round disc, as the film paints it
  (the user's frame of it): high in the day, white, soft at its edge, in a
  ring of pale cream fading through a faint green into the sky's blue
  (measured against the frame, cream 245, 248, 221 just past its edge
  against 248, 248, 238, the sky at half its width out 205, 241, 235
  against 201, 228, 231); the open sky round it no longer blooms, so the
  white stops at its edge. Low in the sky it burns gold in the golden hour
  and orange as it sets, glowing, the sea's horizon cutting it; in the
  toon look it is outlined with the pen. It had been a soft white spot that
  bloomed into a shapeless glow. The full moon now passes over the
  forbidden cave's skylight. It climbs slowly through the evening (5
  degrees up at 19:00,
  37.5 at 21:00, much as before, so the film-matched night views at 21:00
  to 21:30 measure the same, their mean colours unchanged) and rides high
  toward midnight, 75 degrees up in the south at its highest where it had
  been 55. From the lake under the skylight, whose well shows the sky above
  55 degrees, it crosses the opening from about 22:10 to 1:50, its light
  coming down the well onto the water; before, it only grazed the rim
  behind the trees. Midnight is a little brighter, the moon higher. The
  island's and the cave's dark tests pass. The disc is a few instructions
  on the sky's pixels only (not timed).
- The full moon as the film paints it (the user's frame of it): a big
  pale yellow disc, a little darker toward its edge, its seas soft
  grey-green patches with ragged edges outlined a little darker (a chain
  down its right side, a broad one over its top, a faint one low on the
  left), a few small craters and two rayed ones low on either side, its
  edge soft, glowing pale yellow round it through green into the sky's
  blue. It had been a plain blue-white disc in a white ring. The night's
  blue grade now leaves the moon and its glow as the sky draws them, out to
  three times its radius: it had turned the glow into a pale ring. Measured
  against the frame, the disc's mean colour is 230, 231, 181 against 229,
  231, 177. It is painted in the sky's shader, not taken from the frame, and
  the toon look's cream moon gets the same face inside its pen line. The
  film-matched night views do not change by a pixel (the moon is not in
  them), and the dark tests pass.
- The village's watchtower stage after the film's (its night frame of the
  stage): its legs splay out to the ground where they stood straight, each
  side braced in two tiers of crossed planks; the platform stands higher,
  3.6 metres up, on a thick rim of two boards, with no railing, as the
  film's has none; and posts lean out from it to a taller, steeper straw
  cone twice as wide as the tower. Its stairs up the back are longer for
  the higher platform, and walkers still can't step off its edge.
- The festival street is shorter, as the film's: six stalls down each side
  where there were ten, the row across its far end standing just past
  them with its lantern poles, and the street's old far end open sand
  before the path to the village. Its poles and bunting run its new
  length. The street's own お好み焼き is now やきそば, the hand-lettered
  味じまん お好み焼き standing at its far end. The jungle is planted just as
  before, as though the stalls taken away still stood.
- Behind each row of stalls (the street's two, the beach front's and the
  row across the street's far end) runs a back alley of packed sand,
  clear of plants, where only grass and the jungle had stood behind them.
  The jungle round the alleys is planted just as before. The two stalls
  at the outer ends of the far row, hidden behind the street's rows, are
  gone.
- The festival is laid out again round its wider stalls, a metre still
  between neighbouring booths: seven stalls a side along the beach front
  where there were eight (金魚すくい and ヨーヨー釣り are gone), so the rows
  still end on level ground, and the street 2.5 metres longer for its six
  a side, with the row across its far end, its poles and its bunting moved
  to match. Each painted sign keeps its stall. The beach front's bunting
  runs over the four stalls nearest the arch and over the three beyond.
  The street's banners and bunting and the arch's banner hang 0.2 metres
  higher, over the taller boards, and the fruit baskets stand to one side
  of a counter, leaving its middle free. The jungle is planted just as
  before.
- The festival's and the village's props no longer flicker or show
  bands. Where two faces lay in one plane, the nearer flickered from one to
  the other: on the stalls (the header board's top and the roof, the posts'
  tops, the floor's and the step's edges, the back wall's stripes), on the
  huts (the round shingles, which overlapped their neighbours at one depth
  and now each lean out a little toward their bottoms, so a row hangs clear
  of the one below it and the walls' shingling stands half as far out; the
  windows' frames, panes and bars at the openings' edges; the bookshelf,
  the basin's water and the bed's sheet), on the stage's platform rim and
  on the pier's planks. Their boxes are lit as the flat faces they are,
  where smooth shading had blended each box's sides into one another and
  the film look's lighting drew a wavy band across them (the plank huts'
  walls, the pier's planks, the stalls' steps), while round posts, logs,
  lanterns and thatch stay smooth. No measurable cost a frame.
  `art/blender/check_flicker.py` finds any faces of the built props that
  would flicker; only the paint on the ferry's windows and on the logs'
  cut ends, layered by design, is left.
- Everything made is drawn with the pen, as the film draws its props: the
  stalls and their boards, the bunting's flags, the lanterns, the banners
  and the arch, the poles, the huts and their furniture, the stage, the
  pier, the torches, baskets, pots and logs, in the same brown line as the
  characters. Only the land itself (the ground, rocks, trees, palms,
  plants, water and sky) is painted without one. A box's outline follows
  its edges, and the lines stay crisp under the scenery's brushwork, as
  the characters' do. About 0.3 ms more a frame in the festival street on
  the dev PC.
- The jungle's flowering bushes after the film's: each a bumpy mound
  thick with oval leaves, light and dark, with their veins, overlapping
  down it like shingles, standing out all round its edge and up all over
  its crown, so from low down or above its dark heart shows only deep
  between them, and is painted there as leaves further in, never as a
  smooth dome; and five-petalled flowers round yellow hearts among them,
  some in twos and threes, where they had been smooth balls stuck with
  stars. The plain shrubs on the sea cliffs are leafy too. The game cuts
  each leaf and flower from a card; a flowering bush is about 850
  triangles, four times what it was, and a cliff shrub 650 to 850, from
  64. The understory's shadows are cut the same way and move in the wind.
  About 1 to 3 ms more a frame on the dev PC where they crowd the view
  close up, as on the cliff tops and the jungle paths, and none from
  above. The jungle is planted just as before.
- The plants under the canopy are joined in smaller patches, 20 by 20
  over the map where they were 8 by 8, so the game draws only those near
  the camera and in its view. They still show from 34 metres in, but no
  longer as far as 100 metres where a big patch reached that far, nor
  behind the camera.
- The plants' bark is painted only on their wood, where every leaf had
  been painted with it and then shown without it. Nothing looks
  different, and the plants cost a little less to draw.
- Every stall is named after the sign painted on it, where most had
  carried the name of the stall that first stood there: its name in the
  layout, its words, its painting's file and its template all read as its
  sign does. Seventeen stalls were renamed, among them a ビール, a
  トルネードポテト and a レインボーアイスクリーム stall. Signs painted twice are
  numbered: two たこやき, two じゃがバター and two ジャンボ串焼 stalls. The
  typed words follow the paintings' spelling (たこやき, いかやき, やきとり).
  Every stall and every painting stands where it did.
- The game's sign atlas keeps a gutter round each sign, carrying a
  hand-lettered sign's edges out into it, so a sign that fills its board
  never takes a neighbouring sign's colours along its edges.
- Building the props or the village with `--only` no longer overwrites
  their .blend file with just the one prop, and `--only` takes several,
  comma-separated.
- The offline cache now keeps the island's height grid and layout file,
  and files up to 4 MB.
- The game downloads half as much, and a first visit downloads it once:
  9.1 MB in all where it was 19.7 (compressed, as GitHub Pages sends it).
  The plants' file had grown to 10 MB with the island's third shape and
  stopped the game building. Every model is now compressed with Draco as
  the Blender scripts export it (DRACO in charlib.py), and the game unpacks
  them in workers it lets go once everything has loaded: the plants went
  from 6.8 MB to 2.4, the rocks from 3.7 to 1.2, the ground from 0.97 to
  0.35, the props from 1.5 to 0.56 and the cast from 1.1 to 0.39. No point
  of any model moves more than 7 mm (on the 520 m ground; a fraction of a
  millimetre on a prop or a character), colours and texture coordinates
  come back exact, every model keeps all its triangles, and staged views
  before and after look the same. The exporter's other compression,
  meshopt, moved the island's points by up to 21 cm. The ground's colour
  maps, the faces, the masks and the hand-lettered signs are lossless WebP,
  every pixel kept: 2.8 MB of PNG is now 1.7. Lossy WebP was tried on the
  colour map, and blurred the rows of the fields seen from above. The
  offline cache had downloaded every file a second time on the first
  visit, just after the game fetched it; it now asks the server whether
  the copy the browser holds is current, and is told "not modified", with
  nothing to download (its own service worker, src/sw.ts). Everything
  stays in that cache together, so an old plants file is never drawn on a
  newer ground (where each copy stands is kept with the ground), and the
  cache's limit sits just above the plants, at 4 MB, so the build stops if
  they keep growing. The houses' night maps are lossless WebP too, every
  texel as baked, a third smaller; the guest houses are rebuilt, and the
  three huts change on their next build (their bake comes out a little
  different each time, so they were left as they are). The ground's height
  grid is stored as each height less what its neighbours predict, and the
  game puts it back exactly: 363 KB compressed is now 143. With the huts
  rebuilt the game is about 8.4 MB. The plan's 5 MB is now a soft target,
  judged by how long a first visit takes on a real phone (PLAN.md): the rest
  is mostly the jungle, and loading its far patches and the village after
  the start could bring the first load to about 5 if that is ever needed.
- 島二郎 is rebuilt after the film's frames of it and the user's sketches
  (the user: it looked way different from the film), where it had been an
  open, thatched ramen stall built as the village builds (see 島二郎 above).
  It stands where it stood, facing the path from the hanging sign, inside
  the ground cleared for it, so the jungle grows as it did.
  - Every plank, post, board and sheet of tin is painted in a patch of its
    own of the shop's texture (`art/blender/paintmap.py`): its faces unfold
    round its length into the patch, which is painted texel by texel from
    where on it each texel lies. Outside, the wood's grain, knots and nail
    heads with rust bleeding under them, greyer weathered patches and the
    damp at the walls' foot; the boards' cream paint worn through at their
    edges and here and there, rust and grime running down from the standing
    sign's top; rust round the plates' rivets and in streaks down the tin.
    Inside, warm golden planks, their joins painted. One texture 2048 texels
    across, 90 a metre on the walls, 50 on the roof and 126 on the signs,
    patches laid where they rest lowest (a skyline); the game draws it over
    the shop in the film look (`paint` in `src/world/Props.ts`), and what is
    too small to paint (a shell, a bottle) keeps its own colour, as the
    whole shop does seen from afar.
  - At night its lamp's light is baked into it, falling on the walls, the
    floor and the furniture and coming back off the wood, out through its
    doorway and its two windows. Every face open to the room keeps its
    light (`rooms` in `bake_night`), where the bake had dropped the thin
    and shaded ones (a rail under a window's sill, a table's legs) into
    the moonlit blue; the lamp hangs in the room's middle, so the room is
    lit warm and even, as the film's.
  - Its board and its standing sign glow warm under their lamps, as the
    film's: lamps of a kind of their own in the light grid (`spot` in
    `src/world/Firelight.ts`, twice a lantern's brightness, its light falling
    off as the distance to the power 0.7, not its square, so a tall board
    is lit down to its foot; each kind of light now has its own fall-off).
  - The painted signs' texture packs its patches as the shop's texture does,
    where they rest lowest, so the shop's five new faces (the board, the
    standing sign and the menu's three plaques) fit with every sign still
    at 130 texels a metre; templates to paint them on are in
    `art/signs/_guides/` (`sign.shimajiroShop`, `sign.kaijiru`,
    `menu.kaijiru`, `menu.yashiCurry`, `menu.title`).
  - Checked side by side with the film's frames by day and at night, inside
    and out (`screenshots/shimajiro-film-now.png`). The island's dark test
    passes, no faces flicker, and walkers go up its step into the room and
    round it. The shop is about 630 KB to download where it was 52: the
    model 250, its night map 150 and its texture 228.
  - A trodden path now runs on from the end of the way down the gorge to the
    shop's step, narrowing to its door, and the earth lies worn bare along
    its front from the bench to the standing sign, as in the film's frame of
    it through the jungle (`screenshots/shimajiro-path.png`), where the grass
    had grown right up to the step. These are paths of their own (TRODDEN in
    `art/blender/build_island.py`), painted and kept clear as the others are
    but not among PATHS, whose lines the planting keeps to, and the edge
    tufts and clover still follow the paths as they were planted: every
    tree, palm, plant and butterfly stands where it stood (the plants
    compared one by one with the build before), the heights are the same to
    the byte, and only the ground's paint round the shop changes.
  - Its door opens outward, as the film's does (`shimajiro interior 2`): hung
    on its right-hand jamb as one faces the shop on two black strap hinges,
    it stands swung out a little past a right angle, clear of the doorway,
    where it had stood open into the room. The kitchen stands against the
    side wall on the door's right as one looks out, as in the film, where it
    had stood against the door's own wall: the stove's front and its oven
    door face the room, the ladle rail and the shelf of pans hang on that
    wall over it, and the two jars stand on the floor between it and the
    door (the user, 2026-10-21). The navy floor cushion with white fish is
    gone, at the user's asking: the floor is bare planks.
  - The jungle closes in on it as in the film's frames, where it had stood in
    a wide clearing of bare grass: nothing had been planted within the room
    its prop keeps, trees not within 13.5 metres of its middle. A grove of
    its own now grows there (SHOP_GREENS in `art/blender/build_island.py`):
    three clumps of trees behind it and down its sides, palms over it, big
    elephant ears either side of its standing sign and its lamp and by its
    lean-to, as the film has them, and banana plants, monstera, ferns, red ti,
    cycads and flowering bushes crowding up to its walls and along the yard,
    each kind no nearer the shop than its leaves reach, the low ones next to
    the trodden ground and before the standing sign on the path's side, so it
    shows all the way up the path (the jungle's three tall plants there, a
    flowering bush, a cycad and a red ti, are now left out, as the rockfall's
    are: the bush kept among the butterflies' flowers, so none of them moves);
    tufts of grass line the yard's and the path's edges.
    The elephant ear is a new plant (`elephant_ear` in `art/blender/plants.py`):
    big heart-shaped leaves on long arching stalks, their two lobes either
    side of the stalk and their tips hanging, veined by the game as the
    other leaves are. All of it grows from a generator of its own after the
    rest of the jungle, so every other tree, plant and butterfly stands where
    it stood.
  - The user has hand-lettered all of its signs: the board, the standing
    sign, the menu's three plaques and the sign hung over the path. The
    middle plaque reads カツカレー, as the user lettered it, where the game
    had typed ヤシカレー. The hung sign's board takes the shape the user
    lettered it in, 638 × 313 (about two to one, where it had been three to
    one), and it hangs as in the film's frame of the way to the shop (the
    user's): by two cords from a low branch of a big tree beside the path,
    heart-leaved vines draped along the branch and hanging either side of
    the board, where it had hung from a crossbar on two posts. The tree
    grows with the jungle, standing straight so its branch leaves the trunk
    where the sign's cords and vines meet it (SIGN_TREE in
    `art/blender/build_island.py`, HANGING in `art/blender/build_props.py`),
    from a generator of its own. Small signs seen close (the menu's plaques, the
    cave's sign) now have templates drawn bigger for their size, as the game
    paints them sharper, so the same brush reads the same on every sign; the
    signs' README lists them all.
- The way up from the riverside path to 島二郎 runs between walls of jungle as
  thick as round the shop, where it had crossed open grass (the user circled
  it, 2026-10-21): between the path and the high ground's cliffs on one side
  and the river's pebble bank on the other. There are 9 clumps of trees (16
  trunks), 6 palms and 55 big-leaved plants, the low ones next to the path
  (PATH_GREENS in `art/blender/build_island.py`). They grow from a generator of
  their own after the shop's grove, so the rest of the jungle stands as it did.
- The riverside path along the foot of the gorge's south wall follows the
  film's frame of it (`river below parkour stone landmark 1`), where the user
  found it "poorly textured/styled" (2026-10-21):
  - Its bank is pebbles of every size. Small stones are packed close with grit
    between them, rounded cobbles lie over them, and here and there a big flat
    one. Each is lit over its top toward the sun and casts a soft shadow, with
    moss in the cracks in patches, darker and cooler down by the water. It had
    been one even size of pebble, as if paved. Where the bank fills the screen
    it costs about 0.7 ms more a frame at 1024 × 768 on the dev PC (1.17 ms
    against 0.47), and nothing where it does not show.
  - Its boulders are river stones: broad, low and worn round, with a few flat
    faces where they split. They are a little stained, with moss on hardly any
    of their tops, and darker where the water wets them. Eleven rest on the
    bank at the river's edge, their tops at the path's edge or down by the
    water, with five smaller ones out in the water beside some. Six more lie
    fallen at the wall's foot, half buried where the ground climbs, and 43
    small stones lie along the water's edge and against those at the wall.
    Under the water each goes on down into the river's bed. The game paints
    them as stone of their own (`river` in `src/world/Look.ts`): uncracked,
    where the cliffs' limestone paint had cracked them into slabs and grown
    moss over every top. They had stood in an even row by the water, as tall
    as broad, rounding to a point under a cap of moss. Walkers keep clear only
    of what shows of each, and the path stays at least about a metre wide all
    along it (`art/blender/build_island.py`'s `boulders`, the stones by
    `fallen_block` in `art/blender/karst.py`).
  - Under the cliff the rock's foot is pale and damp, with stones fallen from
    it lying thicker. Ferns, monstera, red ti and bromeliads grow thick at the
    very foot of the cliff, every 0.6 to 1.25 metres, 49 of them, where the
    path as trodden had kept all but four off. Vines hang in strands down the
    wall's face over the path (`strands` in `cliff`, `art/blender/karst.py`).
  - The jungle stands as it did. It is planted round the boulders as they
    stood before (PLANTED_BOULDERS), and the new plants grow from a generator
    of their own; the eight small plants that would now grow inside a boulder
    are left out. The island's download is about 180 KB bigger for this and
    the way up to 島二郎 (the rocks 144 KB, the jungle 23, the ground 13).
- Night in the jungle and the gorge as the film paints it, where it had lain
  under a dark, murky navy that hid what the place was (the user, on the
  riverside path toward 島二郎 at 22:32, with the film's night frames of the
  same ground beside it). The moon's shadows are soft now, keeping 60% of
  its light where they had kept none, and the night sky's fill is three
  times as strong, so what the moon does not reach is a clear royal blue
  whose pebbles, boulders, bushes and signs read. The jungle's and the
  gorge's night views had sat half on the grade's navy floor, their middle
  at a brightness of 0.08 to 0.09 against the film's 0.23 to 0.25; they
  are 0.19 to 0.22 now (the riverside path at 22:32 0.22, the way to
  島二郎 0.20). Where the moon falls, on the open beach, the cave's beach
  and the village's plaza, it is as bright as before (0.35 against the
  film's 0.35, the cave's beach 0.34 against 0.33), so the torches' and
  the lanterns' pools keep their warmth out to their edges; the crowns
  seen from above are as they were, and so is the cave inside. Dusk, the
  golden hour and the day are unchanged; the night eases in from 18:45 to
  19:36 and out from 4:36 to 5:36. The waterfall's clearing stays darker
  than the film's moonlit pond at 22:30: the moon, high in the south,
  only grazes its cliff.
- Rooms at night in their own colours, as the film's: inside 島二郎 and
  the villagers' and guests' houses the wood is a golden tan and the
  huts' walls their sage green, where the lamps' light had turned the wood
  a saturated orange and the night's blue had painted the huts' walls a
  bright blue (the user, beside the film's frames of 島二郎's room and a
  hut's at night). Seen from inside a lit room by night the picture is
  balanced to its lamp's light, as a camera balanced to it would be, the
  room a little greyer and kept out of the night's blue, while the cast in
  it glow the night's pale blue as the film's characters in its rooms do.
  The rooms' lamps shine the colour of their own bulbs, a warm cream
  (#FFE49D, as bright as before), where their light had been a deeper
  orange than the bulb; balancing a room to that had turned its bulb cyan.
  By night a lit room's roof and walls keep the moon's and the sky's light
  off what is inside (the softer moon shadows had let it through, tinting
  the walls blue), and the trees' shade no longer falls on whoever stands
  in a lit room. 島二郎's wall measures hue 26°, saturation 0.61 to 0.70
  and value 0.57 to 0.69 against the film's 31° to 42°, 0.56 to 0.71 and
  0.5 to 0.62 (it was 22°, 0.86 to 0.94 and 0.82 to 1.0); a stilt hut's
  walls an olive sage, hue 102°, the film's 90° to 97°. From outside the
  rooms' windows and doorways glow warm as before, the village measuring
  the same, and the rooms by day are the same to the pixel.
- Every wooden thing on the island is painted as 島二郎's wood is (the user,
  2026-10-21), where it had been a flat colour with a faint streak: the
  guest houses and the villagers' huts inside and out, the village's stage,
  its torches and palisade, the fallen logs, the festival's arch and its
  stalls, the pier, the bay's quay, the cave's sign and the sign hung over
  島二郎's path. Bare wood has its grain, knots, nails with rust under them,
  darker edges and ends; out in the weather greyer patches, damp at its foot
  and, on logs, cracks where they dried. Painted wood (the boarded sides,
  the gables and their chevrons, the orange shingles, the stalls' stripes,
  counters and trim, the cream boards) has its paint worn through to the
  wood at its edges and corners; bark is furrowed plates with moss and
  lichen. The logs' sawn ends, the pen's lines along the planks, thatch,
  cloth and metal keep their own colours.
  - `art/blender/paintmap.py` now fits a patch to any piece of wood a
    builder makes: a box for a plank, post or board, its grain along it; a
    log unrolled round its length, bent ones along their middles. Only what
    shows is painted: a face pressed to another (a plank's back on the wall,
    the half of a log inside the room's own logs) takes no room in the map.
    The houses' palette names which colours are wood, bare or painted
    (`wood_auto` in `art/blender/houses.py`). Each prop's map is the smallest
    that holds its wood at 90 texels a metre (the houses' at 80 to 85, which
    is as much as fits a 2048 map); the two stilt huts share theirs.
  - The game holds each map as its light, whole, and its colour at half
    its size, as its WebP file stores it: two textures of layers, 2048 and
    1024 texels square, which the graphics card fills from each map as it
    is decoded, two at a time, before the first frame (`loadPaintMaps` in
    `src/world/Props.ts`). It paints the props that are not baked houses
    with them too.
  - 20 maps, 1.8 MB in all, about 1.5 MB more to download than before (the
    shop's was there). On the graphics card they take 72 MB with their
    smaller copies, where whole colour would take 192 MB, against a phone
    budget of 64 MB for every texture in the game. To the eye they are the
    same: the maps' texels differ from their files by 0.4 in 255 on
    average, and the game's views by under half a step. Loading peaks at
    about 120 MB for them, where decoding every map at once took about
    340 MB, in about the same time (0.3 s on the dev PC).
  - No faces flicker in any of them; the island's dark test passes.

**Removed**

- The onigiri (the user, 2026-10-23: it makes no sense in the game now):
  the thing to hold and its icon, its name, its model from
  `build_props.py`, and the rice ball the eat action showed in an empty
  paw. An onigiri in an old save is gone when it loads.
- The M0 test beach, a small disc of sand.
- Diving, swimming and everything underwater, from the plan (none of it
  had been built): you wade in the shallows, and only the rowboat goes
  onto deeper water.
- The clay pots along the bay's quay, 52 of them on the sand behind the
  timber either side of the pier, and the festival's eight fruit baskets
  by the stalls' counters, at the user's word. The village's two baskets
  at the stage's foot stay.
- The film look's sky under the trees, at the user's word. Whenever the
  camera stood under the jungle's crowns the whole sky paled into a haze
  and glowed (gold in the golden hour), its clouds faded away and the
  distance faded into its haze, so that looking out of the jungle over the
  beach or the sea the sky was blown to white, its glow spilling over the
  trees and the sea in front of it. The sky, its clouds, the colour the
  distance fades to and the glow round the sun are now the same wherever
  the camera stands: up through the trees and out of the jungle, the plain
  blue of the film's open skies with its white clouds, as its jungle shows
  the sky through its palms (`jungle 5`). The jungle's depth haze and the
  waterfall's warm haze stay; at the waterfall the sky glimpsed through
  the trees at the top of its frame is blue now, a white cloud in it,
  where it was a pale haze. The shafts of sunlight in the waterfall's
  clearing are screened over what lies behind them rather than added, as
  bright on the clearing on the whole as before, so a white cloud seen
  through them no longer glows like the sun.

**Fixed**

- The game no longer breaks when it loads in a window with no size yet (a
  tab opened in the background, a pane folded away): the camera's aspect
  became NaN from a zero width over a zero height, and that poisoned the
  eyes' direction and the player's facing for good, even once the window
  had a size (found 2026-10-23). The camera and the picture now stay as
  they are until the window has a size.
- Jumping over a bed no longer takes you through it and the wall behind it
  and out of the house, and a jump now lands you on the bed (the user,
  2026-10-23: "players are able to clip through the bed & wall, and fall out
  of the house"; then "Let a jump land on beds"). Two things went wrong. A
  jump carried you over anything lower than your feet, the bed among them,
  and you came down inside it, with nothing on its top to hold you. And
  whoever stood inside something could walk out of it any way at all, on
  through the wall.
  - The bed's mattress is now something to stand on, 0.36 m up.
    - It is a deck over the bed that reaches a body's width (0.25 m) round
      it, so a jump that comes down at its edge is on it (`furnish_hut` in
      `art/blender/houses.py`).
    - The stilt huts and the plank hut were rebuilt; only their decks and
      their night bakes changed.
    - It stands higher than a step, so no one walks onto it.
    - Sitting and sleeping on it work as before, and getting up you stand
      on the floor beside it.
  - In the air you now go over only what a deck or pad tops, such as the
    bed and the stepping stones, and come down on it. Anything else you
    would come down inside stops a jump as it stops a walk: a stool, a
    stall's counter, a porch's edge, a log (`blockedInAir` in
    `src/world/Obstacles.ts`).
    - A deck tops a block only if the block's middle lies well inside it,
      so the bed's top does not count for the stool beside it.
  - Whoever is inside something, put there, still walks out of it, but
    never deeper into what is in their way nor into anything else
    (`deeper`), on their feet or in the air.
  - Checked by driving the player in the game, against the same moves
    under the old rules:
    - 900 jumps at the bed in your hut, from five places, at nine headings,
      walking and running, jumping once or again and again.
      - With the old rules and the bed as it was, 459 ended outside the hut
        and 484 came down inside the bed. The old rules with the bed's new
        top still let 78 out.
      - Now 362 land on the bed, and none leave the hut or come down inside
        it.
      - Straight at the bed, every jump lands on it.
      - Jumping over the stool onto the bed is stopped by the stool.
    - 144 jumps from the bed every way: none went through a wall (6 ran out
      of the door). Walking on it, you step off into the room or stop at
      the walls.
    - The 420 jumps between the stepping stones land exactly as before.
    - Of 300 running jumps round the village and the festival, 21 end
      differently, each over something low at a stall (a counter), a hut's
      furniture or a log.
      - Under the old rules 20 of the 300 ended stuck inside something.
      - Under the new ones 3 did, all in the sea off the quay, just as
        under the old rules.
    - Everyone's day ran through the feast, midnight and the morning,
      sleeping in these beds and getting up, and no one was left stuck.
    - No faces would flicker in the rebuilt huts (`check_flicker.py`).
- The shader warm-up at the start no longer stops partway with "Cannot
  read properties of null" (seen once on a `?dev&fresh` load, 2026-10-23).
  It works out the bounds of every shape on the island before the shape
  lets go of its vertices on the GPU. The jungle's undergrowth patches are
  built as the camera comes near and let go of their own, and were given
  only a bounding sphere, no box. A patch already drawn before the
  warm-up had nothing left to work its box out from, and the warm-up
  threw, leaving the rest unwarmed.
  - Each patch now keeps the exact box it is listed with and is given it
    together with its sphere (its outline the same in the `?toon` look),
    the same box three.js would find from its vertices.
  - Checked by drawing frames before warming up again, in both looks.
    What drew first on the failing load could not be found again; nothing
    in the game draws before the warm-up.
- Sitting on the ground in a grass skirt looks like sitting (the user,
  2026-10-23: in the island outfit it "doesn't really look like the
  character is actually sitting down"). The skirt only grew shorter as
  they sat, as tall and narrow as before, so they read as sinking into the
  ground.
  - It now spreads out wide and low on the ground round them, as the
    film's bonfire picture draws seated skirts (`[anime] chiikawa 5`): its
    hem half again as wide, its fringe strokes fanning out, its waist snug,
    the legs under it.
  - The character shader spreads the skirt's lower part out from the
    middle (`uSkirtFlare`, the more the further down), the islanders' own
    skirts too, and bends its normals with it.
  - The skirt's inside then lies within millimetres under its top, and its
    line drew a dark band over the skirt and the gap round the waist, so
    the inside's outline is now pushed out of sight.
  - A raised seat (a stool, a log, a bed, the pier's edge, the boat) does
    not spread the skirt, since there is no ground round them there.
- After the user's play-through (2026-10-22):
  - **The plank hut wedged into the yard has moved.** It stood behind the
    yard's other two plank huts, its door onto their walls. It now stands on
    the grass west of the yard, its door to the yard, with a trodden path to
    it between the two round huts. Its two islanders go home to it and sleep
    there.
  - **Chiikawa, Hachiware and Usagi sleep in their house again.** The way in
    by its door was missing (the nearest ground outside its steps lay just
    beyond a doorway's reach), so at bedtime they gave up and went about the
    island all night. A doorway with no ground that near now reaches a little
    further; every bed in all 16 houses can be reached.
  - **No more walking sideways.** A walker no longer turns their body to what
    they look at; they face the way they go and only glance with their head.
  - **They keep their eyes on you.** Whoever you talk with, give something
    to, or who answers you stays turned to you as you walk off.
  - **Gifts are thanked.** On taking the gift, after eating it, or on keeping
    it, each in their own words.
  - **Your actions get answers, not just your hops.** A wave is waved back,
    a bow bowed back, a cheer cheered, a dance danced along with; crying
    brings someone over to ask if you are all right. Those nearest you
    answer first.
  - **Rakko's sword is in the middle of his back**, not out over his right
    shoulder.
- No more starting the game under the water by the pier (the user,
  2026-10-22, "stuck beneath the ground"). In the air your feet's height is
  the ground under you, the sea's floor when you jump off the pier, and the
  island was kept with you there if it was kept mid-jump; you came back
  standing on the sea's floor, your eyes under the water, where no one can
  walk. Where you stand is now kept only on firm ground, a place kept for
  you is checked before you are put back there (else you start on the
  pier), and anyone left standing in water too deep to stand in climbs out
  at the nearest shore at once.
- No more stray hairlines across the characters' surfaces (the user,
  2026-10-22, on Shisa's ears and mane). A character's line is the model
  drawn again behind it, pushed outward on screen by the pen's width. That
  push went the whole width at every vertex, even on surfaces facing the
  camera, wherever their normals happened to lean. Across a flat face (a
  petal, an ear) or at a crease, neighbouring vertices went different ways,
  so the copy's triangles folded over and showed through as thin dark lines.
  - The characters' line (`src/characters/CharacterMaterial.ts`) now leaves
    surfaces facing the camera where they are, as the world's pen already
    did for props and plants (`src/world/Ink.ts`). Only the silhouette,
    where the surface turns away, is pushed out to draw the line.
  - The lines keep their width: checked on the whole cast, close and from
    the pier, and on the background crowd.
  - That covers every outlined surface in the game, characters, outfits
    and props alike. These two are its only outline shaders.
  - Shisa's mane petals are thinner, 2 cm, so that each one's whole line
    shows over the petal below it, as the drawing has it. At 3 cm the petal
    behind cut that line down to a broken sliver.
- A character's shadow on the ground no longer glows in the forbidden cave.
  It took the island's fog, which lit it faintly with the fog's colour when
  it was far off in the cave: the cave's dark test found the Siren's,
  looking at her on the ledge from the lake 30 m away. A shadow now takes
  the fog only where the open air reaches the character, as their body does.
- The forbidden cave's water no longer shows in the boat. The boat sits
  with its keel 12 centimetres under the water, its floor below the water's
  surface, and the water was drawn over it, in the hull, from in it and
  looking into it. The water now leaves out whatever of it lies inside the
  hull, the boat's own shape taken from its build however it rocks, pitches
  and bobs, so the hull shows its floor; round it the water runs right up
  to its sides as before.
- The cave's torch is the cast's size. Carried, it stood 1.75 metres, twice
  Chiikawa's height, its stick reaching the ground and its flame half a
  metre tall; set up at the boat's bow, 1.3. It is three quarters of its
  old length, no longer stretched when carried, its flame scaled down with
  it, heart and all (the island's flames keep a heart of a fixed height,
  which on a flame this small had dwarfed its tongues): a short stick held
  at the side, its flame's tip at the top of the bearer's head, its light
  where its flame now burns. The cave's and the island's dark tests pass.
- Pale slits no longer stand up the face of the riverside path's wall, and
  no white eggs up the steep bank behind 島二郎. They were the stones painted
  on the ground at the rocks' feet, laid on steep ground (between the wall's
  faces, on the bank) and, being painted from above, drawn out into tall
  white ovals. The stones now lie only on ground level enough to hold them:
  fewer and smaller as it steepens past about 40°, none past about 63°. Each
  is round where it lies on a slope, and a little darker on the steeper
  ground. The bank's pebbles keep off the steep ground likewise. Stones on
  the flat are as they were. The ground costs no more over the flat (within
  0.1 ms a frame at 1024 × 768 on the dev PC, about the noise) and about
  0.3 ms less where the cliffs' feet fill the view (`screeStones` in
  `src/world/Island.ts`).
- The sun's glints winking on the shallows of the sea and of the
  waterfall's pool were pure white at any hour, brighter than any light on
  the water in the golden hour and at dusk. They are the hour's light on
  the water now: white by day as before (the same to the pixel from 7:12
  to 15:00), a little golden in the golden hour, dimmer at dawn and dusk,
  and gone by night as before.
- The clouds' shadows on the sea, seen from high above, were a fixed dark
  teal laid over it, which would come out lighter than a darker sea. They
  are now the sea's own light in shade, by day exactly as they were.
- Small things in a house's room, an apple, a knob, a peg on a shelf, are
  lit by its lantern at night, where they had been left in the night's
  blue: the bake (houses.py bake_night) keeps every face that sees the
  lantern, however few texels its first, rough pass gave it, and lays
  small pieces out bigger in the night map, so the bake reaches them.
  What is painted on another face, a rug's pattern, a cupboard's wavy
  line, a floor's seams, takes that face's light: a thin line or a dot
  had fallen between the texels of its own. The stilt huts are built with
  it; the other houses take it when next built.
- Discs of green or blue light no longer flash up here and there among
  the plants (behind the festival's stalls, at the jungle's edge). A thin
  leaf seen edge on is shaded a little beyond its own shape at the
  picture's smoothed edges, which stretched how deep it lay in the trees'
  shade, and its own colours, past their range into negative or blinding
  light; the brushwork and the glow then spread one such point into a
  disc. Both are now kept within range, and the film look's first
  finishing pass takes no light below black, no NaN and no blinding spike
  from any shader.
- Seen with the camera looking far off (out to sea, down the festival's
  street), the cast's flower crowns and grass skirts no longer turn into
  dark brown bands. The pen was scaled from its width where the camera
  looks, which is never drawn under 1.5 pixels, so with the camera looking
  far off everything nearer was drawn several times too bold (about 12
  pixels at 6 metres in place of 2) and the lines round the crown's
  flowers and the skirt's strokes ran together. Each thing now takes the
  pen's true width at its own distance, still never under half the pen
  where the camera looks; with the camera on the player, as in play,
  nothing changes.
- At night the festival's arch no longer burns its banner white. A prop's
  glowing part had one light, at the middle of all its pieces: the arch's
  two stacks of lanterns, one on each pole, put theirs in the air between
  them, a few centimetres behind the banner, which it lit white and the
  glow spread into a halo. Each cluster of a part's pieces (those within
  0.6 metres of each other) is now a light of its own, so the arch's
  lights sit on its two stacks. The side bunting's lanterns and the
  restaurant's two corner lanterns, which shared one light the same way,
  have one each too. Checked at the arch in a staged view at 21:00.
- The waterfall's pool mirrors the ground, rocks and plants round it
  from the moment the game opens. Its first picture of them, taken before
  the first frame, kept the last frame's shadows when there were none
  yet, and the graphics card refused to draw anything lit into it
  (about 200 refused draws, each a warning in the console), so until the
  light had moved on half an hour of the island's time the pool mirrored
  the sky but not the land round it. That first picture now draws its
  own shadows. Checked with every draw watched while the game loads and
  the night's lights come on: none refused.
- `art/blender/check_flicker.py` reads the compressed props (with
  Blender's own Draco decoder), and no longer counts two faces 15 to 22 mm
  apart as lying in one plane. It compared how far each lay from the
  world's origin along its own slant, which a few metres out shifts by
  millimetres when a small face tilts by a hair, as the compression tilts
  them. The ferry's one reported pair was such. It now reports only the
  guest houses' door outline, set exactly 2 mm in front of the glass, the
  check's own limit, which the compression rounds to 1.99 mm.
- The bay's beach is no longer sharp and oddly shaped. Where the quay's
  sand met the water it stepped down, holes opened in the water before the
  timber and the surf ran in a zigzag: the sea and the ground's paint under
  it read the ground's heights on a grid 1.12 metres apart, so the quay's
  sheer drop crossed the water's surface in steps. Along the quay the
  water now meets an even slope through its surface, so its edge runs
  straight to about 2 centimetres, and the sand drops within 3 centimetres
  inside the planks. Past the timber's ends the drop turns into a beach,
  the raised sand easing into it over 6 metres, and the water shallows over
  the timber's last 12 metres, so the surf bends smoothly round them.
- The sea cliffs no longer have a V cut down them in the cove. The quay's
  shaping of the ground was chosen by how far along the bay's x a place
  lies, so it reached the north coast too, where the same x's run: just
  past the timber's east end it pulled the cliffs' grassy top from 18
  metres down to 4 in a notch, the cliff's stone following it down, green
  inside; and along the north beach west of the headland it had raised the
  sand into a quay's edge over water 1.6 metres deep. It now shapes only
  the bay's own coast: the cliff stands whole, the north beach slopes into
  the sea, and the steep corner where the headland meets the cliffs is the
  rock of any steep ground. The jungle stands as it was, but for three
  palms that the raised sand had held out of the water.
- The pier no longer stops a plank short of its end. Its planks covered
  13.6 of its 14 metres, so its two beams stuck out bare past the last
  plank over the water, and its deck to walk on, the full 14 metres long,
  let the player stand out on them. A plank more now covers the beams to
  their ends, and the deck stops 0.35 metres short of the pier's end, as
  it does of its sides, so no one stands half off the planks.
- The gorge's river no longer stops at a line across its mouth. Its bed
  ran 2.8 metres deep right to the coast, where the beach's sandy
  shallows, 10 to 25 centimetres deep, ran straight across the mouth; the
  water took that step under it for a beach and drew a line of surf
  across the open water. The bed now rises smoothly over the river's last
  22 metres to a shelf 13 centimetres down where it meets the sea, so the
  river's deep turquoise fades into the shallows as at a river's mouth
  onto a beach, and the shelf can still be waded across, the only way on
  foot to 島二郎 since the rockfall. The jungle stands as it was.
- The forbidden cave's mouth and skylight no longer open onto the sky
  through the island from afar. The cave's inside was drawn only within
  45 metres of it, while the openings into it, cut through the outcrop's
  rock and the spur's ground, are drawn from anywhere: from further off,
  the mouth showed the pale rock beyond it and the skylight a disc of sky.
  The cave is now drawn whenever its mouth or its skylight is in the
  camera's view, however far off, and not otherwise; from afar it costs a
  few tenths of a millisecond at most on the dev PC, within the timings'
  noise. A new dev test, `__dev.seeThrough()`, looks into every opening
  into something drawn only near (the cave's mouth and skylight, every
  house's doorways and windows, 120 views) from beyond where its inside
  stops being drawn, and fails on any hole onto what lies beyond: with the
  old rule it found the cave's, and now finds none. Through one open
  doorway a room's things still show only within 32 metres, as every
  room's do, the room behind them empty from further off.
- Every beach's waterline is drawn smooth. Seen from above, the sand met
  the shallows in short straight pieces with a corner about every metre,
  where the heights between the grid's points were blended four at a time.
  Near the water's surface the water's edge, the ground painted as under
  water and the pen's line along it now follow a smooth curve through the
  grid's points; steep ground and the quay keep their exact edges.
- The forbidden cave's mouth meets the beach with no step. The sand before
  it lay 3 to 15 centimetres under the cave's floor, so the opening stood
  on a low step, and a dark band ran along its threshold. The sand is now
  level with the mouth's sill for a metre out and a metre past its ends,
  easing into the beach over the next 3, and the ground's edge runs along
  the sill, so the cave's floor (0.347 metres up at the sill) meets the
  sand (0.343) with nothing between. The dark band was the floor between
  the sill and the middle of the arch's outline, which the light counted
  as outside the cave, lit by neither the sun nor the sky. The arch the
  light comes in by now stands on the sill and leans back as the mouth's
  face does, 0.37 metres for each metre up, so the threshold takes the
  daylight the floor behind it does, and the vines over the mouth count as
  outside it. The cave's dark test passes.

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
