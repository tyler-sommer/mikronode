// use esm to load es6 modules from commonjs code
const require_module = require('esm')(module);
module.exports = require_module('./index.js');
