# Custom Maps

Drop authored map JSON files into this folder.

- File type: `.json`
- Format: tile-authored map JSON exported from the separate `map-editor` app
- Naming suggestion: match the map `id`, for example `warehouse-yard.json`
- This build requires exactly `2` valid custom maps in this folder for runtime play.
- If there are `0`, `1`, or more than `2` valid files here, single-player start, room create, room join, and rematch stay blocked with a clear message.

When the server receives a new map request or starts a new multiplayer round, it scans this folder and only enables runtime rotation when exactly `2` valid custom maps are present. The built-in QA map remains available in the editor as a template, but not in live runtime rotation.
