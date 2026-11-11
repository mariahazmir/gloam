# Requirements Document

## Introduction

The Gloam web app (`app/`) is a browser front end that loads small city packs exported by the gloam-data-pipeline, draws a dark 2.5D map, and plans walking routes that trade distance against dread. Routing, tiers and corrections run on the device. The app has no accounts, no routing server and no hosted database in version 1.

The app is built with TypeScript and Vite, with no UI framework. `maplibre-gl` is the only runtime dependency. Tests use Vitest and `fast-check`. The map uses MapLibre GL JS with OpenFreeMap tiles.

Honesty and privacy constraints that shape this spec:
- Gloam estimates which streets are likely well lit. It cannot tell anyone that a route is safe, and every screen that shows a route carries the product disclaimer.
- Model probabilities are relative scores, biased low and not calibrated. The app uses rank within the city and never a fixed probability cut-off.
- Inferred values are labeled as estimates and shown with confidence. Sample data is labeled "SAMPLE DATA".
- Route requests, start points, end points and routes stay on the device.

Items marked "(decide, measure)" in the source requirements are targets. They are written here as targets to be measured, not as guarantees, and are collected in the section "Targets to measure and open questions". Static hosting is not decided. This spec does not choose a host.

## Glossary

- **Web_App**: The Gloam front end in `app/`, described in this document.
- **City_Pack**: Two files for one city produced by the gloam-data-pipeline: a segments GeoJSON file and a buildings GeoJSON file.
- **Segment_File**: The segments GeoJSON file of a City_Pack. Each feature is a LineString with the properties `id`, `name`, `highway`, `lit_probability`, `confidence` and `label_source`. Its metadata carries `schema_version`, `attribution` and `estimates_note`.
- **Buildings_File**: The buildings GeoJSON file of a City_Pack. Each feature has a footprint and `height_m`.
- **Pack_Loader**: The Web_App component that fetches, validates and parses a City_Pack.
- **City_Picker**: The control that lists the shipped City_Packs and lets the user choose one.
- **Segment**: One feature of the Segment_File.
- **Street_Graph**: The undirected walking graph that the Graph_Builder derives from the Segments. Every Edge can be walked in both directions.
- **Graph_Builder**: The pure component that builds the Street_Graph.
- **Edge**: A part of a Segment between two graph nodes. An Edge keeps the segment id, length in metres, lit probability, confidence, label source and highway.
- **Label_Source**: One of `tagged_lit`, `tagged_unlit` or `estimated`.
- **Estimated_Segment**: A Segment whose Label_Source is `estimated`.
- **Tier**: The lighting category of a Segment. It is one of `confirmed_lit`, `mapped_unlit`, `brighter_than_most`, `typical` or `darker_than_most`.
- **Tier_Assigner**: The pure component that assigns a Tier to every Segment.
- **Rank**: The position of an Estimated_Segment's lit probability among the lit probabilities of all Estimated_Segments in the loaded City_Pack, expressed as a fraction from 0 to 1 where 1 is the highest probability.
- **Dread**: For an Edge, `raw + (1 - confidence) * max(0, 0.5 - raw)` where `raw = 1 - lit_probability`. While the toggle in Requirement 8, criterion 4 is on, the Dread used in Route_Cost and Dark_Exposure is computed with the confidence that criterion sets (setting-adjusted Dread).
- **Lambda**: The non-negative weight that the user sets with the dread slider.
- **Displayed_Distance**: The physical length in metres of a route, as shown to the user.
- **Routing_Distance**: The physical length in metres of a route plus the penalties of the Personal_Settings that are on (Requirement 8, criterion 3). The Router uses it in Route_Cost. The user does not see it.
- **Route_Cost**: `routing_distance + lambda * Dark_Exposure` for a route.
- **Dark_Exposure**: `sum(distance * dread)` over the Edges of a route, with distance as physical length in metres and Dread as setting-adjusted Dread.
- **Canonical_Order**: The order of Segments sorted by `id` in ascending order, comparing ids as strings by code unit.
- **Comparison_Tolerance**: The absolute tolerance of 0.000001 used when property tests compare Route_Cost, Routing_Distance or Dark_Exposure values (suggested, to be confirmed in the design).
- **Router**: The pure component that finds the route with the lowest Route_Cost.
- **Shortest_Route**: The plain shortest route by physical distance between the snapped start and end, with all Personal_Settings toggles ignored.
- **Gloam_Route**: The route the Router returns at the Lambda the user has chosen.
- **Snap**: Moving a tapped or located point to the nearest point on the Street_Graph.
- **Snap_Distance**: The maximum distance for a Snap, 150 m.
- **Plan_Mode**: The interaction mode in which map taps and the Crosshair set the start and end points. A tap selects no Segment in Plan_Mode.
- **Report_Mode**: The interaction mode in which a tap selects a Segment for a Correction. A tap sets no start or end point in Report_Mode.
- **Mode_Switch**: The control that switches between Plan_Mode and Report_Mode.
- **Crosshair**: A marker fixed at the centre of the map view, used with the "Set start here" and "Set end here" buttons.
- **Start_Setting_State** and **End_Setting_State**: The two states of Plan_Mode that decide whether a map tap sets the start point or the end point.
- **Walking_Speed**: 5 km/h, used for estimated walking time.
- **Personal_Settings**: The four optional toggles in Requirement 8.
- **Settings_Store**: The component that reads and writes Personal_Settings on the device.
- **Correction**: A user report on one Segment of type `actually_lit`, `actually_dark` or `light_is_out`. It holds only the segment id, the report type and the date.
- **Correction_Store**: The interface through which all Corrections are read and written. Version 1 has one implementation, backed by browser local storage.
- **Community_Status**: The status of a Segment derived from Corrections by the Status_Rule, such as "confirmed by 3 people".
- **Status_Rule**: The pure rule that turns a set of Corrections into a Community_Status.
- **Report_Weight**: The weight of one Correction, `0.5 ^ (age_in_days / 30)`.
- **Status_Threshold**: The minimum weighted sum of agreeing reports for a Community_Status. The default is 3.
- **Demo_Mode**: The mode in which bundled sample corrections are loaded and shown.
- **Sample_Data**: The bundled sample corrections file used by Demo_Mode.
- **Sample_Walk**: An example start and end point for a City_Pack, labeled as an example.
- **Reduced_Effects_Mode**: The mode in which flicker and animation are off and estimates use static styles.
- **Flicker_Rate**: The number of brightness flashes per second of a flickering Segment.
- **Flicker_Cap**: The maximum Flicker_Rate, 3 flashes per second.
- **Heartbeat_Chart**: The line chart of Dread along a route by distance.
- **Dark_Spot_List**: The list of the most reported darker Segments.
- **Disclaimer**: The text "Gloam estimates which streets are likely well lit from map data. Estimates can be wrong, and Gloam can't tell you whether a route is safe. Trust your surroundings."
- **Banned_Words**: The list of banned words and phrases defined in the product steering file (`product.md`), held in the test sources as the single list used by the banned-word test.
- **UI_String**: Any text the Web_App can show to a user, including labels, messages, tooltips, accessible names and text read by screen readers.
- **How_Gloam_Guesses_Screen**: The screen that explains how estimates are made and quotes the validation numbers.
- **Validation_Document**: `docs/validation.md`.
- **Legend**: The short explanation of glow, flicker and fog, one line each.
- **Reset_Control**: The control that returns the Web_App to its first-run state.

