const file = require('../util/file')

const CFG_FILENAME = 'services.json'

exports.load = async function (dir) {
  return file.get(dir, CFG_FILENAME)
}
