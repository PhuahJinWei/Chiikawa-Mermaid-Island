import { t } from '../i18n/I18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A photo in the album: its picture's address (an object URL) and when it was taken. */
export interface AlbumPhoto {
  id: number;
  url: string;
  label: string;
}

/**
 * The album of the photos you have taken, opened from the newest photo by the camera's button (the user,
 * 2026-10-23: with the camera, as a phone's camera keeps its photos, not in a notebook): each photo opened to
 * save, share or throw away.
 */
export class AlbumView {
  /** Asked for each time the album opens. */
  onAlbum: () => Promise<AlbumPhoto[]> = async () => [];
  /** A photo thrown away; the album is drawn again once it has gone. */
  onDelete: (id: number) => Promise<void> = async () => {};

  private readonly root = el('div', 'album-panel');
  private readonly body = el('div', 'album-body');
  private readonly viewer = el('div', 'photo-viewer');
  private urls: string[] = [];

  constructor(ui: HTMLElement) {
    const card = el('div', 'album-card');
    const head = el('div', 'album-head');
    const close = el('button', 'panel-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('panel.close'));
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'album-title', t('album.title')), close);
    card.append(head, this.body);
    this.root.append(card, this.viewer);
    this.root.hidden = true;
    this.viewer.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    ui.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.root.hidden = false;
    void this.draw();
  }

  close(): void {
    this.root.hidden = true;
    this.viewer.hidden = true;
    this.dropUrls();
  }

  private dropUrls(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }

  private async draw(): Promise<void> {
    this.dropUrls();
    const photos = await this.onAlbum();
    this.urls = photos.map((p) => p.url);
    if (photos.length === 0) {
      this.body.replaceChildren(el('div', 'album-empty', t('album.empty')));
      return;
    }
    const grid = el('div', 'album');
    for (const photo of photos) {
      const thumb = el('button', 'album-photo');
      thumb.type = 'button';
      thumb.style.backgroundImage = `url(${photo.url})`;
      thumb.setAttribute('aria-label', photo.label);
      thumb.addEventListener('click', () => this.view(photo));
      grid.append(thumb);
    }
    this.body.replaceChildren(grid);
  }

  /** A photo opened large: to save, share or throw away. */
  private view(photo: AlbumPhoto): void {
    const picture = el('img', 'photo-large');
    picture.src = photo.url;
    picture.alt = photo.label;
    const buttons = el('div', 'photo-buttons');
    const save = el('a', 'photo-button', t('album.save'));
    save.href = photo.url;
    save.download = `mermaid-island-${photo.id}.jpg`;
    const share = el('button', 'photo-button', t('album.share'));
    share.type = 'button';
    share.hidden = !('share' in navigator);
    share.addEventListener('click', async () => {
      try {
        const blob = await (await fetch(photo.url)).blob();
        const file = new File([blob], `mermaid-island-${photo.id}.jpg`, { type: 'image/jpeg' });
        await navigator.share({ files: [file], title: t('app.title') });
      } catch {
        // Not shared (no sharing here, or put away): nothing to do.
      }
    });
    const remove = el('button', 'photo-button', t('album.delete'));
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      this.viewer.hidden = true;
      await this.onDelete(photo.id);
      if (this.open) void this.draw();
    });
    const back = el('button', 'photo-button', t('album.back'));
    back.type = 'button';
    back.addEventListener('click', () => (this.viewer.hidden = true));
    buttons.append(save, share, remove, back);
    const caption = el('div', 'photo-caption', photo.label);
    this.viewer.replaceChildren(picture, caption, buttons);
    this.viewer.hidden = false;
  }
}
