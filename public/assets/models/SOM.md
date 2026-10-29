# Sound-system models (caixa de som, carro de som, caminhão de som)

Six GLBs, two per kind: `-0` is the green-yellow side (team 0), `-1` the red side (team 1). Made with Tripo
(concept image, then image-to-model v3.1), cleaned in Blender, textures in WebP and meshes in meshopt,
like `car-v5.glb` / `truck-v5.glb`. No brand names, logos or candidate names or numbers on any of them.

Conventions, the same as the game's other vehicles:
- Metres. Y is up. **Forward is +Z**, the way `shared/driving.ts` moves along `sin(yaw)`/`cos(yaw)`.
- The origin is the ground centre, so `position.y = groundHeight(x, z)`.
- One textured body mesh. Vehicles also have:
  - `Wheel_{Front|Rear|Rear2}_{L|R}` pivots on each axle, with `extras.radius`, holding the wheel mesh `Tyre_{Front|Rear|Rear2}_{L|R}` (modelled: FROTA.md "Wheels"). `client/sound-fleet.ts` spins and steers the pivots, the front pair steering.
  - `FlagMount_L` / `FlagMount_R` empties on the roof edges, as on car-v5. The game does not use them: the carro's
    stood beside its roof at the raised tailgate's height (1.97 m), the trio's in front of its truss and outside it.
    The flags go where client/flag-spots.ts says: on the carro's roof (1.5 m) ahead of the tailgate, and on the
    trio's truss's front corners; they ride on the body, so they bounce with it (FROTA.md "Flags").

| File | Size | Triangles | Size (m, W × L × H) | Notes |
|---|---|---|---|---|
| `som-caixa-0.glb` | 127 KB | 3 116 | 0.55 × 0.22 × 0.31 | Portable boombox: woofers face +Z, arched handle bar on top, strap behind. **`Grip` empty at (0, 0.271, 0.028)**, the middle of the handle bar, where the hand holds it. 512 px texture. |
| `som-caixa-1.glb` | 124 KB | 3 116 | same | Red with a white handle. |
| `som-carro-0.glb` | 567 KB | 15 656 | 1.92 × 4.00 × 1.97 | Hatchback "paredão": tailgate up, a wall of speakers with an LED frame in the boot facing −Z (backwards). Green with yellow stripes. Axles at Z +1.230 (front, r 0.323) and −1.105 (r 0.3125), alloy wheels with ten dark spokes, 0.23 m wide. 2048 px texture. The 1.97 m height includes the raised tailgate; the roof is about 1.5 m. |
| `som-carro-1.glb` | 596 KB | 15 656 | same | Crimson with white stripes. |
| `som-caminhao-0.glb` | 714 KB | 25 321 | 2.64 × 10.2 × 4.66 | Trio elétrico: a cab-over three-axle truck with a closed green body. Speaker walls run along both sides under a stage deck with rails, a lighting truss with moving heads sits on top, and ladders hang at the open back. Axles at Z +3.839 (front, r 0.477) and −1.686 / −2.799 (tandem, r 0.452, dual tyres 0.56 m across), black steel wheels. The deck is about 3.5 m up; 4.66 m is the top of the truss, kept under the avenue's traffic-light arms. 2048 px texture. |
| `som-caminhao-1.glb` | 745 KB | 25 321 | same | Crimson with white stripes. |

The Z values above are in the game's frame (glTF). In Blender the same axles read with the sign flipped on Y.

## How they were made (tools/)
1. Concepts: Tripo text-to-image (`chat_image_2`, 10 credits each), two per kind, `artifacts/som/req/concept-*.json`. Picked:
   - caixa **a**: a cylinder like a JBL Boombox, with no name on it;
   - carro **a**: carro b looked too much like a real Golf;
   - caminhão **a**: b came out with an open, see-through lower skirt and messier stairs; a is a clean closed body that reads better from above. Both were modelled, so 70 extra credits were spent.
