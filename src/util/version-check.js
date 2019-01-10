const chalk = require('chalk')
const github = require('./github')
const { version: current } = require('../../package.json')

function parse (resp) {
  const buffer = Buffer.from(resp.data.content, 'base64')
  return JSON.parse(buffer)
}

const versionCheck = async (ref = 'master') => {
  try {
    const client = await github.getAuthenticatedClient()
    const latest = parse(
      await client.repos.getContent({
        owner: 'havnjs',
        repo: 'havn',
        path: 'package.json',
        ref
      })
    )
    if (latest.version !== current) {
      console.log()
      console.log(
        chalk.yellow(
          `Warning: current Havn version ${current} does not match latest version ${
            latest.version
          } on Github`
        )
      )
    }
  } catch (err) {
    console.log()
    console.log(
      chalk.yellow('Warning: Unable to check latest Havn version on Github')
    )
  }
}

module.exports = versionCheck
