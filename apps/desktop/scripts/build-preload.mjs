import { build } from "esbuild";

await Promise.all(["index", "browser-passkey"].map(name => build({
  entryPoints: [`src/preload/${name}.ts`],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: `dist/preload/${name}.cjs`,
})));
