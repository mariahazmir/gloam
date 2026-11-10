import { StoreError } from '../corrections/store';
import type { PersonalSettings } from '../routing/costs';
import { DEFAULT_SETTINGS } from '../routing/costs';
import { parseSettings, serializeSettings } from '../settings/settings';
import type { KeyValueStorage } from './keyValueStorage';

export const SETTINGS_KEY = 'gloam.settings.v1';

export interface SettingsStore {
  /** Defaults when nothing is stored. Throws StoreError on read failure. */
  load(): PersonalSettings;
  /** Throws StoreError on write failure; earlier data stays unchanged. */
  save(s: PersonalSettings): void;
}

export function createLocalSettingsStore(storage: KeyValueStorage | null): SettingsStore {
  return {
    load() {
      if (!storage) throw new StoreError('Local storage is not available');
      let text: string | null;
      try {
        text = storage.getItem(SETTINGS_KEY);
      } catch (cause) {
        throw new StoreError('Could not read settings', { cause });
      }
      if (text === null) return { ...DEFAULT_SETTINGS };
      try {
        return parseSettings(text);
      } catch (cause) {
        throw new StoreError('Stored settings are unreadable', { cause });
      }
    },
    save(s) {
      const text = serializeSettings(s); // ArgumentError on bad input, before any write
      if (!storage) throw new StoreError('Local storage is not available');
      try {
        storage.setItem(SETTINGS_KEY, text);
      } catch (cause) {
        throw new StoreError('Could not save settings', { cause });
      }
    },
  };
}
