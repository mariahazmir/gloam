export type LabelSource = 'tagged_lit' | 'tagged_unlit' | 'estimated';

export type Tier =
  | 'confirmed_lit'
  | 'mapped_unlit'
  | 'brighter_than_most'
  | 'typical'
  | 'darker_than_most';

export type ReportType = 'actually_lit' | 'actually_dark' | 'light_is_out';

export interface PackMeta {
  schemaVersion: number;
  attribution: string;
  estimatesNote: string;
  city: string;
}

export interface Segment {
  id: string;
  name: string | null;
  highway: string;
  litProbability: number;
  confidence: number;
  labelSource: LabelSource;
  coordinates: ReadonlyArray<readonly [lon: number, lat: number]>;
}
