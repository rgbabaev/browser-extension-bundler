const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
var UglifyJS = require('uglify-js');

const serverMask = {
  development: 'http://localhost:3000/*',
  staging: 'https://staging.example.com/*',
};

const TARGETS = ['firefox', 'chrome'];
const NODE_ENV = process.env.NODE_ENV || 'production';
const FIREFOX_EXTENSION_ID = '{1e610bf8-ad89-4302-a177-da5806562dcc}';

const paths = {
  firefox: path.resolve(__dirname, 'dist/firefox'),
  chrome: path.resolve(__dirname, 'dist/chrome'),
  dist: path.resolve(__dirname, 'dist'),
  src: path.resolve(__dirname, 'src'),
};

const manifestTargetDependentParts = {
  firefox: {
    background: {
      scripts: ['service-worker.js'],
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_EXTENSION_ID,
        strict_min_version: '109.0',
      },
    },
  },
  chrome: {
    background: {
      service_worker: 'service-worker.js',
      type: 'module',
    },
  },
};

const uglifyOptions = {
  toplevel: true,
  mangle: {
    toplevel: true,
  },
  compress: {
    // global_defs: {
    //   '@console.log': 'alert',
    // },
    passes: 3,
  },
  output: {
    beautify: false,
  },
};

(async () => {
  await build();
  if (process.argv.slice(2).includes('--watch'))
    fs.watch(paths.src, { recursive: true }, build);
})();

async function build() {
  console.time('build');
  try {
    await cleanDist();
    await Promise.all(TARGETS.map(buildTarget));
  } catch (error) {
    console.error(error);
  }
  console.timeEnd('build');
}

async function buildTarget(targetName) {
  if (!targetName || !TARGETS.includes(targetName))
    throw new Error('Target is incorrect');

  await fsp.cp(paths.src, paths[targetName], { recursive: true });

  await buildTargetManifest(targetName, NODE_ENV);
  await addEnvVars(targetName, NODE_ENV);
}

async function buildTargetManifest(targetName, env) {
  if (!env) throw new Error("The env isn't set");

  const manifest = {
    ...JSON.parse(await fsp.readFile(path.resolve(paths.src, 'manifest.json'))),
    ...manifestTargetDependentParts[targetName],
    version: process.env.npm_package_version,
  };

  patchManifestParts(manifest, env);

  await fsp.writeFile(
    path.resolve(paths[targetName], 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

async function addEnvVars(targetName, env) {
  if (!env) throw new Error("The env isn't set");

  const jsFilePaths = await getFilesByMask(paths.src, /\.js$/);

  await Promise.all(
    jsFilePaths.map(async (filePath) => {
      const source = await fsp.readFile(path.resolve(paths.src, filePath));
      const gluedSource = composeScriptHeader(env) + source;
      const { code } = UglifyJS.minify(gluedSource, uglifyOptions);
      await fsp.writeFile(path.resolve(paths[targetName], filePath), code);
    })
  );
}

function composeScriptHeader(env) {
  commonRows = [
    "'use strict';",
    'if (!globalThis.browser && globalThis.chrome) globalThis.browser = globalThis.chrome;',
    `const ENV = '${NODE_ENV}';`,
  ];

  const envRelatedRows = {
    development: [
      "const ORIGIN = 'http://localhost:3000';",
      "const API_PATH = 'http://localhost:8000/api';",
    ],
    production: [
      "const ORIGIN = 'https://prduction.example.com';",
      'const API_PATH = `${ORIGIN}/api`;',
    ],
    staging: [
      "const ORIGIN = 'https://staging.example.com';",
      'const API_PATH = `${ORIGIN}/api`;',
    ],
  };

  return [...commonRows, ...envRelatedRows[env]].join('\n') + '\n';
}

async function cleanDist() {
  await fsp.rm(paths.dist, { recursive: true, force: true });
}

function patchManifestParts(manifest, env) {
  const maskToAdd = serverMask[env];
  if (!maskToAdd) return;
  manifest.host_permissions.push(maskToAdd);
  manifest.content_scripts[1].matches.push(maskToAdd);
}

async function getFilesByMask(root, mask, _subPath = '') {
  const files = await fsp.readdir(path.join(root, _subPath), {
    withFileTypes: true,
  });
  const matchedFiles = [];

  for (const file of files) {
    const filePath = path.join(_subPath, file.name);

    if (file.isDirectory()) {
      matchedFiles.push(
        ...(await getFilesByMask(root, mask, path.join(_subPath, file.name)))
      );
    } else if (file.isFile() && file.name.match(mask)) {
      matchedFiles.push(filePath);
    }
  }

  return matchedFiles;
}
