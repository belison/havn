const fs = require('fs')
const yaml = require('js-yaml')

exports.createFile = function (composed, filepath) {
  const dcyml = yaml.safeDump(composed)
  fs.writeFileSync(filepath, dcyml)
}
