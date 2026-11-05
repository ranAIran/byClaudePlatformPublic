# Life Archipelago

A second brain and life organizer as a 3D game, built on the Latent Archipelago engine (`quest/world.js`). The plan, critique, market review and requirements live in the "Life Archipelago Plan" doc.

## Prototypes

`life/proto/` renders five moments of the app with the real engine, at phone size:

| Shot | URL | What it shows |
|---|---|---|
| Morning map | `life/proto/?shot=map` | life islands, level and health bars, today's quests, the bag |
| Inside Home | `life/proto/?shot=home` | cutaway house, rooms, tagged items, room tasks |
| Scan a bill | `life/proto/?shot=scan` | document detected, fields read, quest created |
| Identify an item | `life/proto/?shot=identify` | object recognized and placed in a room |
| Smart alarm | `life/proto/?shot=alarm` | wake window, sleep stages, health points |

Serve the repository root over HTTP (`python3 -m http.server 8000`) and open the URLs above. Add `&webgl` to force WebGL2. All data on screen is example data; the camera views use a 3D scene in place of a live camera feed.
