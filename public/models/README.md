# Models

## skull.glb

The object at the centre of the Spherical Viewing Room.

- **Source:** [ScatteringSkull](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull),
  from the Khronos glTF Sample Assets collection.
- **Author:** Vladimir Petkovic.
- **Licence:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
  Public domain dedication — no attribution required, no conditions on use or
  redistribution. Credited here anyway, because it costs nothing.

### What was changed

The original is 8.9 MB, and almost none of that is of any use here. The room
draws the skull the way the rest of the site draws everything — a faint fill
under a wireframe — so the surface finish was thrown away and the mesh reduced
to the point where its wireframe is a legible lattice rather than a grey smear:

- materials, textures (a 2048² AO/thickness map), tangents and texture
  coordinates removed;
- welded, then simplified to ~6% of its triangles — 188,871 down to 11,332;
- vertex attributes quantised.

Result: **159 kB**, down from 8.9 MB. Reproduced with `@gltf-transform/cli` and
`meshoptimizer`; no build-time dependency, the reduction was done once and the
result committed.

The original subsurface-scattering extensions (`KHR_materials_volume_scatter`
and friends) went with the materials. three.js does not implement all of them,
so the frosted-glass look the sample is built to show off was never going to
survive the trip regardless.
