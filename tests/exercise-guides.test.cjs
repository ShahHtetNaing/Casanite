const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const { videoEmbedUrl, isExerciseSourceUrl, guideSourceUrl, videoWatchUrl } = require("../src/lib/exercise-video.ts");
const { parseExerciseSource, importExerciseSource } = require("../src/lib/exercise-import.ts");
const { workoutGuideFor, STARTER_PLAN } = require("../src/lib/workout-plan.ts");
const { refreshBuiltInGuide, exerciseVideoPublisher } = require("../src/lib/exercise-guide.ts");
const { MS_CATALOG } = require("../src/lib/exercise-catalog.ts");
const videos = require("../src/lib/exercise-videos.json");
const source = "https://www.muscleandstrength.com/exercises/cable-face-pull";
const youtube = "https://www.youtube-nocookie.com/embed/7ZvpXA_mFpQ?rel=0";
const object = { "@type": "VideoObject", name: "Cable Face Pull", embedUrl: youtube, description: "A <b>controlled</b> cable exercise &amp; demonstration." };
const page = (data = object) => `<h1>Cable Face Pull Video Exercise Guide</h1><script type="application/ld+json">${JSON.stringify(data)}</script><h2>Overview</h2><p>Overview.</p><h2>Cable Face Pull Instructions</h2><ol><li>Stand <b>tall</b> &amp; keep the movement controlled.</li><li>Return slowly.</li></ol><h2>Tips</h2>`;