## Requirements

### Requirement 1: City packs and loading

**User Story:** As a user anywhere, I want to pick a city and see it, so that I can try the app where I am.

#### Acceptance Criteria

1. THE City_Picker SHALL list all five shipped City_Packs by name (Seattle, Kuala Lumpur, London, Berlin and Manchester), with one entry per City_Pack and no entry for a City_Pack that is not shipped.
2. WHEN the user opens the Web_App for the first time, THE Web_App SHALL load the Seattle City_Pack.
3. THE City_Picker SHALL show the exact text "the case where lighting records are missing" as the description of the Kuala Lumpur City_Pack entry. The entries for the other four City_Packs may have no description.
4. WHEN the user chooses a City_Pack, THE Pack_Loader SHALL request that City_Pack's Segment_File and Buildings_File and no other City_Pack data file.
5. WHILE a City_Pack is loading, THE Web_App SHALL show a progress state until the load succeeds or fails, and SHALL remove the progress state within 500 ms of either outcome.
6. IF a City_Pack file is missing, cannot be read, or fails validation, THEN THE Pack_Loader SHALL show a message that names the file and states whether it is missing, unreadable, or invalid, SHALL discard any partially loaded data from that City_Pack, and THE Web_App SHALL keep the previously loaded City_Pack, its map view, and any planned route unchanged and usable.
7. THE Pack_Loader SHALL treat a file as failing validation IF its `schema_version` is not a supported version, a `lit_probability` or `confidence` value is outside 0 to 1 inclusive or is not a finite number, or a Segment geometry is not a LineString.
8. THE Web_App SHALL show the loaded City_Pack's attribution text and estimates note in the About screen and in a map corner, and SHALL update both within 500 ms of a City_Pack finishing loading.
9. IF the user sets a start or end point outside the area covered by the loaded City_Pack, THEN THE Web_App SHALL show a message stating that it has no street data there, SHALL NOT plan a route, and SHALL NOT send the point's coordinates over the network.
10. WHEN the user chooses a different City_Pack and it finishes loading, THE Web_App SHALL release the previous City_Pack's data so that data for exactly one City_Pack is held in memory.
11. IF the user chooses a City_Pack while another City_Pack is still loading, THEN THE Web_App SHALL cancel the earlier load and load only the most recently chosen City_Pack.

### Requirement 2: Street graph

**User Story:** As a user, I want routing over the real street layout, so that routes follow connected streets.

#### Acceptance Criteria

1. WHEN a City_Pack has loaded, THE Graph_Builder SHALL build a Street_Graph by splitting each Segment at every coordinate that it shares with another Segment, so that every shared coordinate becomes a node of the Street_Graph.
2. THE Graph_Builder SHALL keep on each Edge the segment id, length in metres, lit probability, confidence, Label_Source and highway of the Segment it came from, with lit probability and confidence unchanged and each within 0 to 1 inclusive.
3. WHEN the same set of Segments is supplied in any order, THE Graph_Builder SHALL produce an identical Street_Graph, meaning the same set of nodes and the same set of Edges with identical attributes.
4. WHEN the Segments form more than one connected part, THE Graph_Builder SHALL build a Street_Graph that contains every part without error.
5. WHEN a Segment is closed (its first coordinate equals its last coordinate), THE Graph_Builder SHALL build Edges for it without error.
6. THE Graph_Builder SHALL produce Edges whose lengths sum to the sum of the Segment lengths, within an absolute tolerance of 0.001 metres per Segment.
7. WHEN a 22,000-Segment City_Pack is loaded, THE Graph_Builder SHALL build the Street_Graph in under 3 seconds on a mid-range phone (target, to be measured).
8. IF a Segment has fewer than 2 coordinates, a coordinate that is NaN, infinite or outside valid latitude (-90 to 90) or longitude (-180 to 180) bounds, or a lit probability or confidence that is NaN, infinite or outside 0 to 1, THEN THE Graph_Builder SHALL reject that Segment with an error naming the invalid field and the segment id, and SHALL keep the remaining valid Segments in the Street_Graph.

### Requirement 3: Relative lighting tiers

**User Story:** As a user, I want to see how bright each street is compared with the rest of the city, so that I am not misled by uncalibrated probabilities.

#### Acceptance Criteria

