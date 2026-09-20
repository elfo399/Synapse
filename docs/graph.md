# Knowledge graph design

## Library decision

| Candidate | Fit | Tradeoff |
| --- | --- | --- |
| react-force-graph-3d 1.29.1 / Three.js 0.186.0 | WebGL rendering, a force-directed layout in three dimensions, camera controls, custom node shapes, and selection callbacks. | Requires WebGL, explicit GPU resource cleanup, and a separate accessible item list. |
| Cytoscape.js 3.34.3 | Existing 2D canvas renderer with selection, pan/zoom, built-in force layout, and type shapes. | Retained as the optional 2D view and fallback; it does not provide the requested spatial 3D view. |
| React Flow | React node editors, HTML node content, and diagram interactions. | Suited to 2D diagrams; a separate force engine and renderer would be needed for this 3D view. |

The default is now a true 3D knowledge graph, following the explicit request for spatial exploration. `react-force-graph-3d` supplies the force simulation and Three.js/WebGL renderer; nodes occupy three-dimensional coordinates and the camera orbits the graph. The existing Cytoscape renderer remains available through the **2D** button, and the application falls back to it automatically when WebGL is unavailable. This choice follows the interaction requirement and documented capabilities; no comparative performance benchmark is claimed. References: [react-force-graph's official repository](https://github.com/vasturiano/react-force-graph), [Cytoscape documentation](https://js.cytoscape.org/), and [React Flow layout integrations](https://reactflow.dev/learn/layouting/layouting).

## Query contract

`GET /api/graph` authenticates the request before querying. The server derives `userId` from the session; a caller cannot choose another owner.

| Query      | Behavior                                                              |
| ---------- | --------------------------------------------------------------------- |
| `type`     | One Item type.                                                        |
| `tag`      | Normalized tag identity.                                              |
| `archive`  | `active` (default), `archived`, or `all`.                             |
| `parent`   | A project/area/resource ID and Items assigned to it through `PARENT`. |
| `focus`    | Existing owned Item plus one-hop incoming/outgoing neighbors.         |
| `relation` | Restricts edge type.                                                  |
| `q`        | Case-insensitive title match.                                         |
| `limit`    | Default 500 nodes; valid range 1–1,500.                               |

The service uses indexed owner/type/archive/tag/relationship predicates, orders nodes by recent update and stable ID, and returns only summary fields. A second bounded query fetches relations whose source **and** target appear in the selected node IDs. Edges preserve their stable relation IDs and type. The server returns at most 5,000 edges and marks the response `truncated` when the node or edge bound is reached. The total reflects matching nodes, not all owner Items.

Backlinks are incoming relations on the target; no reverse edge is fabricated. `PARENT` edges point child to parent. A local graph is one hop, not unlimited traversal. If a filter excludes a neighbor, its edge is absent as well. Counts in full item details can therefore exceed the number of visible edges.

## Interaction and accessibility

The dark 3D canvas uses restrained edges and distinct node shapes/colors by Item type. Small graphs display labels throughout; larger graphs show labels for selected or hovered nodes to reduce clutter. Users can select nodes and open the selected Item. A details panel supplies full title, type, tags, timestamps, outgoing relations, backlinks, and navigation in either rendering mode.

| 3D control | Action |
| --- | --- |
| Mouse drag | Orbit the camera around the graph. |
| Right mouse drag | Pan the camera. |
| Mouse wheel | Zoom. |
| Touch drag | Rotate. |
| Pinch / two-finger drag | Zoom / pan. |
| Arrow keys while the graph stage has focus | Rotate or tilt the camera. |
| `+` / `-` / `0` while the graph stage has focus | Zoom in / zoom out / fit the graph. |
| Visible controls | Rotate, tilt, zoom, fit, and reset the view. |

The **2D** and **3D** buttons switch renderers. The 2D view keeps its pan/zoom, fit, reset, and selection controls. Controls and the companion item list use ordinary keyboard-accessible elements; navigating the canvas is not required to reach an Item.

Filters trigger bounded server queries. In-view title search helps locate the visible knowledge neighborhood. Both renderers consume the same graph response and share React-owned filter/selection state, details, and navigation. The switch to 3D changes no API contract, stored data, or database schema.

The renderer owns its layout/camera state. Force simulation runs are bounded, and GPU geometries, materials, textures, and renderer resources are disposed when no longer needed. The 2D Cytoscape instance is destroyed on unmount. Renderer-owned mutable node/link objects stay separate from the API data objects.

## Deliberate V1 limits

- The default 500-node view is a useful overview, not a completeness guarantee. Narrow filters or open local neighborhoods when the response is truncated.
- Maximum 1,500 nodes and 5,000 edges per response. Thousands of stored Items do not imply thousands must animate together on a phone.
- Layout/rendering cost depends on graph density, labels, screen pixel ratio, and the browser's GPU. WebGL availability selects the fallback automatically; users can also choose 2D. No device benchmark or measured tens-of-thousands-node interactive layout is claimed.
- No persisted positions, automatic clustering, minimap, worker layout, or graph export in V1. Fit/reset and local neighborhoods supply practical navigation.
- Canvas accessibility is supplemented by keyboard camera controls, a semantic item list, and full details/navigation outside the canvas.

Future work can add cursor expansion, group/community aggregation, position caching by query/content version, lazy neighborhood expansion, and background layout workers. Preserve owner scoping and explicit query limits through those extensions.
