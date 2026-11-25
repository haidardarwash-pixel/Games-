import { build as viteBuild } from 'vite';
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpOutDir = path.join(rootDir, 'dist-standalone');
const publicOutFile = path.join(rootDir, 'public', 'operation-ossuary-standalone.html');
const refImagePath = path.join(rootDir, 'public', 'assets', 'aistudio', 'painted_3da5eda8.png');

async function main() {
  console.log('[standalone] Building Vite production bundle into temporary output...');
  fs.rmSync(tmpOutDir, { recursive: true, force: true });

  await viteBuild({
    root: rootDir,
    base: './',
    build: {
      outDir: tmpOutDir,
      emptyOutDir: true,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });

  const assetsDir = path.join(tmpOutDir, 'assets');
  const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));
  const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));

  if (jsFiles.length === 0) {
    throw new Error('Expected at least one compiled JS file in dist-standalone/assets');
  }

  // Convert compiled ESM JS bundle into a classic browser-universal IIFE so opening via file:// works everywhere
  const entryJsPath = path.join(assetsDir, jsFiles[0]);
  const iifeResult = await esbuild.build({
    entryPoints: [entryJsPath],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: ['es2020'],
  });
  const jsCode = iifeResult.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');

  const cssCode = cssFiles
    .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
    .join('\n')
    .replace(/<\/style>/gi, '<\\/style>');

  // Embed the user's reference monolith painting as a base64 Data URI for zero-dependency offline play
  let embeddedArtScript = '';
  if (fs.existsSync(refImagePath)) {
    const imgBase64 = fs.readFileSync(refImagePath).toString('base64');
    embeddedArtScript = `window.__EMBEDDED_REFERENCE_ART__="data:image/png;base64,${imgBase64}";`;
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Operation Ossuary — Standalone 3D Helicopter Strike</title>
    <meta
      name="description"
      content="Self-contained standalone 3D military helicopter tactical strike experience."
    />
    <style>
${cssCode}
    </style>
  </head>
  <body class="bg-[#12100d] text-[#f3ece0] overflow-hidden select-none">
    <div id="root"></div>
    <script>
      window.__STANDALONE_BUILD__ = true;
      ${embeddedArtScript}
    </script>
    <script>
${jsCode}
    </script>
  </body>
</html>
`;

  fs.mkdirSync(path.dirname(publicOutFile), { recursive: true });
  fs.writeFileSync(publicOutFile, html, 'utf8');
  fs.rmSync(tmpOutDir, { recursive: true, force: true });

  const sizeMb = (fs.statSync(publicOutFile).size / (1024 * 1024)).toFixed(2);
  console.log(`[standalone] Wrote ${publicOutFile} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error('[standalone] Build failed:', err);
  process.exit(1);
});