1. THE Tier_Assigner SHALL assign exactly one Tier from the set `confirmed_lit`, `mapped_unlit`, `brighter_than_most`, `typical` and `darker_than_most` to every Segment in the loaded City_Pack.
2. WHEN a Segment's Label_Source is `tagged_lit`, THE Tier_Assigner SHALL assign the Tier `confirmed_lit`.
3. WHEN a Segment's Label_Source is `tagged_unlit`, THE Tier_Assigner SHALL assign the Tier `mapped_unlit`.
4. WHEN a Segment is an Estimated_Segment, THE Tier_Assigner SHALL compute its Rank fraction as the number of Estimated_Segments in the loaded City_Pack with a strictly higher lit probability, divided by the total number of Estimated_Segments, and SHALL assign `brighter_than_most` if the Rank fraction is below 0.40, `typical` if it is at least 0.40 and below 0.75, and `darker_than_most` if it is at least 0.75 (suggested cut-offs of 40, 35 and 25 percent, to be confirmed).
5. THE Tier_Assigner SHALL give two Estimated_Segments with equal lit probability the same Tier.
6. FOR ALL pairs of Estimated_Segments in one City_Pack, WHEN the first has a higher lit probability than the second, THE Tier_Assigner SHALL assign the first a Tier that is the same as or brighter than the Tier of the second, using the order `brighter_than_most`, `typical`, `darker_than_most` from brightest to darkest.
7. THE Tier_Assigner SHALL assign every Estimated_Segment's Tier using Rank only, so that replacing all lit probabilities in a City_Pack with any strictly increasing transformation of them leaves every Tier unchanged, and no fixed lit probability value (including 0.5) acts as a threshold.
8. THE Web_App SHALL describe the Tiers with the wording "confirmed lit in OpenStreetMap", "mapped as unlit", "estimated: brighter than most streets here", "estimated: typical" and "estimated: darker than most streets here".
9. THE Web_App SHALL show the confidence beside every Estimated_Segment's Tier wording, as a whole-number percentage from 0 to 100.
10. IF an Estimated_Segment has a lit probability or confidence that is NaN, infinite, or outside the range 0 to 1 inclusive, THEN THE Tier_Assigner SHALL reject the City_Pack with an error that names the invalid argument and the Segment, and SHALL assign no Tiers.
11. IF the loaded City_Pack contains zero Estimated_Segments, THEN THE Tier_Assigner SHALL assign Tiers to the remaining Segments under criteria 2 and 3 without raising an error.

### Requirement 4: Visual language

**User Story:** As a user, I want the map to show lighting as glow, flicker and fog, so that I can read it at a glance without being harmed by the effects.

#### Acceptance Criteria

1. THE Web_App SHALL draw Segments with the Tier `confirmed_lit` with a steady glow that has constant brightness and no flicker.
2. THE Web_App SHALL draw each Estimated_Segment with a flicker whose interval irregularity, measured as the standard deviation of its flash intervals divided by their mean, never decreases as confidence falls from 1 to 0 and is strictly greater at confidence 0 than at confidence 1.
3. THE Web_App SHALL draw Segments with the Tier `darker_than_most` with both fog and the flicker of criterion 2.
4. THE Web_App SHALL draw Segments with the Tier `mapped_unlit` with fog and no flicker.
5. THE Web_App SHALL draw Segments with the Tier `brighter_than_most` or `typical` with the flicker of criterion 2 and no fog, and SHALL draw `brighter_than_most` Segments with a higher base brightness than `typical` Segments.
6. THE Web_App SHALL draw the Gloam_Route as a lantern path that is visually distinct from every Tier style and remains visible above all Tier styles.
7. THE Web_App SHALL keep the Flicker_Rate of every Segment at or below the Flicker_Cap for every confidence value from 0 to 1 inclusive.
8. THE Web_App SHALL keep every change in a Segment's brightness to at most 25 percent of the full brightness range within any 100 ms window (suggested limit, to be confirmed).
9. WHEN the system "reduce motion" setting is on at page load, THE Web_App SHALL start in Reduced_Effects_Mode.
10. THE Web_App SHALL provide a visible switch, operable by keyboard and by touch, that turns Reduced_Effects_Mode on and off, and SHALL show the current mode on the switch.
11. WHEN the user operates the switch, THE Web_App SHALL apply the new mode to all drawn Segments and the Gloam_Route within 500 ms without reloading the page.
12. WHILE Reduced_Effects_Mode is on, THE Web_App SHALL draw no flicker and no animation, with every Segment and the Gloam_Route at constant brightness.
13. WHILE Reduced_Effects_Mode is on, THE Web_App SHALL draw each of the five Tiers with a static style that differs from the other four Tiers by line pattern or line width as well as by colour.

### Requirement 5: Map

**User Story:** As a user, I want a dark, smooth 3D map, so that I can see streets and buildings in context.

#### Acceptance Criteria

1. WHEN a City_Pack finishes loading, THE Web_App SHALL show a dark MapLibre GL JS map using OpenFreeMap tiles, with the map centre within 100 metres of the centre of the City_Pack bounding box, except that on first run the view is fitted to the Sample_Walk as described in Requirement 17, criterion 7.
2. WHEN the map has loaded, THE Web_App SHALL draw each building from the Buildings_File as an extruded footprint whose height equals `height_m` metres.
3. WHILE the map is shown, THE Web_App SHALL keep the attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (with links to OpenFreeMap, OpenMapTiles and the OpenStreetMap copyright page) and the text "© OpenStreetMap contributors" always visible, expanded and not collapsed, and not covered by any other on-screen element.
4. WHEN the user touches the map, THE Web_App SHALL pan on a one-finger drag, zoom on a two-finger pinch, and tilt on a two-finger vertical drag, with tilt limited to 0 to 60 degrees.
5. WHILE effects are on, THE Web_App SHALL keep the map at 30 frames per second or higher, measured over 10 seconds of continuous pan, zoom and tilt on a mid-range phone (target, to be measured; the reference device is recorded in `docs/app-checks.md`).
6. IF the measured frame rate stays below 30 frames per second for 2 consecutive seconds, THEN THE Web_App SHALL turn off active effects one at a time, until the frame rate is 30 frames per second or higher or no effects remain, and SHALL keep the map, routes and attribution visible (target, to be measured).
7. IF a map tile request has not completed within 5 seconds or returns an error, THEN THE Web_App SHALL draw the Segments from the City_Pack on a plain background, SHALL show a message indicating the base map is unavailable, SHALL keep the map attributions visible, and SHALL keep route planning available.
8. IF a building's `height_m` is missing, not a finite number, or less than 0, THEN THE Web_App SHALL skip extrusion for that building, SHALL still draw all other buildings, and SHALL report an error naming `height_m` in the developer console.

### Requirement 6: Route planning

**User Story:** As a user walking at night, I want a route between two points on the map, so that I can see how it passes through better and worse lit streets.

