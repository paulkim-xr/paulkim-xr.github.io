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

The original is 8.9 MB, and almost none of that is of any use here:

- materials, textures (a 2048² AO/thickness map), tangents and texture
  coordinates removed;
- welded, then simplified to ~6% of its triangles — 188,871 down to 11,332;
- vertex attributes quantised.

Result: **159 kB**, down from 8.9 MB. Reproduced with `@gltf-transform/cli` and
`meshoptimizer`; no build-time dependency, the reduction was done once and the
result committed. Normals survived, which is what lets the room shade it.

The original subsurface-scattering extensions (`KHR_materials_volume_scatter`
and friends) went with the materials. three.js does not implement all of them,
so the frosted-glass look the sample is built to show off was never going to
survive the trip regardless.

### On "textured"

There is no colour texture to restore. The sample carries exactly one image, an
AO/thickness map, and everything else about how it looks in the Khronos viewer
comes from the subsurface scattering. So the room shades the skull — lit, matt,
warm against the cool shell — rather than texturing it, and the form you see is
the geometry's own.

Bringing the AO map back is the one real upgrade available. It would add crevice
shading the mesh cannot express by itself: sutures, the depth of the orbits, the
temporal fossa. It is not free — the reduction above discarded the texture
coordinates, so the mesh would have to be decimated again keeping UVs, and a
downscaled map costs perhaps another 80 kB. Deliberately not done yet.