2. Models: Tripo image-to-model `v3.1-20260211`, smart low-poly, PBR, detailed texture (70 credits each). The input is the concept's task id.
3. `tools/som_models.py`, run in Blender:
   - squares up the concept's ¾ turn (PCA), turns the front to −Y in Blender (+Z in glTF), scales to length, puts the origin at the ground and decimates;
   - caixa: Tripo made the handle bar a lone stick, so everything above the mounts is cut and a modelled arched bar (`SomTrim` material) is added;
   - Tripo builds come out wide, so `xscale` brings the truck to a real width and `length` scales it evenly (scaling the height alone would make the tyres oval);
   - vehicles: `axles=auto` finds the tyres from what touches the ground; each one is measured, cleared from the body and replaced by a modelled wheel under its pivot (tools/wheel_build.py, FROTA.md "Wheels"; until 2026-10-12 Tripo's own tyre faces were cut out instead, which left pieces of tyre on the body);
   - `team=1` recolours the texture: green to crimson, yellow to white, with soft hue bands.
4. `tools/som_tex.py` converts textures to WebP with PIL. The glTF-Transform texture commands fail on this machine because of a sharp/libvips build problem. Then `gltf-transform meshopt --level medium`.
5. `tools/som_pack.sh` runs steps 3 and 4 for both sides. `tools/som_preview.py` + `tools/som_sheet.py` render the check views.

Rebuild a model (paths relative to the repo; the raw Tripo files are in `artifacts/raw/v3/`, which is not in git):

    bash tools/som_pack.sh artifacts/raw/v3/som-model-caixa-a-model_url.glb caixa 512 front=+x
    bash tools/som_pack.sh artifacts/raw/v3/som-model-carro-a-model_url.glb carro 2048 front=-y axles=auto radius=0.30 tyre_w=0.23,0.23
    bash tools/som_pack.sh artifacts/raw/v3/som-model-caminhao-a-model_url.glb caminhao 2048 front=-y axles=auto length=10.2 xscale=0.8 radius=0.5,0.47,0.47 tyre_in=0.55 dual=Rear,Rear2

`OUT=<dir>` writes the GLBs elsewhere (to compare a rebuild before replacing them).

## Tripo spend (2026-10-11)

| Task | Id | Credits |
|---|---|---|
| concept caixa a / b | b4f41ca5-f0b4-4df5-b05c-954ea682dfad / 77bae84f-bba3-4f24-a5cd-41119fd0f971 | 10 + 10 |
| concept carro a / b | 5c8cac6f-9878-423c-942f-6921fdad0880 / 8e61e643-ad9e-4056-b43d-8fb8e9f0f242 | 10 + 10 |
| concept caminhão a / b | 7802f459-3e5e-414d-90a0-b4f107567b98 / f24a9906-8f29-4680-b71b-498fd026e45e | 10 + 10 |
| model caixa a | a6cf40b1-6930-4a20-9a56-154762dc9c82 | 70 |
| model carro a | f75b7e71-6742-4530-95bc-89dc59f522ff | 70 |
| model caminhão b (not used) | 37cc5548-d80b-4961-8471-159014fc0770 | 70 |
| model caminhão a | 25e6a24c-66b4-4af5-b63e-4e93975f22b6 | 70 |
| **Total** | | **340** (balance 1730 → 1390) |

## The deck: people up on the trio (shared/deck.ts, client/sound-fleet.ts)

Up to 20 people climb onto `som-caminhao-*.glb` and ride on it (HANDOFF.md, "Caminhão de som com gente em cima").
Measured on the GLB height maps, in the truck's frame (x across, +z forward):

- the floor is at 3.04 m, inside the rails from x −0.96 to 0.92 and z −4.06 to 2.34;
- the truss posts and the moving heads are kept out (circles of 0.3 m);
- the two ladders hang at the back: feet at (±0.95, −5.6), tops on the deck.

The truss (up to 4.66 m) hung too low for a person standing on the deck. The game raises everything above 3.6 m by 0.6 m when the model
loads (`raiseTruss`, and the flags on it with it), so the truss now tops out at 5.26 m. The avenue's traffic signals
went up 0.5 m to match (client/world/props.ts). The files themselves are unchanged.

## Known limits
- The carro's grille carries a small generic badge that Tripo invented. It is not a real brand.
- The truck's thin rails and truss are simplified by the decimation. From the aerial camera they read as outlines.
- The LEDs are painted into the base colour; there is no emissive map.

## The music (shared/sound-tracks.ts, public/assets/audio/som/)
- 4 original instrumentals per side, made with Suno v6 through Evolink (`tools/som_music.py`), each request returning 2 songs; picked by structure (steady energy, best loop match).
- Cut by `tools/som_loop.py` into a 90-99 s loop:
  - the cut is on matching downbeats of the librosa bar grid;
  - the last 0.3 s is crossfaded into the bar before the start;
  - a wrap-continuous peak limiter at -0.5 dBFS, then a plain gain to -16 LUFS integrated (measured looping).
- Encoded mono, 44.1 kHz, 96 kbps MP3 with the LAME gapless tag.
- `som_loop.py check` decodes each file, joins 3 copies and checks the joins:
  - no sample step above the track's own 99.9th percentile;
  - the loudness change at each join equals the source song's own downbeat (e1 6.3 dB at the join vs 6.0 dB in the source).

| id | Side | Title | Style | Source | Loop (s) |
|---|---|---|---|---|---|
| d1 | 0 | Rodeio da Paulista | rodeio / country, fiddle, sanfona | d1_2 27.21-122.81 s | 95.5965 |
| d2 | 0 | Sertanejo de Avenida | sertanejo universitário | d2_2 36.01-134.49 s | 98.4759 |
| d3 | 0 | Marcha Verde e Amarela | marcha festiva, metais e surdos | d3_1 52.79-143.55 s | 90.7552 |
| d4 | 0 | Arquibancada Eletrônica | funk / eletrônico de estádio | d4_2 38.74-130.79 s | 92.0439 |
| e1 | 1 | Bateria da Consolação | samba-enredo, bateria | e1_2 14.02-106.29 s | 92.2644 |
| e2 | 1 | Forró da Augusta | forró pé de serra | e2_2 40.58-139.37 s | 98.7893 |
| e3 | 1 | Frevo de Rua | frevo de rua | e3_2 12.64-109.81 s | 97.1639 |
| e4 | 1 | Passeata em Rima | boom bap com MPB | e4_1 45.72-142.22 s | 96.5021 |

No candidate or party names, no real campaign slogans, no imitation of real jingles or artists. Nobody has listened to them yet: only the measurements above have been done.
