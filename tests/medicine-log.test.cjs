const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { insulinUnits, medicationTakenAt, medicineFields } = require("../src/lib/medication-log.ts");

test("insulin units must fit the stored precision without silent dose rounding", () => {
  assert.equal(insulinUnits("23.5"), 23.5);
  assert.equal(insulinUnits(" 0.1 "), 0.1);
  assert.equal(insulinUnits("100"), 100);
  for (const value of ["", " ", "0", "-1", "100.1", "10.01", "Infinity", "NaN"]) {
    assert.equal(insulinUnits(value), null, value);
  }
});

test("medication times use the selected Singapore day, including midnight", () => {
  assert.equal(medicationTakenAt("2026-11-15", "00:05"), "2026-11-14T16:05:00.000Z");
  assert.equal(medicationTakenAt("2026-11-15", "23:59"), "2026-11-15T15:59:00.000Z");
  assert.equal(medicationTakenAt("2024-02-29", "12:00"), "2024-02-29T04:00:00.000Z");
});

test("missing or invalid medication dates/times are not silently defaulted", () => {
  for (const time of ["", "24:00", "12:60", "noon", "1:30", "-1:00"]) {
    assert.equal(medicationTakenAt("2026-11-15", time), null, time);
  }
  for (const day of ["", "2026-02-29", "2026-02-31", "2026-13-01", "not a date"]) {
    assert.equal(medicationTakenAt(day, "12:00"), null, day);
  }
});

test("medicine log records only explicit names and doses, preserving dose units", () => {
  assert.deepEqual(medicineFields("  Test medicine  ", "  1 tablet (test strength)  ", "2026-11-15", "08:00"), {
    medicine_name: "Test medicine", dose_taken: "1 tablet (test strength)", day: "2026-11-15", taken_at: "2026-11-15T00:00:00.000Z",
  });
  for (const [name, dose] of [[" ", "1 tablet"], ["Test medicine", ""], ["x".repeat(121), "1"], ["Test", "x".repeat(121)]]) {
    assert.equal(medicineFields(name, dose, "2026-11-15", "08:00"), null);
  }
});
