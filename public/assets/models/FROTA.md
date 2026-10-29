# Frota: the carreta, the dirigível, the car, the GM truck and the motorcycles (Tripo models)

The bought vehicles' models (client/fleet.ts), and since 2026-10-12 the regular car and the staff's sound truck
(client/actors.ts; see "The car and the GM truck" below). Each one is a Tripo v3.1 model normalised in Blender, in its side's
colours: team 0 green and yellow, team 1 red (the green turns crimson and the yellow white, as in the som models).
The side's prints (banners) and flags are not in the files: the game hangs the prints on the models' empties and
clamps the flags where client/flag-spots.ts says (measured on these files; the `FlagMount_*` empties left some poles
in the air, see "Flags" below), so the election-period prints stay in code (decorations.ts `stickerTexture`). Until a
file loads, or if it fails, the stand-in built in code takes its place.

| file | what | tris | size |
| --- | --- | --- | --- |
| carreta-cab-0.glb / -1 | 6x4 cab-over tractor, 6.8 x 2.7 m (3.0 with mirrors), 4.3 m to the deflector | 16,560 | 596 / 628 KB |
| carreta-bau-0.glb / -1 | box semi-trailer, 12.5 x 2.6 m, 4.34 m tall, three rear axles | 14,850 | 269 / 271 KB |
| dirigivel-0.glb / -1 | blimp, 24 m, envelope radius 3.4 m, X tail, gondola and two engines | 11,237 | 285 / 286 KB |

A carreta is 31,410 triangles and 0.87 / 0.90 MB per side. The textures (base colour and normal map, WebP) are
2048 px on the cab and 1024 px on the trailer and the blimp, which are plain surfaces mostly under the print. The
smaller size keeps a phone's GPU memory down when both sides' vehicles are on screen.

## Conventions

These are as in SOM.md: metres, +Z forward, Y up, meshopt, WebP (EXT_texture_webp), and one textured body mesh
(`Frota_<cab|bau|blimp>`).

