const Configstore = require('configstore')
const pkg = require('../../package.json')

const defaults = {}
const options = { globalConfigPath: true }

const store = new Configstore(pkg.name, defaults, options)
module.exports = store
