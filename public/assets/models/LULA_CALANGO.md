# Lula Prime and Calango gigante

Approved appearance: original grey-haired, muscular Lula Prime with navy suit,
red tie and fitted presidential sash, as shown riding the calango on 2026-10-14.
The later alternative image was rejected; none of its geometry or textures are used.

Both are permanent, separate R$200 products, restricted to team 1 (petista).
Backend keys: `personagem:manifestacao:lula-prime` and
`veiculo:manifestacao:calango`. Character ID 6; mount kind 10. Both support
admin gifts and signed account entitlements. Neither is a mission reward.

## Provenance

References: built-in image generation using the user's Lula photographs and
calango photographs. The original character prompt requested a heroic muscular
adult, salt-and-pepper curls and beard, tailored navy suit, red tie, presidential
sash, neutral A-pose and plain background. The calango prompt requested a realistic
quadruped with brown scales, pale throat, four distinct feet and a long tail.

Tripo v3.1 image-to-model, textured PBR, 20,000-face target:

- Lula: `a0e22da9-418c-442d-9f30-e0fc86e6aaf3` (70 credits).
- Lula biped rig: `19a56ba9-1c71-4c7b-a16b-aaffaa2d8e33` (25 credits).
- Calango: `61ce8d85-fba2-476b-8700-7ba2b2118f19` (70 credits).

Refined and authored with Blender 5.0 via the Blender MCP addon. Scripts are in
`tools/lula-refine-blender.py`, `tools/build-lula.ps1` and
`tools/calango-{prepare,load,rig}-blender.py`.

## Runtime assets

- `lula-v8.glb`: 1.90 m, +Z forward, floor at Y=0; eight ordinary animations,
  hand grip morphs and fitted palm anchors. Authored suit and facial texture remain fixed.
- `pvp-lula-v2.glb`: 24 physical-play clips, calibrated against the decoded runtime mesh.
- `crowd/lula-lod.glb`: skinned 3D LOD with preserved UV seams; atlas fallback in
  `public/assets/crowd/`. Portraits in `public/assets/portraits/`.
- `calango-v2.glb`: 5.6 m overall length, four articulated leg chains,
  three tail segments, neck/head/jaw, compact leather saddle, reins, stirrups,
  `Seat`, `Grip_L/R`, `Peg_L/R` and `BiteGrip` anchors. Four clips:
  `DinoIdle`, `DinoWalk`, `DinoRun`, `DinoBite` (shared controller names).
  The Blender-authored `CalangoTongue` extends, grips the opponent's waist,
  retracts into the mouth and then disappears during the hold and throw.
  `tools/calango-mouth-refine-blender.py` separates the jaw from the original
  closed skin, fits the hinge, models the palate, lower mouth, rounded gums and
  teeth, and moves the carry anchor into the opening. `TongueRoot` fixes the
  tongue inside the throat, independently of `BiteGrip`. The opening remains
  over 0.61 m while holding; the waist clears both jaws by at least 0.19 m.
  `tools/calango-tongue-pack.mjs` appends the tongue to this refined body while
  preserving the original texture materials and locomotion tracks.
- `shared/calango-mouth.json`: 30 Hz sampled mouth trajectory used by both
  authority and client capture. Bite only targets nearby opposing players;
  release impulse travels away from the mount's collision footprint.
- `shared/world.ts`: compound circles for the torso, tail, head and four lateral feet.

Validation covers catalog/side restrictions, signed entitlements, admin gifts,
desktop/mobile purchase flow, animation continuity, floor contact, rider hand
alignment, and WebSocket capture/release with one process and two gate processes.

The later facial refinement uses `tools/build-lula-face.ps1`: a seam-preserving
fairing limited to 3 mm on the facial surface and a baked reduction in facial
normal-map strength. The approved body, rig, clothing and clips stay unchanged.
