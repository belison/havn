const chalk = require('chalk')
const github = require('../util/github')
const CONFIG_FILE = 'service.json'

exports.canLoad = function (dep) {
  return dep.meta.url && dep.meta.url.host.endsWith('github.com')
}

exports.getConfig = async function (dep) {
  const client = await github.getAuthenticatedClient()
  const params = extractMeta(dep.meta.url.path)
  params.path = buildPath(dep.path)
  try {
    const content = await client.repos.getContent(params)
    return format(dep, content)
  } catch (err) {
    const path = dep.path ? dep.path : 'the root'
    console.log()
    console.log(chalk.red('Error: Failed to find project configuration'))
    console.log(chalk.yellow('  Are you sure that you have access?'))
    console.log(chalk.yellow(`  Is your ${CONFIG_FILE} at ${path}?`))
    console.log({ dep, params })
    console.log()
  }
}

function format (url, resp) {
  const buffer = Buffer.from(resp.data.content, 'base64')
  return { url, type: 'service.json', data: JSON.parse(buffer) }
}

function buildPath (path) {
  if (!path) return CONFIG_FILE
  let updated = path.startsWith('/') ? path.substr(1) : path
  if (!updated.endsWith('/')) updated += '/'
  return updated + CONFIG_FILE
}

function extractMeta (path) {
  const parts = path.split('/')
  let index = parts[0] ? 0 : 1
  return {
    owner: parts[index],
    repo: parts[index + 1]
  }
}