test("YouTube inputs become safe privacy-enhanced embeds", () => {
  for (const input of [youtube, "https://youtu.be/7ZvpXA_mFpQ?t=5", "https://www.youtube.com/watch?v=7ZvpXA_mFpQ", "https://www.youtube.com/shorts/7ZvpXA_mFpQ"]) assert.equal(videoEmbedUrl(input), youtube);
});
test("Vimeo embeds preserve unlisted hashes", () => {
  for (const input of ["https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"]) assert.equal(videoEmbedUrl(input), "https://player.vimeo.com/video/123456789?h=abcdef1234");
  assert.equal(videoWatchUrl("https://player.vimeo.com/video/123456789?h=abcdef1234"), "https://vimeo.com/123456789/abcdef1234");
  assert.equal(videoWatchUrl(youtube), "https://www.youtube.com/watch?v=7ZvpXA_mFpQ");
});
test("untrusted schemes, credentials, hosts, ports, paths and IDs are rejected", () => {
  for (const input of [null, {}, "javascript:alert(1)", "http://youtu.be/7ZvpXA_mFpQ", "https://youtube.com.evil.test/embed/7ZvpXA_mFpQ", "https://user@youtube.com/embed/7ZvpXA_mFpQ", "https://youtube.com:8443/embed/7ZvpXA_mFpQ", "https://youtube.com/embed/bad", "https://youtube.com/redirect?v=7ZvpXA_mFpQ", "https://vimeo.com/123456789?h=<script>"]) assert.equal(videoEmbedUrl(input), null);
});
test("source URLs allow old and modern M&S pages but never arbitrary fetch targets", () => {
  assert.ok(isExerciseSourceUrl(source)); assert.ok(isExerciseSourceUrl(`${source}.html`));
  for (const input of ["http://localhost/test", `${source}?redirect=https://evil.test`, "https://www.muscleandstrength.com.evil.test/exercises/plank", "https://www.muscleandstrength.com/exercises/../other"]) assert.equal(isExerciseSourceUrl(input), false);
  assert.equal(guideSourceUrl("javascript:alert(1)"), null);
  assert.ok(guideSourceUrl("https://www.cuh.nhs.uk/our-services/physiotherapy-outpatients/"));
});
test("all verified source/video records use approved providers", () => {
  assert.ok(Object.keys(videos).length >= 26);
  for (const record of Object.values(videos)) { assert.ok(isExerciseSourceUrl(record.source_url)); assert.ok(videoEmbedUrl(record.video_url)); }
});
test("retired built-in videos refresh only for their exact movement and official source", () => {
  const replaced = Object.entries(videos).filter(([, record]) => record.replaces_video_url);
  assert.equal(replaced.length, 10);
  for (const [slug, record] of replaced) {
    const title = MS_CATALOG.find(([, value]) => value === slug)[0];
    const original = Object.freeze({ video_url: record.replaces_video_url, source_url: record.source_url, cues: ["Keep my saved instruction"], tip: "Keep my tip" });
    const refreshed = refreshBuiltInGuide(title, original, record.source_url);
    assert.deepEqual(refreshed, { ...original, video_url: record.video_url });
    assert.equal(original.video_url, record.replaces_video_url);
    assert.equal(refreshBuiltInGuide(`Custom ${title}`, original, record.source_url), original);
    assert.equal(refreshBuiltInGuide(title, original, source), original);
    assert.equal(refreshBuiltInGuide(title, { ...original, source_url: source }, record.source_url).video_url, record.replaces_video_url);
    const manual = { ...original, video_url: youtube };
    assert.equal(refreshBuiltInGuide(title, manual, record.source_url), manual);
    assert.ok(exerciseVideoPublisher(title, record.video_url));
    assert.equal(exerciseVideoPublisher(title, record.replaces_video_url), null);
    assert.equal(exerciseVideoPublisher(title, youtube), null);
    assert.equal(refreshBuiltInGuide(title, refreshed, record.source_url), refreshed);
  }
});
test("missing source proof, unrelated Vimeo videos and custom instructions are preserved", () => {
  const record = videos["high-inverted-row"];
  const original = { video_url: record.replaces_video_url, cues: ["Custom instructions"] };
  assert.equal(refreshBuiltInGuide("Inverted Row", original, null), original);
  const other = { ...original, video_url: "https://player.vimeo.com/video/123456789" };
  assert.equal(refreshBuiltInGuide("Inverted Row", other, record.source_url), other);
  assert.equal(refreshBuiltInGuide("Inverted Row", null, record.source_url), null);
  const refreshed = refreshBuiltInGuide("Inverted Row", original, record.source_url.replace(/\.html$/, ""));
  assert.equal(refreshed.video_url, record.video_url);
  assert.equal(exerciseVideoPublisher("Custom movement", record.video_url), null);
});
test("every suggested movement has a playable URL and form instructions", () => {
  for (const group of STARTER_PLAN) for (const item of group.items) {
    assert.ok(videoEmbedUrl(item.guide?.video_url), item.title); assert.ok(item.guide.cues.length, item.title);
  }
});
test("exact names and explicit aliases work without fuzzy movement substitution", () => {
  for (const name of ["Plank", "  pLaNk  ", "Forearm Plank"]) assert.match(workoutGuideFor(name).guide_url, /hover\.html$/);
  assert.match(workoutGuideFor("Face Pulls").guide_url, /cable-face-pull$/);
  assert.match(workoutGuideFor("Seated DB Shoulder Press").guide_url, /seated-dumbbell-press\.html$/);
  for (const name of ["Unrelated plank variation", "Overhead rope triceps", "Dumbbell Goblet Squats/Leg Press"]) assert.equal(workoutGuideFor(name).guide, null);
});
test("JSON-LD import returns bounded plain-text instructions", () => {
  const guide = parseExerciseSource(page(), source);
  assert.equal(guide.video_url, youtube); assert.equal(guide.source_url, source);
  assert.equal(guide.description, "A controlled cable exercise & demonstration.");
  assert.deepEqual(guide.cues, ["Stand tall & keep the movement controlled.", "Return slowly."]);
});
test("import selects only a video whose name matches the exercise heading", () => {
  const unrelated = { ...object, name: "Dumbbell Curl" };
  assert.equal(parseExerciseSource(page(unrelated), source), null);
  const guide = parseExerciseSource(page({ "@graph": [unrelated, { ...object, "@type": ["MediaObject", "VideoObject"] }] }), source);
  assert.equal(guide.video_url, youtube);
});
test("invalid JSON, unsafe embeds, missing headings and oversized pages fail closed", () => {
  assert.equal(parseExerciseSource(page({ ...object, embedUrl: "https://evil.test/embed/video" }), source), null);
  assert.equal(parseExerciseSource('<h1>Cable Face Pull</h1><script type="application/ld+json">not JSON</script>', source), null);
  assert.equal(parseExerciseSource(page().replace(/<h1>.*?<\/h1>/, ""), source), null);
  assert.equal(parseExerciseSource("a".repeat(512_001), source), null);
});
test("fetch is bounded and source refusal is reported rather than bypassed", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, source); assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
    return new Response("Forbidden", { status: 403 });
  });
  const result = await importExerciseSource(source);
  assert.equal(result.guide, null); assert.match(result.reason, /HTTP 403/);
  assert.equal((await importExerciseSource("http://localhost/private")).guide, null);
  assert.equal(fetchMock.mock.callCount(), 1);
});
