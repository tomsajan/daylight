/** UI-only state of the Instrument design (not persisted, not in the URL). */

export type Tab = 'globe' | 'year' | 'day' | 'compare';
export type PickMode = 'replace' | 'add';

class UiState {
  /** What tapping the globe or choosing a search result does. */
  pickMode = $state<PickMode>('replace');
  /** Visible view on phones. */
  tab = $state<Tab>('globe');
  settingsOpen = $state(false);
  helpOpen = $state(false);
  timeSheetOpen = $state(false);
  /** Set by the search box so other controls can focus it. */
  focusSearch: () => void = () => {};

  closeAll(): boolean {
    const any = this.settingsOpen || this.helpOpen || this.timeSheetOpen;
    this.settingsOpen = this.helpOpen = this.timeSheetOpen = false;
    return any;
  }
}

export const ui = new UiState();
