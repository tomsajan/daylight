/**
 * Installing the site as an app. Chrome and Edge announce that it can be
 * installed with a `beforeinstallprompt` event, early in the page's life, which
 * is kept here so a button can show their install dialog later. Safari and
 * Firefox send none: there is no button, and their own menus still install it.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | undefined;

export const install = $state({ available: false });

/** Starts listening; call before the page has loaded. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (ev) => {
    // Our own button instead of the browser's banner.
    ev.preventDefault();
    deferred = ev as InstallPromptEvent;
    install.available = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    install.available = false;
  });
}

/** Shows the browser's install dialog. */
export async function installApp(): Promise<void> {
  if (!deferred) return;
  const ev = deferred;
  await ev.prompt();
  // The event can be used once; the browser sends another if the dialog was dismissed.
  deferred = undefined;
  install.available = false;
}
