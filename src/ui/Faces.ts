/**
 * The cast's faces as the screen shows them (the user, 2026-10-23: a face tells you who at a glance): the user's
 * drawings in art/icons/, copied into public/ui/faces/ by art/blender/build_icons.py and listed in its faces.json.
 * Shown by the speaker's name in the text box, as a choice of whom to ask after, and on the marker toward whoever
 * you were told of. Anyone without one is shown by name.
 */

const FACES = 'ui/faces/';
const drawn = new Set<string>();
/** Each face's picture, kept so it is drawn at once the first time it shows. */
const pictures: HTMLImageElement[] = [];

/** Which faces there are, and their pictures fetched (called once, as the game starts); none if there is no
 * list. */
export async function loadFaces(): Promise<void> {
  try {
    const response = await fetch(`${FACES}faces.json`);
    if (!response.ok) return;
    const list = (await response.json()) as { faces?: string[] };
    for (const id of list.faces ?? []) {
      const picture = new Image();
      picture.src = `${FACES}${id}.webp`;
      pictures.push(picture);
      drawn.add(id);
    }
  } catch {
    // No faces: everyone by name.
  }
}

/** `id`'s face (one of the cast, or any islander), as a picture's address; null if they have none. */
export function faceOf(id: string): string | null {
  const who = id.startsWith('islander') ? 'islander' : id;
  return drawn.has(who) ? `${FACES}${who}.webp` : null;
}
