# Parque Trianon advertising structures

Tripo v3.1 text-to-model task `ed83b436-2238-4e0f-9830-65760989a336`,
20 credits, using `tools/trianon-billboard-request.json`.
Refined with Blender MCP: `tools/trianon-billboard-blender.py` straightens and
fits the cabinet, replaces the support legs with two accurately placed steel
posts, and adds bolted base plates. `tools/trianon-pack.mjs` shares materials
and merges the structure to three draws and about 221 KB.

Three copies in `shared/park-billboards.ts`, a 20 × 11.25 m advertising face,
4.5 m clear beneath it. The two posts have matching authoritative collision.
The dynamic face uses the existing paid top-five advertising system. No image
or text is baked into the model. Keep both park gates and the view from the
avenue clear when changing positions.
