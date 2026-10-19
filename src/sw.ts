/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { addPlugins, cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

/**
 * The service worker: the offline cache of every file the game needs (the list vite-plugin-pwa
 * injects as __WB_MANIFEST, see vite.config.ts), updated in the background when they change.
 */
declare const self: ServiceWorkerGlobalScope;

// Workbox downloads each new or changed file in full (`cache: 'reload'`), though on the first visit
// the game has just fetched them all itself. Asked to revalidate instead, the browser shows the
// server what it holds, and the server answers "not modified", with no body, for a file that has
// not changed; a changed one still comes in full.
addPlugins([
  {
    requestWillFetch: async ({ request }) =>
      request.cache === 'reload' && request.mode !== 'navigate' ? new Request(request, { cache: 'no-cache' }) : request,
  },
]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
void self.skipWaiting();
clientsClaim();