- **cab:**
  - `Wheel_Front_L/R`, `Wheel_Rear_L/R` and `Wheel_Rear2_L/R` pivots, with extras.radius 0.534 (front) and 0.573 /
    0.571 (the drive axles' duals); the front pair steers. The wheels are modelled ("Wheels" below).
  - `Hitch` is the fifth wheel (0, 1.18, -2.07 in the file). The game puts it on the carreta's reference point, so
    the cab runs from 5.47 m ahead of it to 1.33 m behind.
- **bau:**
  - `Wheel_Rear_L/R`, `Wheel_Rear2_L/R` and `Wheel_Rear3_L/R` pivots (duals, radius 0.61), none steering.
  - `Kingpin` sits 1.2 m behind the trailer's front, on the cab's Hitch; the trailer group turns about it. In the
    game, the trailer runs from +1.2 to -11.3 m (as the stand-in's did) and its axles are at -6.4, -7.6 and -8.8 m.
  - `Banner_L`, `Banner_R` and `Banner_Back` empties, with extras width and height in metres: the side's print
    covers 11.9 x 2.44 m on each side and 2.3 x 0.5 m over the doors.
  - `FlagMount_F` and `FlagMount_B` on the roof (the game uses client/flag-spots.ts: the same places, out on the roof's
    edges, with a clamp over the edge).
- **blimp:**
  - The origin is on the envelope's axis, at its middle; the game sets the altitude.
  - `Hull` carries extras.profile = `[[z, a, b], ...]`: per slice, the envelope's half-width a at the side and its
    half-height b above the axis. The side print is bent to that ellipse, 0.15 m off it.

## Rebuilding

The raw Tripo files are in artifacts/raw/v3/ (not in git). Rebuild with:

```
bash tools/frota_pack.sh artifacts/raw/v3/frota-model-cab-a-model_url.glb cab carreta-cab 2048 front=+y faces=16000 xscale=0.9 dual=Rear,Rear2
bash tools/frota_pack.sh artifacts/raw/v3/frota-model-bau-a-model_url.glb bau carreta-bau 1024 front=-y faces=12000 xscale=0.66 zscale=0.96 dual=Rear,Rear2,Rear3 tyre_r=0.61,0.61,0.61
bash tools/frota_pack.sh artifacts/raw/v3/frota-model-blimp-a-model_url.glb blimp dirigivel 1024 front=-y faces=12000
```

What tools/frota_models.py fixes in Tripo's output:

- It squares the model up (PCA), sets the front to -Y in Blender, and scales to the length. Tripo builds run wide:
  `xscale` brings the cab to 2.7 m and the trailer to 2.6 m.
- **Trailer:** it stands on its tyres, because the landing legs reach lower than they do in the model.
- **Blimp:** the envelope came out fat and oval (8.7 x 7.9 m), so it is scaled round to radius 3.4 about its axis.
- **Blimp fins:** Tripo kept only the fins' yellow outlines. Everything outside the envelope over the tail is cut,
  and four solid X-tail fins are modelled in. Their faces map to one texel of the envelope's own green and one of
  its yellow, so there is one material, and the team-1 recolour turns them crimson and white with the rest.

## Tripo (2026-10-11): 260 credits

| step | task id | credits |
| --- | --- | --- |
| concept cab-a (cab-over 6x4, used) | 6538569e-c7bc-4c2f-b774-4a8b027724a6 | 10 |
| concept cab-b (long-nose, not used) | 2b8a16c0-269e-4e83-bd54-7599c98d5bb2 | 10 |
| concept bau-a (box trailer, used) | 53b88425-1de0-4ee6-94dd-7ec12a654177 | 10 |
| concept bau-b (refused by the content filter) | none | 0 |
| concept blimp-a (yellow bands, X tail, used) | 1731530a-0c1f-4209-9f11-2ef53b19f044 | 10 |
| concept blimp-b (not used) | 98ce94e2-52ec-4ae4-98ce-6af3eac33a08 | 10 |
| image-to-model cab-a (v3.1, 20k faces) | bc8b87cb-35a2-442b-84dd-d76973c4c8ce | 70 |
| image-to-model bau-a (v3.1, 12k faces) | 82659da5-1ff0-491f-9551-dc6e138e0d4f | 70 |
| image-to-model blimp-a (v3.1, 14k faces) | 6822dbcd-19c3-426c-bccd-e41db303a1d1 | 70 |

## The car and the GM truck (2026-10-12)

The car ("Carro", vehicle kind 1) and the staff's sound truck ("Som · GM", kind 2) replace car-v5.glb and
truck-v5.glb, which stay in the repo as the fallback.

| file | what | tris | size |
| --- | --- | --- | --- |
| carro-0.glb / -1 | generic five-door hatchback (no brand), 4.2 x 1.75 m (2.14 with mirrors), 1.87 m to the aerial; green with a yellow roof and stripe, red with white | 13,732 | 567 / 587 KB |
| caminhao-gm-0.glb / -1 | two-axle sound truck, 6.8 x 2.5 m (3.3 with the line arrays and mirrors), 4.4 m to the line arrays: a cab-over cab, a speaker wall on both sides, a roof deck with a rail, a light truss and two line arrays | 20,936 | 604 / 633 KB |

Textures are 2048 px (base colour and normal, WebP).

- **Geometry:** the two files of a vehicle carry the same geometry; only the texture differs. The game builds every
  car from the team-0 file and paints the left side's body with the team-1 file's material when a red driver takes
  it (decorations.ts showVehicleSide). That replaces the shader recolour, which stays only for the old models.
- **Nodes:**
  - `Wheel_Front_L/R` and `Wheel_Rear_L/R` pivots, with extras.radius 0.343 (car), 0.386 front and 0.385 rear (the
    truck's rear are duals). Each pivot is on its wheel's centre at the radius' height ("Wheels" below). The wheels
    under them are `Tyre_*`, not `Wheel_*_Tyre`, because client/actors.ts spins every `Wheel_*` node.
  - `FlagMount_L/R` on the roof, or on the truck's deck rail. The game uses client/flag-spots.ts instead: the GM
    truck's empties sat 16 and 29 cm over its deck (the 95th percentile of what is near picked up the rail).
  - A `Sticker` empty on the right flank, with extras width and height in metres. decorations.ts projects the
    side's sticker there and mirrors it to the left: on the car it is centred across the doors (1.15 x 0.40 m at
    0.74 m up); on the truck it is on the cab door (0.95 x 0.38 m at 1.2 m up, 2.5 m ahead of the middle).
  - The body is `Frota_car` / `Frota_truck` (decorations.ts vehicleBody finds `tripo*` or `Frota_*`).
- **Fit:** the footprints in shared/world.ts are unchanged: the car is 4.2 x 1.8 m and the truck 6.8 x 2.6 m. The
  truck's name tag sits at 4.8 m, clear of its line arrays.
- **The roof deck:** up to 20 people climb onto the GM truck's roof (shared/deck.ts): floor at 2.67 m, x −0.95 to
  0.68 and z −2.98 to 1.42 in the truck's frame, ladder at the right front (foot at 1.85, 1.55).
- **Tripo fixes:** the car had a slot through both front doors at the sill (about 0.5 x 0.15 m, open to the inside).
  `patch=` closes it with a panel a hand inside each door, mapped to a texel of the door's own paint.

### Rebuilding

```
bash tools/frota_pack.sh artifacts/raw/v3/frota2-model-carro-a-model_url.glb car carro 2048 front=-y radius=0.34 xscale=0.92 sticker_z=0.0 sticker_y=0.74 sticker_w=1.15 sticker_h=0.40 sticker_x=0.9 patch=0.862,0.32,0.98,0.58,0.84
bash tools/frota_pack.sh artifacts/raw/v3/frota2-model-gm-b-model_url.glb truck caminhao-gm 2048 front=-y radius=0.53 sticker_z=2.5 sticker_y=1.2 sticker_w=0.95 sticker_h=0.38 rim=dark dual=Rear tyre_in=0.55
```

### Tripo (2026-10-12): 180 credits

| step | task id | credits |
| --- | --- | --- |
| concept carro-a (hatchback, yellow roof, used) | a741bfdf-375e-487c-80f5-9818e1e7af55 | 10 |
| concept carro-b (not used) | 69a4face-fec7-4b2a-8c21-fd7e21937347 | 10 |
| concept gm-a (not used) | 89c0529f-00a2-4681-b701-f036a9b2d30d | 10 |
| concept gm-b (speaker wall, truss, line arrays, used) | 8793fa59-2f70-457b-90db-d2fe5b9e80b4 | 10 |
| image-to-model carro-a (v3.1, 16k faces) | ea477c2b-d942-4c8d-a7c2-18611c5c6ff2 | 70 |
| image-to-model gm-b (v3.1, 20k faces) | d8a7bb1f-cb64-430c-a391-2ffd94830dc4 | 70 |

## The motorcycles: the moto and the chopper (2026-10-12)

Two bought vehicles (shared/vehicles.ts MOTO = 7, CHOPPER = 8; Brasil TD sells them at R$ 3,00 and R$ 5,00,
games.ts MOTO_CENTS / CHOPPER_CENTS). client/moto.ts builds them, seats the rider and animates the ride.

| file | what | tris | size |
| --- | --- | --- | --- |
| moto-0.glb / -1 | generic 150 cc street bike (no brand), 2.05 m long: round headlight, upright bars, flat dual seat, rear rack; green tank and side covers with a yellow stripe, or crimson with white | 13,073 | 630 / 644 KB |
| chopper-0.glb / -1 | generic custom cruiser in the chopper style (no brand, logo or trademark), 2.45 m long: V-twin, raked springer fork (40°), ape-hanger bars, forward controls, sissy bar; green tank and fenders with yellow flames, or crimson with white | 14,943 | 783 / 810 KB |

Textures are 2048 px (base colour and normal, WebP). As with the car, both files of a bike carry the same geometry.

- **Nodes** (tests/vehicle-assets.test.ts checks them):
  - The body is `Frota_moto` / `Frota_chopper`. The origin is on the ground between the wheels.
  - `Steer` is an empty on the steering head. Its extras.axis is the steering axis, from the front axle up through the
    head (rake 25.4° on the moto, 40.1° on the chopper). Under it are the `Fork` mesh (fork, bars, headlight, front
    fender), `Grip_L/R` (the middle of each grip) and `Wheel_Front`.
  - `Wheel_Front` / `Wheel_Rear` pivots sit on the wheels' centres, with extras.radius: 0.293 / 0.307 m on the moto,
    0.330 / 0.334 m on the chopper. The wheels are modelled ("Wheels" below) and stand on the ground, as `Tyre_*`
    under the pivots: the moto's cast five-spoke wheels with a front disc, the chopper's wire wheels (21" front, a
    fat 16" rear). Faces painted in the side's colour (the fenders close over the tyres) stay on the body or the fork.
  - `Seat` is on the seat's top. `Peg_L/R` are the foot pegs (the chopper's forward controls).
  - `FlagMount` is the moto's rear rack or the top of the chopper's sissy bar. The game moves it to `BIKES.flag`
    (client/moto.ts): on the rack's cross tube (0.882 m; the empty was 4 cm over it) and on the bar's apex.
  - `Sticker` is on the tank's right side, with width and height in metres.
- **The ride** (client/moto.ts, client/actors.ts):
  - root (heading) > lean > body (bob and pitch) > model. The wheels spin by speed / radius. The fork steers about
    the axis from the turn rate. The bike leans by atan(v·ω/g) (up to 35° on the moto and 29° on the chopper),
    smoothed.
  - Stopped, the bike tips onto the rider's left foot. Parked after the rider leaves, it settles on its side stand
    for a moment and then goes.
  - The rider is the real avatar: hips on `Seat`, hands on the grips (two-bone IK; the right hand a fist, the left curled, as the avatars have no left fist), feet on the pegs, head
    into the turn. The moto is ridden upright; on the chopper the rider leans back with the arms up and the feet
    forward.
  - Getting on and off blends over 0.45 s. Far riders, or ones whose avatar is not loaded yet, are a seated figure
    in the side's colours.
  - The flag on the mount is the rider's own (a premium or custom one if worn, else the side's), as cloth that
    trails with speed. The side's sticker is on the tank.

### Rebuilding

The bike branch of tools/frota_models.py takes the wheels (`wheels=z:r[:h],...`, glTF z of each axle, radius and
optionally the centre's height), the steering head (`head=z,y`), what turns with it (`steer=ycut,zcut,bars_y,bars_z,margin`),
the rider's points and the mounts:

```
bash tools/frota_pack.sh artifacts/raw/v3/moto-model-moto-b-model_url.glb moto moto 2048 front=-y wheels=0.725:0.31,-0.587:0.302 wheel_x=0.065,0.055 head=0.43,0.94 steer=0.70,0.40,0.97,0.1,0.04 seat_z=-0.2 grip_x=0.40 grip_top=1.12 peg=0.21,0.30,-0.04 flag=0.12,0.882,-0.84 sticker=0.11,0.875,0.17,0.22,0.08
bash tools/frota_pack.sh artifacts/raw/v3/moto-model-chopper-b-model_url.glb chopper chopper 2048 front=-y wheels=0.898:0.334:0.354,-0.876:0.356 wheel_x=0.07,0.09 head=0.34,1.0 steer=0.72,0.5,1.08,-0.1,0.04 seat_z=-0.42 grip_x=0.47 grip_top=1.45 peg=0.33,0.36,0.21 flag=0,1.33,-1.076 sticker=0.095,0.93,0.17,0.2,0.075
```

If a rebuild moves a wheel or a grip, update `BIKES` in client/moto.ts (front/rear axle z, radius, head, seat, grip,
peg and flag), which the code stand-in and the rider's pose use until the file loads. tools/visual-qa.html has a
"Pilotar" mode (bike, side, avatar, move: stopped, slow, straight, left, right; mount) for checking a rebuild.

### Tripo (2026-10-12): 180 credits (balance 860 to 680)

| step | task id | credits |
| --- | --- | --- |
| concept moto-a (naked commuter, not used) | a3f2c0fd-9726-4b7b-a198-49524e773b12 | 10 |
| concept moto-b (commuter with rear rack, used) | 0f3f29e3-30d2-4338-899d-95549c425b48 | 10 |
| concept chopper-a (disc rear wheel, not used) | e21ce176-716c-4bf3-bea2-20b9ebcbf963 | 10 |
| concept chopper-b (springer fork, flames, sissy bar, used) | 75c0d20f-75fc-4283-aa2b-78d7e214fd5a | 10 |
| image-to-model moto-b (v3.1, 16k faces) | bd374f6e-81ce-4935-9fb7-683ebbdd5602 | 70 |
| image-to-model chopper-b (v3.1, 20k faces) | 65c92f2a-8845-41c1-82cc-2d697b84d5bf | 70 |

## Wheels (2026-10-12): modelled, in place of Tripo's tyres

Rafael found tyres missing or incomplete. Contact sheets of every wheel (tools/wheel-qa.html, below) and a count
of what spins showed, before:

- **caminhao-gm:** the tyres are r 0.386, but the pivots said 0.52 / 0.534 and sat about 13 cm above the tyres'
  centres: the wheels wobbled and spun too slowly for the speed. The cut took pieces of the fenders and mudflaps
  (they spun), and left 40 to 70 % of each tread and the duals' inner tyres on the body.
- **carreta-bau:** the tyres are r 0.61; the cut, on a 0.52 circle, took only their lower part, so their tops
  stood still on the body, and its pieces reached past the radius the game spins them by.
- **carreta-cab:** a piece of tyre on top of every wheel stayed on the body; the drive axles' pivots were 2 to
  3 cm off their tyres' centres (a wobble), and those tyres floated 2 to 3 cm above the road.
- **som-carro:** Tripo made the front tyres tilted, an oval slab that wobbled when it spun, with part of the tread
  on the body; the brake calipers spun with the rear wheels.
- **moto, chopper:** a quarter of the moto's front tread was missing, each front wheel had one sidewall only, and
  pieces of tread (the chopper's rear inner side) stayed on the body.
- **carro, som-caminhao:** whole, but coarse, with a few faces of the body inside each wheel.

So tools/wheel_build.py, which tools/frota_models.py and tools/som_models.py call for every wheeled vehicle, now
replaces the wheels:

1. **Measure** each of Tripo's tyres on its rubber (the faces painted dark and neutral): seen from the side, the
   circle with rubber all round its lower 270 degrees and none just outside it (where an arch or a step painted
   dark would be), refined by least squares; its width from the rubber across. An axle's two wheels take one radius
   and one place along the vehicle; each keeps its own place across.
2. **Clear** the body inside the cylinder of Tripo's tyre and of the new wheel: every face with its middle inside,
   unless it reaches out into the arch or the fender; also the rubber a little further in and out (a dual's inner
   tyre, a tilted tyre), Tripo's hub caps standing out of the tyre, slivers of tyre reaching into the arch and the
   flattened contact patch. On the bikes the painted fenders stay, and so do the fork legs and the swingarm.
3. **Model** the wheel under its `Wheel_*` pivot (extras.radius) as one `Tyre_*` mesh: a tyre (beads, bulging
   sidewalls, shoulders, a grooved tread) on a rim in the vehicle's style:
   - `alloy` (carro, som-carro): ten spokes from a domed centre, a brake disc and a dark well behind them;
   - `steel` (caminhao-gm, the carreta, the trio): a dished disc with hand holes, a ring of nuts and a hub; `dual`
     axles get a pair of tyres, the inner one plain and in shadow;
   - `cast` (moto): five spokes and a front brake disc; `wire` (chopper): forty laced spokes.
   24 segments round on the trucks, 28 on the cars, 36 on the bikes. The pivot stands on the wheel's centre at the
   radius' height, so the wheel rolls on the road without slipping.
4. **Paint** its faces with single texels of the vehicle's own texture, as the blimp's fins are: rubber (luminance
   0.06), a shadow (0.025), the rim's dark grey (0.17) or silver (0.70), a hub grey (0.42) and chrome (0.86). They
   are neutral and flat 24 px around (the mipmaps keep them from afar), picked before the team-1 recolour, so both
   sides' files carry the same UVs, the recolour leaves the wheels alone, and the red car (team-0 wheels under the
   team-1 body) looks right. One material per file still.

The older convention (`Wheel_*_Tyre` meshes on the carreta and the som vehicles) is gone: every wheel mesh is
`Tyre_*`. client/sound-fleet.ts and client/fleet.ts find the pivots by `Wheel_<axle>_<L|R>`, client/actors.ts by
`Wheel_`, client/moto.ts by name; none reads the meshes.

| file | wheels (radius m, width m) | tris | size before | size after |
| --- | --- | --- | --- | --- |
| carro-0 / -1 | 4 alloy: 0.343, 0.196 | 14,003 to 13,732 | 664 / 684 KB | 567 / 587 KB |
| caminhao-gm-0 / -1 | steel: front 0.386, 0.30; rear duals 0.385, 0.59 the pair | 18,000 to 20,936 | 611 / 640 KB | 604 / 633 KB |
| carreta-cab-0 / -1 | steel: front 0.534, 0.28; drive duals 0.573 and 0.571, 0.61 | 16,000 to 16,560 | 693 / 724 KB | 596 / 628 KB |
| carreta-bau-0 / -1 | steel: three axles of duals, 0.61, 0.52 to 0.54 | 12,000 to 14,850 | 327 / 329 KB | 269 / 271 KB |
| som-caminhao-0 / -1 | steel, black: front 0.477, 0.25; tandem duals 0.452, 0.56 | 22,999 to 25,321 | 749 / 780 KB | 714 / 745 KB |
| som-carro-0 / -1 | alloy, dark: front 0.323, rear 0.3125, 0.23 | 13,999 to 15,656 | 612 / 642 KB | 567 / 596 KB |
| moto-0 / -1 | cast: front 0.293, 0.088; rear 0.307, 0.105 | 14,000 to 13,073 | 693 / 707 KB | 630 / 644 KB |
| chopper-0 / -1 | wire: front 0.330, 0.091; rear 0.334, 0.167 | 18,000 to 14,943 | 891 / 918 KB | 783 / 810 KB |

The files got smaller although the trucks have more triangles: the modelled wheels compress far better than Tripo's
tyres did, and the textures are byte for byte the same. Away from the wheels the bodies are unchanged (within the
0.4 mm of the quantisation), and so are every empty the game reads (Hitch, Kingpin, Banner_*, FlagMount_*, Sticker,
Seat, Grip_*, Peg_*) and the decks shared/deck.ts was measured on. The bikes' steering axis tilts a little (25.4
and 40.1 degrees of rake), as it runs through the front wheel's true centre; client/moto.ts BIKES follows.

### Options

frota_pack.sh and som_pack.sh pass them to the Blender scripts:

- `wheel=alloy|steel|cast|wire` (by default alloy on the cars, steel on the trucks, cast on the moto, wire on the
  chopper), `rim=light|dark`, `spokes=N` (alloy), `rim_r=` (the rim's radius as a part of the tyre's, per axle on
  the bikes);
- `dual=<axles>`: which axles have pairs of tyres (`Rear,Rear2`);
- `tyre_in=`: how far from the middle, across, the search for the tyres starts (metres; lower it until a dual's
  inner tyre is inside, as on the GM truck, 0.55);
- `tyre_r=` a radius per axle, for axles alike (the trailer's third is crowded by its bumper); `tyre_w=` a width per
  axle (the som-carro's tilted front tyres measure wide);
- `WHEEL_DEBUG=<dir>` (environment): each wheel's rubber points saved as .npy, and what is left near it printed.

The motorcycles' `tyre_tol` is gone; their `wheels=` and `wheel_x=` still give the first guess and the width that is
cleared.

### Checking

- `tools/wheel-qa.html` (served by Vite, e.g. `node node_modules/vite/bin/vite.js --port 5291`, never 5178):
  `?m=carro-0` is the overview (six views: each side, three quarters front and back, low, from below), each static,
  with what spins tinted magenta, and spinning (the average of a turn: a whole round tyre stays a solid ring, a piece
  left on the body stays sharp, a hole shows through, a pivot off the tyre's centre blurs its edge). `&sheet=wheels`
  is every wheel close: outside, low, inside from under the body, and up into the arch. `&hide=1` draws the body
  alone (the arches should be empty). `m=carreta-cab-0,carreta-bau-0` couples the trailer; `&dir=../artifacts/x`
  reads a test build (`OUT=artifacts/x bash tools/frota_pack.sh ...`).
- `tools/visual-qa.html`, Pilotar: the bikes ridden through the game's code, leaning in turns.
- tests/vehicle-assets.test.ts, on every file above: each `Wheel_*` pivot holds one `Tyre_*`, unrotated, standing at
  its radius; the tread reaches the radius in all 72 sectors round, nothing spins past it, both sidewalls are closed
  all round, no face of the body has its middle inside the wheel; one material; both sides' files carry the same
  nodes, extras, positions and UVs. On the old files it fails at once (the GM truck's treads missed 38 to 52 of the
  72 sectors).

## Flags

Each pole's foot stands on the bodywork with a holder around it (decorations.ts `vehicleFlag` / `withHolder`, drawn in
the pole's own mesh: no extra draw call): a magnetic base on a car's roof, a clamp over the carreta's roof edge, a
U-clamp on a rack, a truss or a sissy bar, a plate on the GM truck's deck beam. The cloth flies out to its side and
0.5 rad back (straight back on the motorcycles). Where each one goes is client/flag-spots.ts, by model, for the
stand-ins too. tests/vehicle-flags.test.ts builds every vehicle as the game does (stand-in and model, both sides) and
checks each foot is within 3 cm of the bodywork and stays put while it drives, turns, leans and bounces; a pole lifted
6 cm fails it. After a rebuild that moves a roof, a deck or a truss, run it and update flag-spots.ts.
`tools/flag-qa.html?v=<carro|gm|carreta|carro-som|trio|moto|chopper>&team=<0|1>[&standin=1][&mark=1]` (Vite on a free
port, never 5178) draws the chase camera, both sides and each pole's foot close up.
