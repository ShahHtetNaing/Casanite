const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime");

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return resolve.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...args);
};
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
}
const { Meals } = require("../src/components/meals/meals.tsx");

function renderMeals(day, logs) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: {} },
    React.createElement(PathnameContext.Provider, { value: "/meals" }, React.createElement(Meals, {
      day, today: "2026-11-15", initialMeals: [], recentMeals: [], initialInsulin: [], insulinLoadError: false,
      initialSupplements: [{ id: "fish", name: "Fish Oil", dose: "1 capsule", sort_order: 1 }],
      initialSupplementLogs: logs,
      initialSettings: { lantus_units: 24, prandial_units: 10, goal_lbs_min: 145, goal_lbs_max: 150, protein_g_target: 120, carbs_g_target: 150, veg_target: 5 },
      latestWeightKg: null,
    }))));
}

test("Meals renders one Supplements tracker alongside insulin above food, without Medicines taken", () => {
  const html = renderMeals("2026-11-14", [{ id: "taken", supplement_id: "fish", day: "2026-11-14" }]);
  const section = html.match(/<section\b[^>]*id="medications"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /Insulin doses taken/);
  assert.match(section, /Insulin &amp; supplements/);
  assert.match(section, /aria-label="Took Fish Oil"/);
  assert.match(section, /aria-checked="true"/);
  assert.equal((html.match(/aria-label="Took Fish Oil"/g) ?? []).length, 1);
  assert.ok(html.indexOf(section) < html.indexOf("Daily totals"));
  assert.doesNotMatch(html, /Medicines taken|Medicine name|Record medicine taken/);
});

test("a selected day without supplement logs renders an unchecked tracker", () => {
  const html = renderMeals("2026-11-15", []);
  const section = html.match(/<section\b[^>]*id="medications"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /aria-label="Took Fish Oil"/);
  assert.match(section, /aria-checked="false"/);
  assert.doesNotMatch(section, /aria-checked="true"/);
});
