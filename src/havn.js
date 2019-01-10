require('./util/version-check')()
const chalk = require('chalk')
const commander = require('commander')
const pkg = require('../package.json')
const nodeVersion = require('node-version')

if (nodeVersion.major < 6) {
  const err = chalk.red('Error!')
  console.error('> ' + err + ' Havn requires >= Node v7. Please upgrade!')
  process.exit(1)
}

commander
  .version(pkg.version)
  .command('run', 'start project in dev mode', { isDefault: true })
  .command('stop', 'bring down the project')
  .command('test [something]', 'test something')

// Hack for commander bug: https://github.com/tj/commander.js/issues/335
process.argv[1] = __filename

commander.parse(process.argv)
