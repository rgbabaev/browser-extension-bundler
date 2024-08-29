# browser-extension-bundler

Produces browser extensions for all major browser from single codebase.

## The bundler automates next things:

* Flatten the difference with `chrome` and `browser` global objects.
  You can use `browser` anywhere. So you can build extensions for all
  targets (browsers) from one codebase.
* Produces different manifest files for Chrome, Safari and Firefox leveling some incompatibilities between them.
* Support different environments, so you can build extensions for your staging or testing environment.
* Compresses bundle using Uglify.
* Adds `'use strict';` on top of all js files.
