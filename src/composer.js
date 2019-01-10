const { map } = require('lodash')
const yml = require('./util/json-to-yaml')
const env = require('./util/env-resolver')
const file = require('./util/file')

const TEMPLATE = {
  version: '2'
}

exports.create = async function create (
  configs,
  proxyCfg,
  nginxCfg,
  proxyRedisCfg
) {
  const services = {
    nginx: nginxCfg,
    proxy: proxyCfg,
    'proxy-redis': proxyRedisCfg
  }
  const promises = map(configs, async (config, key) => {
    services[key] = await formatters[config.type](config)
  })
  await Promise.all(promises)
  const composed = Object.assign(TEMPLATE, { services })
  const resolved = env.resolve(composed, 'HAVN_')
  yml.createFile(resolved, `${process.env.HAVN_CONFIG_HOME}/docker-compose.yml`)
  return resolved
}

const formatters = {
  'kdc.json': async config => config.data,
  'service.json': async config => {
    let formatted = config.build.container
    if (config.directory) {
      const dir = await file.join(process.env.HAVN_BUILD_HOME, config.directory)
      if (dir) {
        const stringified = JSON.stringify(formatted)
        const fixed = stringified.replace(
          new RegExp(/\${HAVN_BUILD_HOME}/, 'g'),
          dir
        )
        formatted = JSON.parse(fixed)
      }
    }
    if (!formatted.environment) formatted.environment = {}
    formatted.environment.NODE_TLS_REJECT_UNAUTHORIZED = 0
    formatted.environment.NODE_APP_INSTANCE = 'HAVN'
    return formatted
  }
}
