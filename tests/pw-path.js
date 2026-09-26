/* Preloaded by the npm test scripts (node -r): points require('playwright')
   at the shared ui-verify install, since this project has no node_modules. */
'use strict';
const path = require('path');
const shared = process.env.VA_PLAYWRIGHT_DIR || 'C:/Users/nolan/ui-verify/node_modules';
process.env.NODE_PATH = [shared, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();
