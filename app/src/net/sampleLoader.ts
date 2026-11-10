import { parseSampleData, type SampleCorrection } from '../pack/sampleData';

/**
 * Loads the bundled Sample_Data file, and only while Demo_Mode is on.
 * Returns an empty list when Demo_Mode is off, the file is absent or the request fails.
 */
export async function loadSampleData(
  demoMode: boolean,
  url: string | undefined,
  fetchFn: typeof fetch,
  today: Date = new Date(),
): Promise<SampleCorrection[]> {
  if (!demoMode || !url) return [];
  try {
    const res = await fetchFn(url);
    if (!res.ok) return [];
    return parseSampleData(await res.json(), today) ?? [];
  } catch {
    return [];
  }
}