#### Acceptance Criteria

1. WHILE the Web_App is in Plan_Mode, WHEN the user taps the map, THE Web_App SHALL set the start point at the tapped position if the Web_App is in Start_Setting_State or the end point at the tapped position if it is in End_Setting_State, and SHALL replace any earlier point of the same kind. The Web_App begins in Plan_Mode and Start_Setting_State. WHEN a start or end point has been set (by a tap, by "use my location", by "Set start here" or by "Set end here"), THE Web_App SHALL, if exactly one of the start and end points is unset, enter the state of the unset point (Start_Setting_State if the start is unset, End_Setting_State if the end is unset), and SHALL otherwise leave the state unchanged. WHEN the user chooses a state with the "tap sets" control, THE Web_App SHALL enter that state. Report_Mode taps never move points and never change the state.
2. WHEN the user chooses "use my location", THE Web_App SHALL request the device position through the browser geolocation interface and use it as the start point.
3. IF the device position is denied, unavailable or not returned within 10 seconds, THEN THE Web_App SHALL show a message indicating that the location could not be found, SHALL keep any existing start point unchanged and SHALL NOT send the position over the network.
4. THE Web_App SHALL offer no place-name search.
5. WHEN a start or end point is set, THE Web_App SHALL Snap it to the nearest point on the Street_Graph within the Snap_Distance.
6. IF no point on the Street_Graph lies within the Snap_Distance (150 m) of a start or end point, THEN THE Web_App SHALL show a message indicating that the point is too far from a street, SHALL NOT plan a route and SHALL keep the other point unchanged.
7. WHEN a start and an end point are both snapped, THE Web_App SHALL show the Gloam_Route on the map with its distance in whole metres below 1000 m or in kilometres to one decimal place from 1000 m, its estimated walking time at the Walking_Speed (5 km/h) in whole minutes rounded up, and the share of its length in each Tier as whole-number percentages that sum to exactly 100. The distance shown is the Displayed_Distance.
8. IF the Street_Graph contains no route between the snapped start and the snapped end, THEN THE Web_App SHALL show the message "No walking route found" and SHALL NOT show a route, distance, time or Tier summary.
9. WHILE a route is shown, THE Web_App SHALL show the Disclaimer verbatim on the same screen.
10. WHILE the Web_App is in Plan_Mode, THE Web_App SHALL show the Crosshair at the centre of the map and two buttons labelled "Set start here" and "Set end here", operable by keyboard and by touch, that set the start point or the end point, respectively, at the map centre and replace any earlier point of the same kind. These buttons are in addition to tapping the map.
11. THE Web_App SHALL provide a Mode_Switch, operable by keyboard and by touch, that shows the current mode and starts in Plan_Mode.

### Requirement 7: Dread trade-off

**User Story:** As a user, I want to choose how much I prefer better-lit streets over a short walk, so that I control the trade-off.

#### Acceptance Criteria

1. THE Web_App SHALL provide a slider that sets Lambda, labelled from "shortest" at its minimum to "prefer better-lit streets" at its maximum, with a minimum Lambda of 0, a maximum Lambda of 10 (suggested, to be confirmed in the design), a step of 0.5 and a default Lambda of 3 (suggested, to be confirmed in the design).
2. THE Router SHALL compute Dread for each Edge as `raw + (1 - confidence) * max(0, 0.5 - raw)` with `raw = 1 - lit_probability`.
3. THE Router SHALL return the route with the lowest Route_Cost.
4. WHEN Lambda equals 0, THE Router SHALL return a route with the lowest Routing_Distance.
5. WHEN Lambda is raised, THE Router SHALL return a route whose Dark_Exposure, computed with setting-adjusted Dread, is less than or equal to that of the route returned at the lower Lambda.
6. WHEN Lambda is raised, THE Router SHALL return a route whose Routing_Distance is greater than or equal to that of the route returned at the lower Lambda.
7. WHEN two or more routes have equal Route_Cost, THE Router SHALL return the route whose sequence of Edge segment ids is first when compared element by element in Canonical_Order, so that the returned route does not depend on the order in which the Segments were supplied.
8. WHEN a Gloam_Route is shown, THE Web_App SHALL show the Shortest_Route and the Gloam_Route side by side, with the extra Displayed_Distance in metres, the extra walking time in whole minutes at the Walking_Speed, and the change in metres through `darker_than_most` Segments, each shown as a signed difference of the Gloam_Route from the Shortest_Route.
9. WHEN the Gloam_Route and the Shortest_Route are the same route, THE Web_App SHALL show the extra distance as 0 m, the extra walking time as 0 minutes and the change through `darker_than_most` Segments as 0 m.
10. IF Lambda is NaN, infinite, below 0 or above the slider maximum, THEN THE Router SHALL reject it with an error that names the argument, SHALL NOT return a route, and THE Web_App SHALL keep the previously shown route and the previous slider value.

### Requirement 8: Personal settings

**User Story:** As a user, I want to adjust routing to my own preferences, so that routes suit how I walk.

#### Acceptance Criteria

1. THE Web_App SHALL provide exactly four toggles, each with a visible on or off state: avoid steps, avoid service roads and back lanes, prefer main roads (primary, secondary, tertiary), and treat low-confidence guesses as darker.
2. WHEN the Web_App starts with no saved Personal_Settings, THE Web_App SHALL set all four toggles to off.
3. WHILE a toggle is on, THE Router SHALL add a penalty equal to 1.0 times the Edge's distance to the cost of each matching Edge, where matching means: Edges that are steps (avoid steps), Edges that are service roads or back lanes (avoid service roads and back lanes), and Edges that are not primary, secondary or tertiary roads (prefer main roads). The penalty is part of the distance term, so the properties in Requirements 7 and 16 hold for any fixed Personal_Settings (the penalty value is suggested, to be confirmed in the design).
4. WHILE the "treat low-confidence guesses as darker" toggle is on, THE Router SHALL compute Dread with a confidence of 0 for every Edge whose confidence is below the median confidence of the Edges in the loaded City_Pack.
5. WHEN the user changes a toggle, THE Settings_Store SHALL save the Personal_Settings to the device within 1 second, and THE Settings_Store SHALL send 0 bytes of Personal_Settings over the network.
6. WHEN the Web_App starts and saved Personal_Settings exist on the device, THE Web_App SHALL restore all four toggles to their saved states before the first route is planned.
7. IF reading or writing the Personal_Settings fails, THEN THE Settings_Store SHALL continue with the in-memory settings, THE Web_App SHALL show a message indicating that settings could not be saved or loaded, and THE Web_App SHALL keep all four toggles and route planning working.
8. THE Web_App SHALL offer no "empty" setting and no "enclosed" setting in version 1.

