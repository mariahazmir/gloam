import { STRINGS } from '../content/strings';
import type { ManifestEntry, PackId } from '../pack/manifest';
import { el } from './dom';

// City_Picker (Requirements 1.1, 1.3, 1.5, 1.6, 17.4, 17.16). One button per manifest
// entry; only the entry with a description shows one. The progress state and the
// problem message share one status area, and every change to it is synchronous, so
// the progress state is gone well inside 500 ms of an outcome.

export interface CityPickerOptions {
  entries: ReadonlyArray<ManifestEntry>;
  /** Called for a city button and for the Retry control (with the city that failed). */
  onChoose: (id: PackId) => void;
  /** Where the progress state and problem message go (the panel). The status box is only in it while it has content. */
  statusHost: HTMLElement;
  /** Where a city's description goes (a small caption under the header row). */
  captionHost: HTMLElement;
}

export interface CityPicker {
  /** Marks the city now shown, or none. */
  setActive(id: PackId | null): void;
  /** Shows the progress state for `entry`. */
  showLoading(entry: ManifestEntry): void;
  /** Replaces the progress state with `message` and a Retry control for `id`. */
  showProblem(id: PackId, message: string): void;
  /** Removes the progress state or message (a load succeeded, or was cancelled by a newer choice). */
  clearStatus(): void;
}

export function createCityPicker(host: HTMLElement, opts: CityPickerOptions): CityPicker {
  const buttons = new Map<PackId, HTMLButtonElement>();
  const items = opts.entries.map((entry) => {
    const button = el('button', { className: 'city-button', text: entry.label, attrs: { type: 'button' } });
    button.addEventListener('click', () => opts.onChoose(entry.id));
    buttons.set(entry.id, button);
    const item = el('li', { className: 'city-item' }, button);
    if (entry.description !== undefined) {
      // The description is a caption under the header row, not part of the chip.
      const description = el('p', {
        className: 'city-description',
        text: entry.description,
        attrs: { id: `city-description-${entry.id}` },
      });
      button.setAttribute('aria-describedby', description.id);
      opts.captionHost.append(description);
    }
    return item;
  });

  const list = el('ul', { className: 'city-list' }, ...items);
  const status = el('div', { className: 'picker-status' });
  host.replaceChildren(list);
  // Attached to the panel only while it has content, so an idle panel stays empty (and hidden).
  const setStatus = (content: Node | null) => {
    if (content === null) {
      status.replaceChildren();
      status.remove();
      return;
    }
    status.replaceChildren(content);
    if (!status.isConnected) opts.statusHost.prepend(status);
  };

  return {
    setActive(id) {
      for (const [key, button] of buttons) {
        if (key === id) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    },
    showLoading(entry) {
      const progress = el(
        'div',
        { className: 'progress glass', attrs: { role: 'status' } },
        el('span', { className: 'progress-ring', attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: STRINGS.templates.loadingCity.text(entry.label) }),
      );
      setStatus(progress);
    },
    showProblem(id, message) {
      const retry = el('button', {
        className: 'retry-button',
        text: STRINGS.errors.retry.text,
        attrs: { type: 'button' },
      });
      retry.addEventListener('click', () => opts.onChoose(id));
      const problem = el(
        'div',
        { className: 'problem glass', attrs: { role: 'alert' } },
        el('span', { className: 'problem-text', text: message }),
        retry,
      );
      setStatus(problem);
    },
    clearStatus() {
      setStatus(null);
    },
  };
}
