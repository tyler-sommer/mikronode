module.exports = {
  "env": {
    "node": true,
    "commonjs": true,
    "es6": true,
    "mocha": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 2018,
    "sourceType": "module"
  },
  "rules": {
    "indent": [
      "error",
      2
    ],
    "no-console": [
      "warn"
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "quotes": [
      "error",
      "single"
    ],
    "semi": [
      "error",
      "always"
    ],
    "dot-notation": [
      "error"
    ],
    "eqeqeq": [
      "error",
      "always"
    ],
    "no-else-return": [
      "error"
    ],
    "no-useless-return": [
      "error"
    ],
    "no-unused-expressions": [
      "error"
    ],
    "no-undefined": [
      "error"
    ],
    "lines-between-class-members": [
      "error",
      "always"
    ],
    "no-multiple-empty-lines": [
      "error"
    ],
    "spaced-comment": [
      "error",
      "always"
    ],
    "keyword-spacing": [
      "error",
      {"overrides": {
        "if": {"after": false},
        "for": {"after": false},
        "while": {"after": false}}}
    ]
  },
  "overrides": [
    {
      "files": ["test/**"],
      "rules": {
        "no-unused-expressions": "off"
      }
    },
    {
      "files": ["src/parser.js"],
      "rules": {
        "no-unused-vars": "off",
        "no-control-regex": "off"
      }
    }
  ]
};