### Requirement 9: Route heartbeat

**User Story:** As a user, I want to see dread along my route, so that I know where the darker stretches are.

#### Acceptance Criteria

1. WHEN a route is shown, THE Web_App SHALL draw a Heartbeat_Chart with distance along the route in metres on the horizontal axis, from 0 to the route's total distance, and the Dread of each Edge, from 0 to 1, on the vertical axis.
2. THE Heartbeat_Chart SHALL plot a higher vertical position for an Edge with a higher Dread than for an Edge with a lower Dread.
3. IF an Edge on the route has a confidence in the lowest quarter of Estimated_Segment confidences in the loaded City_Pack, THEN THE Heartbeat_Chart SHALL show a marker over that Edge's span that differs from the line by shape as well as colour.
4. WHEN a route is shown, THE Web_App SHALL provide a text summary, readable by screen readers, that gives the route's total distance, the span of each stretch in metres where Dread is in the highest quarter of the route's Edges, and the span of each stretch in metres where confidence is in the lowest quarter of Estimated_Segment confidences in the loaded City_Pack.
5. IF a route has no Edges with a confidence in the lowest quarter of Estimated_Segment confidences in the loaded City_Pack, THEN THE Web_App SHALL state in the text summary that no low-confidence stretches were found, and THE Heartbeat_Chart SHALL show no low-confidence marker.
6. WHILE Reduced_Effects_Mode is on, THE Web_App SHALL draw the Heartbeat_Chart with no animation.
7. WHEN the user changes the route, THE Web_App SHALL update the Heartbeat_Chart and the text summary within 1 second to match the new route.

### Requirement 10: Corrections

**User Story:** As a user, I want to report that a street's lighting estimate is wrong, so that the estimate improves for me and for others.

#### Acceptance Criteria

1. WHILE the Web_App is in Report_Mode, WHEN the user taps a Segment, THE Web_App SHALL select that Segment and offer the report types "actually lit", "actually dark" and "light is out" as three separate actions, each completing a submission with one tap and no further input.
2. WHEN the user submits a Correction, THE Correction_Store SHALL store exactly three values for it: the segment id, the report type and the calendar date of submission, and no other value.
3. WHEN the user submits a Correction, THE Web_App SHALL set the Segment's lit probability to 1 for the type `actually_lit` or to 0 for the type `actually_dark` or `light_is_out`, SHALL set its confidence to 1, SHALL apply both values to that user's own routing and display within 1 second, and SHALL mark the Segment "your note". This changes that user's lit probability, confidence, routing and display marking for the Segment only, and does not change any Segment's Tier (criterion 12).
4. THE Status_Rule SHALL give each Correction a Report_Weight of `0.5 ^ (age_in_days / 30)`, where age_in_days is the number of days from the Correction's date to the current date, with a minimum of 0, so that a Correction dated today or in the future has a Report_Weight of 1.
5. THE Status_Rule SHALL divide Corrections into two sides: lit, which holds the type `actually_lit`, and dark, which holds the types `actually_dark` and `light_is_out` together. WHEN the weighted sum of Corrections on one side for a Segment is at or above the Status_Threshold and exceeds the weighted sum of Corrections on the other side, THE Status_Rule SHALL give the Segment the Community_Status of the first side.
6. IF a Segment has exactly one Correction, THEN THE Status_Rule SHALL NOT give the Segment a Community_Status or change its existing Community_Status because of that Correction.
7. THE Status_Rule SHALL produce the same Community_Status for the same set of Corrections supplied in any order.
8. THE Web_App SHALL read and write Corrections only through the Correction_Store interface.
9. IF reading or writing Corrections fails, THEN THE Correction_Store SHALL report the failure to the Web_App, THE Web_App SHALL show an error message indicating that the note could not be read or saved, THE Correction_Store SHALL keep all previously stored Corrections unchanged, and THE Web_App SHALL remain usable for map viewing and routing.
10. THE Web_App SHALL show community totals only from the Sample_Data and SHALL label them "SAMPLE DATA".
11. THE Community_Status SHALL change the labels shown for a Segment only, and SHALL leave the lit probability, confidence, Dread and routing of every Segment unchanged.
12. THE Tier_Assigner SHALL compute every Segment's Tier once, from the loaded City_Pack alone, and THE Web_App SHALL keep every Segment's Tier unchanged when the user submits a Correction, so that a user's own note changes that user's lit probability, confidence, routing and display marking only, and changes neither the Tier nor the Rank of any Segment.

### Requirement 11: Dark-spot list

**User Story:** As a user, I want a list of the most reported darker streets, so that I can review them and share them.

#### Acceptance Criteria

1. WHERE the Dark_Spot_List is enabled, THE Web_App SHALL list up to 20 Segments that have at least one Correction of type `actually_dark` or `light_is_out`, ordered by total report count from highest to lowest, with ties ordered by segment id in ascending order, and SHALL show for each listed Segment its name, highway, and report count for each of `actually_dark` and `light_is_out`.
2. WHERE the Dark_Spot_List is enabled, WHEN the user chooses the export action, THE Web_App SHALL offer the listed Segments for download as one CSV file with a header row and one row per listed Segment, in the order shown in the list.
3. THE Web_App SHALL write to each row of the CSV file only the name, highway, segment id and the report count for each of `actually_dark` and `light_is_out` of the listed Segment, and SHALL write no coordinates, dates, device data or user data. THE Web_App SHALL enclose every CSV field in double quotes with each embedded double quote doubled, and SHALL prefix a single quote to any field whose first character is `=`, `+`, `-`, `@`, a tab or a carriage return, so that a spreadsheet does not read the field as a formula.
4. WHEN a list entry comes from the Sample_Data, THE Web_App SHALL label it "SAMPLE DATA" in the list.
5. IF a listed Segment has no name, THEN THE Web_App SHALL show the wording "unnamed" in the list and SHALL leave the name field empty in the CSV file.
6. IF no Segment has a Correction of type `actually_dark` or `light_is_out`, THEN THE Web_App SHALL show an empty-state message stating that no reports exist yet and SHALL NOT offer the CSV export.
7. IF the CSV file cannot be created or downloaded, THEN THE Web_App SHALL show a message stating that the export failed and SHALL keep the list shown and usable.

