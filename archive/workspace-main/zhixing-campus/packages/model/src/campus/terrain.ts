/** Terrain is composed before any buildings or roads. No per-building height stamps. */
export const campusLake = { id: "lake", x: -12, z: 36, rx: 29, rz: 20 };
// Sports surfaces need a level site over their entire footprint, including the apron.
// Blend the cut/fill into the hillside so adjacent paths use the same finished ground.
export const sportsSites = {
  athletics: { x: -68, z: 12, width: 32, depth: 46, elevation: 2.3, blend: 4 },
  courts: { x: -63, z: 48, width: 29, depth: 20, elevation: 1.2, blend: 3 },
} as const;
export const landforms = [
  {
    id: "north-shoulder",
    x: -22,
    z: -56,
    rx: 52,
    rz: 18,
    height: 15,
    skirt: 0.85,
  },
  {
    id: "east-shoulder",
    x: 76,
    z: -47,
    rx: 37,
    rz: 22,
    height: 19,
    skirt: 1.2,
  },
  {
    id: "west-learning-slope",
    x: -36,
    z: -8,
    rx: 16,
    rz: 29,
    height: 6.5,
    skirt: 0.65,
  },
  {
    id: "east-learning-slope",
    x: 6,
    z: -8,
    rx: 15,
    rz: 29,
    height: 10,
    skirt: 0.65,
  },
  {
    id: "library-saddle",
    x: -14,
    z: -13,
    rx: 12,
    rz: 16,
    height: 8.2,
    skirt: 0.9,
  },
  {
    id: "science-shoulder",
    x: 34,
    z: -22,
    rx: 11,
    rz: 10,
    height: 13,
    skirt: 0.5,
  },
  { id: "life-foothill", x: 51, z: 17, rx: 26, rz: 24, height: 3.2, skirt: 1 },
  {
    id: "gym-foothill",
    x: -76,
    z: -23,
    rx: 19,
    rz: 14,
    height: 5.5,
    skirt: 0.8,
  },
  {
    id: "athletics-meadow",
    x: -68,
    z: 12,
    rx: 16,
    rz: 26,
    height: 2.3,
    skirt: 0.8,
  },
  {
    id: "courts-meadow",
    x: -63,
    z: 48,
    rx: 18,
    rz: 13,
    height: 1.2,
    skirt: 0.8,
  },
] as const;
export const smoothStep = (v: number) => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};
export function lakeRadius(angle: number) {
  return (
    1 + 0.075 * Math.sin(angle * 3 + 0.5) + 0.045 * Math.cos(angle * 5 - 1)
  );
}
export function terrainHeight(x: number, z: number) {
  let h = 0;
  for (const f of landforms) {
    const q = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
    h = Math.max(h, f.height * (1 - smoothStep((q - 1) / f.skirt)));
  }
  // Broad mountain back, joined to both campus shoulders rather than separate pedestals.
  const ridge = 23 + 4 * Math.sin(x * 0.052) + 2 * Math.sin(x * 0.12 + 0.8);
  const rise = smoothStep((-z - 74) / 16);
  h = h * (1 - rise) + ridge * rise;
  // The lake basin and its shore are cut into this same continuous hillside.
  const dx = (x - campusLake.x) / campusLake.rx,
    dz = (z - campusLake.z) / campusLake.rz;
  const shore = Math.hypot(dx, dz) - lakeRadius(Math.atan2(dz, dx));
  if (shore < 0) h = -0.25;
  else if (shore < 0.18) h *= smoothStep(shore / 0.18);
  // A shallow, graded street at the mountain foot; shop slabs sit on this ground.
  const street =
    smoothStep((x - 79) / 11) *
    smoothStep((z + 24) / 12) *
    (1 - smoothStep((z - 43) / 10));
  const streetGrade = Math.max(0.15, (34 - z) * 0.065);
  h = h * (1 - street) + streetGrade * street;
  for (const site of Object.values(sportsSites)) {
    const outside = Math.hypot(
      Math.max(0, Math.abs(x - site.x) - site.width / 2),
      Math.max(0, Math.abs(z - site.z) - site.depth / 2),
    );
    const weight = 1 - smoothStep(outside / site.blend);
    h = h * (1 - weight) + site.elevation * weight;
  }
  return h;
}
