import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import JSON5 from "json5";
import {
  ROOT,
  readJSON,
  assetOrigins,
  resolveSource,
} from "./lib/card-source.mjs";
import { sha256 } from "./lib/card-bundle.mjs";
import { readCardPNG } from "./lib/png.mjs";
import { cardIdentity, VERSION_ENTRY_NAME } from "./lib/version.mjs";

const withoutVersionEntry = (book) => ({
  ...book,
  entries: book.entries.filter((e) => e.comment !== VERSION_ENTRY_NAME),
});

export async function checkArtifacts() {
  const release = await readJSON("release.json");
  const sources = await readJSON("content/manifest.json");
  const scripts = await readJSON("card/scripts/index.json");
  const regex = await readJSON("card/regex/index.json");
  const greetings = await readJSON("card/greetings/index.json");
  const profiles = [];
  let localBook;
  for (const profile of ["local", "release"]) {
    const report = await readJSON(`dist/${profile}/report.json`);
    const card = await readJSON(`dist/${profile}/命定之诗与黄昏之歌.json`);
    const { base, assetBase } = assetOrigins(release, profile);
    assert.equal(report.assets.base, base);
    const identity = cardIdentity(release);
    const version = card.data.character_version;
    assert.equal(report.cardVersion, version);
    if (profile === "release") assert.equal(version, identity.version);
    else assert.ok(version.startsWith(`${identity.version}+dev.`), version);
    assert.equal(card.data.name, identity.name);
    assert.equal(card.data.extensions.world, identity.worldbook);
    assert.equal(card.data.character_book.name, identity.worldbook);
    const marker = card.data.character_book.entries.filter(
      (e) => e.comment === VERSION_ENTRY_NAME,
    );
    assert.equal(marker.length, 1, "世界书应有且只有一条版本标记");
    assert.equal(marker[0].content, version);
    assert.equal(marker[0].enabled, false);
    const embedded = readCardPNG(
      await fs.readFile(resolveSource(`dist/${profile}/命定之诗与黄昏之歌.png`)),
    ).card;
    assert.deepEqual(embedded, card, "PNG 角色卡内的数据应与 JSON 一致");
    assert.equal(1 + card.data.alternate_greetings.length, greetings.length);
    assert.deepEqual(
      card.data.extensions.tavern_helper.scripts.map((item) => item.id),
      scripts.map((item) => item.id),
    );
    assert.deepEqual(
      card.data.extensions.regex_scripts.map((item) => item.id),
      regex.map((item) => item.id),
    );
    if (profile === "local")
      localBook = withoutVersionEntry(card.data.character_book);
    else
      assert.deepEqual(
        withoutVersionEntry(card.data.character_book),
        localBook,
        "世界书不得随发布资源profile变化",
      );

    for (const artifact of report.assets.artifacts) {
      assert.ok(artifact.path.startsWith(`dist/${profile}/`));
      assert.notEqual(path.basename(artifact.path), "report.json");
      const bytes = await fs.readFile(resolveSource(artifact.path));
      assert.equal(bytes.length, artifact.bytes, artifact.path);
      assert.equal(sha256(bytes), artifact.sha256, artifact.path);
      if (/\.(js|html)$/.test(artifact.path)) {
        const code = bytes.toString("utf8");
        assert.doesNotMatch(
          code,
          /(?:from\s*|import\s*\(?\s*)['"](?:@destiny\/|https?:\/\/[^'"\s]*\/npm\/@destiny\/)/,
          `${artifact.path}: workspace package must be bundled`,
        );
        assert.doesNotMatch(
          code,
          /(?:from\s*|import\s*\(?\s*)['"]https?:\/\/[^'"\s]*\/npm\/zod(?:@|\/|['"])/,
          `${artifact.path}: use host Zod`,
        );
        assert.ok(
          !code.includes(
            "FrontEnd-for-destined-journey@main/public/assets/data/",
          ),
          `${artifact.path}: catalog requests must use the workspace asset root`,
        );
        if (profile === "release")
          assert.ok(
            !code.includes(release.localOrigin),
            `${artifact.path}: release contains local resource origin`,
          );
        if (profile === "local")
          assert.ok(
            !code.includes(`${release.repository}@${cardIdentity(release).tag}/dist/release`),
            `${artifact.path}: local contains release resource origin`,
          );
      }
    }
    let ownUrls = 0;
    for (const url of report.assets.urls.filter((url) =>
      url.startsWith(base + "/"),
    )) {
      const relative = decodeURIComponent(url.slice(base.length + 1));
      assert.ok(!relative.split("/").includes(".."));
      assert.ok(
        (await fs.stat(resolveSource(`dist/${profile}/${relative}`))).isFile(),
        url,
      );
      ownUrls += 1;
    }
    for (const [name, file] of Object.entries(sources)) {
      const original = await fs.readFile(resolveSource(file));
      const generated = await fs.readFile(
        resolveSource(`dist/${profile}/frontend/assets/data/${name}`),
      );
      assert.deepEqual(generated, original, name);
      if (name.endsWith(".json")) JSON5.parse(generated.toString("utf8"));
    }
    const schema = await readJSON(
      `dist/${profile}/frontend/data_schema/schema.json`,
    );
    assert.ok(
      schema.properties?.主角 && schema.properties?.世界,
      "generated schema must describe the stat_data value",
    );
    assert.ok(
      (
        await fs.readFile(
          resolveSource(`dist/${profile}/frontend/data_schema/index.js`),
          "utf8",
        )
      ).includes(release.dependencies.mvuZod.url),
      "Schema registrar must use the release manifest URL",
    );
    assert.ok(
      (
        await fs.readFile(
          resolveSource(`dist/${profile}/frontend/custom_start/index.html`),
          "utf8",
        )
      ).includes(assetBase),
    );
    profiles.push({
      profile,
      artifacts: report.assets.artifacts.length,
      ownUrls,
      entries: card.data.character_book.entries.length,
      published: report.published,
      cardSha256: report.sha256,
    });
  }
  return {
    ok: true,
    profiles,
    host: "separate validation; not inferred from builds",
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.join(ROOT, "tools/check-artifacts.mjs")
) {
  try {
    console.log(JSON.stringify(await checkArtifacts(), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