### Requirement 12: Honest wording

**User Story:** As a user, I want the app to be straight about what it knows, so that I do not trust an estimate more than I should.

#### Acceptance Criteria

1. THE Web_App SHALL contain no entry of the Banned_Words in any UI_String, where the match is by whole word or whole phrase (a Banned_Words entry inside a longer word is not a match), ignores letter case and ignores differences in surrounding punctuation and whitespace.
2. WHERE a UI_String describes the lighting of a Segment, THE Web_App SHALL use only these terms: "likely well lit", "likely dark", "better lit", "estimated", "unknown", "confirmed by N people" (where N is a whole number of 1 or more), and the Tier wording defined in Requirement 3.
3. THE How_Gloam_Guesses_Screen SHALL state that estimates come from map data.
4. THE How_Gloam_Guesses_Screen SHALL state that most of the signal is road type and path kind, and that nearby places add little on tagged walking paths.
5. THE How_Gloam_Guesses_Screen SHALL state that estimates can be wrong and that lighting records are missing in many cities.
6. THE How_Gloam_Guesses_Screen SHALL quote, for every city listed in the Validation_Document, the model's AUC and the highway-footway-rate baseline's AUC exactly as written in the Validation_Document, SHALL quote no precision figure and no other figure tied to a fixed probability cut-off, and SHALL name each city where the model did not beat that baseline.
7. THE Web_App SHALL bundle the Validation_Document into the app at build time as raw text, and THE How_Gloam_Guesses_Screen SHALL contain a link that opens that bundled text without making any network request.
8. THE Web_App SHALL describe the estimated lighting of an Estimated_Segment only by its Rank within the loaded City_Pack, and SHALL NOT call a Segment lit or dark on the basis of its lit probability being above or below any fixed value.
9. IF the validation figures cannot be read from the Validation_Document, THEN THE How_Gloam_Guesses_Screen SHALL show a message stating that the validation numbers are unavailable, SHALL NOT show any figure that is not taken from the Validation_Document, and SHALL still show the statements in criteria 3 to 5.
10. IF a Banned_Words entry is present in any UI_String, THEN THE banned-word test SHALL fail, and the failure report SHALL name each offending UI_String and the Banned_Words entry found in it.
11. IF a figure quoted on the How_Gloam_Guesses_Screen differs from the matching figure in the Validation_Document, THEN THE validation-quote test SHALL fail, and the failure report SHALL name the city and the figure.

### Requirement 13: Privacy

**User Story:** As a user, I want my routes and location to stay on my device, so that nobody can track where I walk.

#### Acceptance Criteria

1. THE Web_App SHALL provide no account creation, no sign-in and no user identifier of any kind.
2. THE Web_App SHALL include no analytics, telemetry or usage-tracking code that sends data to any server.
3. THE Web_App SHALL set zero cookies and SHALL write to browser local storage only for Personal_Settings and Corrections.
4. THE Router, THE Graph_Builder and THE Tier_Assigner SHALL make zero network requests.
5. THE Web_App SHALL limit network requests to: exactly these: the app files, the TileJSON at `https://tiles.openfreemap.org/planet` and the vector tiles it lists, one request for each of the two data files of the chosen City_Pack, and one request for the Sample_Data file while Demo_Mode is on. The map style is bundled with the app and has no glyphs and no sprite, so no glyph or sprite request is made.
6. Route planning SHALL make zero network requests, and every map tile request made while the map is viewed SHALL carry only the tile address of the viewed area, with no start point, end point, route coordinate or coordinate derived from them in its URL, query string, headers or body.
7. WHEN the user requests their current position, THE Web_App SHALL read the position from browser geolocation, keep it in memory on the device only, and include it in no network request.
8. IF browser geolocation is denied or unavailable, THEN THE Web_App SHALL show a message stating that the current position cannot be used, keep any start point already set, and make zero network requests as a result.
9. WHEN a route is planned, THE test suite SHALL verify that route planning makes zero calls to the fetch function and zero other network requests between the start of planning and the display of the route, and that any map tile request made in that interval carries only a tile address.
10. WHEN a Correction is saved, THE Web_App SHALL store only the street segment identifier, the report type and the date, with no coordinates, location trail, device identifier or user identifier, and SHALL make zero network requests.
11. THE About screen SHALL state that the map tile provider can see the area viewed, and cannot see routes.

### Requirement 14: Demo mode

**User Story:** As a judge or visitor, I want sample data and example walks, so that I can see every feature without any data of my own.

#### Acceptance Criteria

1. THE Web_App SHALL provide a single control that turns Demo_Mode on and off, and SHALL show the current state (on or off) on that control.
2. WHEN the Web_App starts, THE Web_App SHALL set Demo_Mode to on in the hosted version (Requirement 17, criterion 11) and to off in any other build.
3. WHEN the user turns Demo_Mode on, THE Web_App SHALL load the Sample_Data and display it within 2 seconds, on a broadband connection of 10 Mbps or faster.
4. WHILE Demo_Mode is on, THE Web_App SHALL label every element drawn from Sample_Data (including community totals, corrections and map overlays) with the text "SAMPLE DATA" on every screen where that element appears.
5. WHEN the user turns Demo_Mode off, THE Web_App SHALL remove all Sample_Data elements and all "SAMPLE DATA" labels from the display, and SHALL keep corrections the user entered on their own device.
6. IF the Sample_Data fails to load, THEN THE Web_App SHALL keep Demo_Mode off, show an error message stating that sample data could not be loaded, and keep the rest of the Web_App usable.
7. WHEN the user selects "try a sample walk" for a City_Pack, THE Web_App SHALL set the start and end points to that City_Pack's Sample_Walk, label them "example", fit the map view so that the start, the end and the whole Sample_Walk route are visible (as in Requirement 5, criterion 1 and Requirement 17, criterion 7), and show the Sample_Walk route with the Disclaimer.
8. THE Web_App SHALL offer exactly one "try a sample walk" action for each of the five City_Packs, with a Sample_Walk defined for each City_Pack.
9. THE test suite SHALL verify that, for each of the five City_Packs, each Sample_Walk start and end lies on the Street_Graph of that City_Pack and that a route exists between them, that the Gloam_Route differs from the Shortest_Route at the default Lambda with all Personal_Settings toggles off, and that this Gloam_Route crosses at least 3 different Tiers.
10. THE test suite SHALL verify that every segment id in the Sample_Data exists in the Segment_File of its City_Pack.

