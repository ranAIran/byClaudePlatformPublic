// Ready for end-to-end encryption (phase B): every record splits into what the sync server may see
// (ids, kinds, times, which device) and the content, which will be encrypted on the device.
const META = {
  node: ["id", "type", "created", "updated"],
  journal: ["id", "op", "at", "device", "seq", "by"],
  input: ["seq", "at", "device", "kind"],
};
export function splitForSync(kind, rec) {
  const keys = META[kind] || ["id"], meta = { kind }, rest = {};
  for (const [k, v] of Object.entries(rec)) { if (keys.includes(k) && k !== "kind") meta[k] = v; else rest[k] = v; }
  if (kind === "input") meta.inputKind = rec.kind;
  return { meta, content: JSON.stringify(rest) };
}
