/**
 * Migration check — run with:  node src/lib/__migration_check.mjs
 *
 * Verifies the 1 -> 2 localStorage migration before anything reads through it.
 * Mirrors the logic in db.ts against a fake localStorage. Throwaway harness:
 * delete it once there is a real test runner in the project.
 */

/* ----------------------------- fake localStorage ---------------------------- */

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size;
    },
    dump: () => Object.fromEntries(map),
  };
}

/* --------------- the logic under test, copied verbatim from db.ts ----------- */

const SCHEMA_VERSION = 2;
const LS = { declarations: "domus.ledger.declarations", schema: "domus.schemaVersion" };

const MONTH_RE = "\\d{4}-(?:0[1-9]|1[0-2])";

function parseObligationKey(key) {
  const m = new RegExp(`^(.+):(${MONTH_RE}):(stay|takk)$`).exec(key ?? "");
  return m ? { propertyId: m[1], month: m[2], type: m[3] } : null;
}

function parseRentKey(key) {
  const m = new RegExp(`^(.+):(${MONTH_RE})$`).exec(key ?? "");
  return m ? { propertyId: m[1], month: m[2] } : null;
}

const obligationKey = (p, m, t) => `${p}:${m}:${t}`;

function migrateLocalStorage(localStorage) {
  const stored = Number(localStorage.getItem(LS.schema));
  const version = Number.isFinite(stored) && stored > 0 ? stored : 1;
  if (version >= SCHEMA_VERSION) return;
  if (version < 2) migrateDeclarationKeysToObligations(localStorage);
  localStorage.setItem(LS.schema, String(SCHEMA_VERSION));
}

function migrateDeclarationKeysToObligations(localStorage) {
  const raw = localStorage.getItem(LS.declarations);
  if (!raw) return;

  let map;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    map = parsed;
  } catch {
    return;
  }

  const next = {};
  for (const [key, rec] of Object.entries(map)) {
    if (parseObligationKey(key)) {
      next[key] = rec;
      continue;
    }
    const old = parseRentKey(key);
    if (!old) {
      next[key] = rec;
      continue;
    }
    const moved = obligationKey(old.propertyId, old.month, "stay");
    if (!(moved in next)) next[moved] = rec;
  }

  localStorage.setItem(LS.declarations, JSON.stringify(next));
}

/* --------------------------------- harness -------------------------------- */

let failures = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function decls(storage) {
  return JSON.parse(storage.getItem(LS.declarations) ?? "{}");
}

const REC = { zero: false, amount: "3500", recordedAt: "2026-07-04T10:00:00.000Z" };
const ZERO = { zero: true, recordedAt: "2026-07-04T10:00:00.000Z" };
const UUID = "8f14e45f-ceea-467a-9f39-9c5c1d3f0b21";

console.log("\n1 -> 2  declaration keys gain an obligation type\n");

/* 1. the ordinary case */
{
  const s = makeStorage({
    [LS.declarations]: JSON.stringify({ [`${UUID}:2026-06`]: REC, [`${UUID}:2026-05`]: ZERO }),
  });
  migrateLocalStorage(s);
  check("old records move to :stay", decls(s), {
    [`${UUID}:2026-06:stay`]: REC,
    [`${UUID}:2026-05:stay`]: ZERO,
  });
  check("version is stamped", s.getItem(LS.schema), "2");
  check("no record is lost", Object.keys(decls(s)).length, 2);
}

/* 2. idempotency — the whole point of the version stamp */
{
  const s = makeStorage({ [LS.declarations]: JSON.stringify({ [`${UUID}:2026-06`]: REC }) });
  migrateLocalStorage(s);
  const once = decls(s);
  migrateLocalStorage(s);
  migrateLocalStorage(s);
  check("running three times equals running once", decls(s), once);
}

/* 3. already migrated, no version stamp (interrupted run) */
{
  const s = makeStorage({
    [LS.declarations]: JSON.stringify({ [`${UUID}:2026-06:stay`]: REC, [`${UUID}:2026-06:takk`]: ZERO }),
  });
  migrateLocalStorage(s);
  check("typed keys are left alone", decls(s), {
    [`${UUID}:2026-06:stay`]: REC,
    [`${UUID}:2026-06:takk`]: ZERO,
  });
}

/* 4. mixed shapes — half migrated when the tab was closed */
{
  const s = makeStorage({
    [LS.declarations]: JSON.stringify({
      [`${UUID}:2026-06:stay`]: REC,
      [`${UUID}:2026-05`]: ZERO,
    }),
  });
  migrateLocalStorage(s);
  check("untyped keys migrate, typed ones survive", decls(s), {
    [`${UUID}:2026-06:stay`]: REC,
    [`${UUID}:2026-05:stay`]: ZERO,
  });
}

/* 5. collision — a typed record already exists for a month being migrated */
{
  const s = makeStorage({
    [LS.declarations]: JSON.stringify({
      [`${UUID}:2026-06:stay`]: REC,
      [`${UUID}:2026-06`]: ZERO,
    }),
  });
  migrateLocalStorage(s);
  check("the existing typed record wins", decls(s), { [`${UUID}:2026-06:stay`]: REC });
}

/* 6. empty and absent storage */
{
  const s = makeStorage({});
  migrateLocalStorage(s);
  check("absent map does not create one", s.getItem(LS.declarations), null);
  check("version still stamped", s.getItem(LS.schema), "2");

  const t = makeStorage({ [LS.declarations]: "{}" });
  migrateLocalStorage(t);
  check("empty map stays empty", decls(t), {});
}

/* 7. junk in storage must not destroy anything or throw */
{
  const s = makeStorage({ [LS.declarations]: "not json at all" });
  migrateLocalStorage(s);
  check("unparseable map is left untouched", s.getItem(LS.declarations), "not json at all");

  const t = makeStorage({ [LS.declarations]: JSON.stringify(["wrong", "shape"]) });
  migrateLocalStorage(t);
  check("array is left untouched", t.getItem(LS.declarations), '["wrong","shape"]');
}

/* 8. unrecognised keys are kept verbatim rather than dropped */
{
  const s = makeStorage({
    [LS.declarations]: JSON.stringify({ garbage: REC, [`${UUID}:2026-13`]: ZERO }),
  });
  migrateLocalStorage(s);
  check("keys that match nothing survive", decls(s), { garbage: REC, [`${UUID}:2026-13`]: ZERO });
}

/* 9. demo-mode ids contain a hyphen and a timestamp, not just uuids */
{
  const legacy = "id-1754689200000-k3j9fa2";
  const s = makeStorage({ [LS.declarations]: JSON.stringify({ [`${legacy}:2026-06`]: REC }) });
  migrateLocalStorage(s);
  check("demo-mode ids migrate", decls(s), { [`${legacy}:2026-06:stay`]: REC });
}

/* 10. a future version must never be downgraded */
{
  const s = makeStorage({
    [LS.schema]: "9",
    [LS.declarations]: JSON.stringify({ [`${UUID}:2026-06`]: REC }),
  });
  migrateLocalStorage(s);
  check("newer schema is not touched", decls(s), { [`${UUID}:2026-06`]: REC });
  check("newer version is not downgraded", s.getItem(LS.schema), "9");
}

console.log(
  failures === 0 ? "\nAll migration checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