### Requirement 15: Compatibility and performance

**User Story:** As a user on any phone or laptop, I want the app to work in my browser, so that I can use it wherever I am.

#### Acceptance Criteria

1. THE Web_App SHALL run without functional errors in the current stable release of Chrome on a laptop and on a phone, and in the current stable release of Safari on an iPhone where an iPhone is available for testing.
2. THE Web_App SHALL lay out every screen without horizontal scrolling and without clipped or overlapping controls at a phone viewport of 390 by 844 pixels.
3. WHILE the viewport width is 768 pixels or more, THE Web_App SHALL show the screens in a centred column or a two-panel layout, with no screen content cut off or overflowing horizontally.
4. THE Web_App SHALL let a keyboard user reach, operate and leave every interactive control using only the keyboard, with a visible focus indicator on the focused control.
5. WHEN the Web_App is loaded from a network in China and from a network in Malaysia, THE Web_App SHALL load the host files, the map tiles and the active City_Pack, and show the map and the attribution within 10 seconds on a 10 Mbit/s connection (target, to be tested from both regions).
6. IF the map tiles or a City_Pack fail to load, THEN THE Web_App SHALL show an error message stating which part failed to load and offer a retry action, and SHALL keep any corrections already stored on the device.
7. THE Web_App SHALL hold the data of exactly one City_Pack in memory at a time, except while switching.
8. WHEN the user switches to a different City_Pack, THE Web_App SHALL release the data of the previous City_Pack from memory once the new City_Pack has loaded.

### Requirement 16: Correctness properties (for property-based testing with fast-check)

**User Story:** As a developer, I want key rules checked on many generated inputs, so that bugs outside my examples are found.

#### Acceptance Criteria

1. FOR ALL valid Edges (lit probability from 0 to 1 inclusive, confidence from 0 to 1 inclusive, length finite and greater than 0 metres) and FOR ALL Lambda values that are finite and greater than or equal to 0, THE Router SHALL compute a Dread and a Route_Cost that are finite numbers.
2. FOR ALL valid Edges, THE Web_App SHALL compute a lit probability and a confidence that are each greater than or equal to 0 and less than or equal to 1.
3. IF an input to a scoring, tier or routing function is NaN, positive or negative infinity, or outside its valid range, THEN THE Router, THE Tier_Assigner or THE Web_App scoring function that received the input SHALL reject it by throwing an error whose message contains the name of the offending argument, and SHALL return no result.
4. FOR ALL pairs of Lambda values where the second is higher than the first, both evaluated on the same Street_Graph, start and end, THE Router SHALL return a route whose Dark_Exposure, computed with setting-adjusted Dread, is less than or equal to the Dark_Exposure of the route returned for the first Lambda, within the Comparison_Tolerance, for any fixed Personal_Settings.
5. FOR ALL pairs of Lambda values where the second is higher than the first, both evaluated on the same Street_Graph, start and end, THE Router SHALL return a route whose Routing_Distance is greater than or equal to the Routing_Distance of the route returned for the first Lambda, within the Comparison_Tolerance, for any fixed Personal_Settings.
6. FOR ALL generated Street_Graphs that contain two or more routes of equal Route_Cost between the snapped start and the snapped end, and FOR ALL permutations of the input Segment order, THE Router SHALL return the same route, and that route SHALL be the one whose sequence of Edge segment ids is first in Canonical_Order. The test generators SHALL produce Street_Graphs with equal-cost alternatives.
7. FOR ALL routes returned, THE Router SHALL return a path in which every Edge exists in the Street_Graph, each Edge ends at the node where the next Edge begins, the first Edge begins at the snapped start and the last Edge ends at the snapped end.
8. IF no connected path exists between the snapped start and the snapped end, THEN THE Web_App SHALL report that no route exists and SHALL display no route.
9. FOR ALL permutations of the same Segments, THE Graph_Builder SHALL produce a Street_Graph with the same nodes, the same Edges and the same Edge attributes.
10. FOR ALL Segment sets, THE Graph_Builder SHALL produce Edges whose lengths sum to the total Segment length within an absolute tolerance of 0.001 metres per Segment.
11. FOR ALL Segment sets, THE Tier_Assigner SHALL assign each Segment exactly one Tier, and for any two Estimated_Segments where the first has a lit probability greater than or equal to the second, THE Tier_Assigner SHALL assign the first a Tier that is equal to or brighter than the second's Tier.
12. FOR ALL sets of Corrections, THE Status_Rule SHALL leave the Community_Status of a Segment unchanged when exactly one Correction exists for that Segment.
13. FOR ALL permutations of the same Corrections, THE Status_Rule SHALL produce the same Community_Status for every Segment.
14. FOR ALL Corrections, WHILE no new Corrections are added and time moves forward, THE Report_Weight SHALL be less than or equal to its value at any earlier time.
15. FOR ALL UI_Strings, THE Web_App SHALL contain no Banned_Words entry, where the match is by whole word or whole phrase and ignores letter case, as in Requirement 12, criterion 1.
16. THE Router, THE Graph_Builder and THE Tier_Assigner SHALL make zero network calls for any generated input.
17. FOR ALL confidence values from 0 to 1 inclusive, THE Web_App SHALL compute a Flicker_Rate that is less than or equal to the Flicker_Cap.
18. THE test suite SHALL run at least 100 generated examples per property.
19. IF a property fails, THEN THE test suite SHALL report the property name, the minimal failing example after shrinking, and the random seed that reproduces the failure.
20. FOR ALL City_Packs and FOR ALL strictly increasing transformations of the lit probabilities of its Estimated_Segments, THE Tier_Assigner SHALL assign every Segment the same Tier as before the transformation (Requirement 3, criterion 7).
21. FOR ALL confidence values c1 and c2 with c1 greater than c2, THE Web_App SHALL compute a flicker interval irregularity for c2 that is greater than or equal to that for c1, and SHALL compute a strictly greater irregularity for confidence 0 than for confidence 1 (Requirement 4, criterion 2).
22. FOR ALL routes with a Tier summary, THE Web_App SHALL compute whole-number Tier percentages that sum to exactly 100 (Requirement 6, criterion 7).

### Requirement 17: First run for a judge or any new visitor

**User Story:** As a judge or new visitor, I want to see the whole idea within seconds without setup, so that I understand Gloam straight away.

#### Acceptance Criteria

1. THE Web_App SHALL be reachable at one URL with nothing to install, no sign-in, and no tutorial, modal or overlay that must be dismissed before the map accepts taps.
2. THE Web_App SHALL request no browser permission on load.
3. WHEN the user opens the URL on a typical connection (10 Mbps download, 50 ms round-trip time), THE Web_App SHALL load the Segment_File first, show the map with the City_Pack street layer drawn within 2 seconds (target, to be measured), and load the Buildings_File after the street layer is drawn.
4. WHILE the City_Pack is loading, THE Web_App SHALL show a progress indicator.
5. WHEN the user opens the URL on a typical connection (10 Mbps download, 50 ms round-trip time), THE Web_App SHALL show the Sample_Walk and accept map taps within 5 seconds (target, to be measured).
6. THE host SHALL serve every City_Pack file gzip- or Brotli-compressed.
7. WHEN the first-run City_Pack has loaded, THE Web_App SHALL show a planned Sample_Walk with the glow, flicker, fog, the Heartbeat_Chart and the Disclaimer visible without any input, with a label identifying it as an example, and with the map view fitted so that the start, the end and the whole Sample_Walk route are visible.
8. WHEN the user taps once on the example label or its clear control, THE Web_App SHALL clear the Sample_Walk so that the user can set their own start and end.
9. THE Web_App SHALL show a Legend with one entry each for glow, flicker and fog, where each entry is a single line of at most 80 characters.
10. WHILE the user has not set both a start and an end, THE Web_App SHALL show the hint "Tap the map to set where you start and where you're going".
11. WHERE the Web_App is the hosted version, THE Web_App SHALL start with Demo_Mode on, show a visible "SAMPLE DATA" badge wherever Sample_Data appears, and provide a switch to turn Demo_Mode off.
12. IF the tile service is slow or unavailable, THEN THE Web_App SHALL continue on the street layer drawn from the City_Pack as described in Requirement 5, criterion 7.
13. WHEN the user activates the Reset_Control, THE Web_App SHALL, within 1 second, clear any user-set start, end and route, show the Sample_Walk, set Demo_Mode to its first-run value, and show the hint from criterion 10.
14. WHEN the user taps "use my location", THE Web_App SHALL request location permission from the browser and, if granted, use the returned position as the start point without sending it over the network.
15. IF the location permission is denied, or the position is unavailable or not returned within 10 seconds, THEN THE Web_App SHALL show a message indicating location is unavailable, keep the current map state unchanged, and allow the user to set the start by tapping the map.
16. IF the City_Pack fails to load or is not complete within 15 seconds, THEN THE Web_App SHALL replace the progress indicator with a message indicating the City_Pack could not be loaded and provide a retry control.
17. WHILE the Sample_Walk is showing, WHEN the user sets a point by tapping the map in Plan_Mode, by "Set start here", by "Set end here" or by "use my location", THE Web_App SHALL first clear the Sample_Walk (both example points and the example label) and then apply the new point alone, so that the other point is unset. THE Web_App SHALL then enter the state of the unset point as described in Requirement 6, criterion 1 (the new point is the only one set, so a start leaves End_Setting_State and an end leaves Start_Setting_State). Report_Mode taps never move points and SHALL NOT clear the Sample_Walk.

## Targets to measure and open questions

Targets (marked "decide, measure" in the source text). Each is a target to be measured, not a guarantee:
- Graph build under 3 seconds for 22,000 Segments on a mid-range phone (R2.7).
- 30 frames per second with effects on, and effect reduction before frames drop (R5.5, R5.6).
- Map visible within 2 seconds and usable within 5 seconds on a typical connection (R17.3, R17.5). The meaning of "typical connection" and "mid-range phone" needs a defined test profile.
- Tier cut-offs of 40, 35 and 25 percent are suggestions (R3.4). Confirm or change them.
- Reachability of the tile source and the host from China and Malaysia (R15.5).
- Safari on iPhone is tested only where an iPhone is available (R15.1).

Open questions for the user (not decided here):
- Static hosting is undecided. It needs to be free, HTTPS, gzip or Brotli, a stable URL from 16 Dec to 29 Jan, with no API keys or expiring paid services, and reachable from the US first, then China and Malaysia. A candidate host is being tested. R17.6 depends on this choice. This spec does not pick a host.
- How a user's own Correction changes lit probability and confidence for routing (R10.3) is left to the design. Whether Community_Status also affects routing is not specified here.
- Values added during detailing and still to confirm in the design: Lambda range 0 to 10 in steps of 0.5 (R7.1), default Lambda of 3 (R7.1, R14.9; the Sample_Walks may need to be chosen so the Gloam_Route differs from the Shortest_Route at that Lambda), a penalty of 1.0 times distance for each routing toggle (R8.3), the 25 percent per 100 ms brightness-change limit (R4.8), the 3 second tile timeout (R5.7), the 10 second geolocation timeout (R6.3), the 20-row limit on the Dark_Spot_List (R11.1), the Comparison_Tolerance of 0.000001 (Glossary), the Start_Setting_State and End_Setting_State transitions (R6.1), and the exact boundary of the "lowest quarter" of confidences, such as at or below the 25th percentile (R9.3 to R9.5).
