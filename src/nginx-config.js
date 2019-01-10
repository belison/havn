const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const { forEach, map, noop, get } = require('lodash')
const file = require('./util/file')

const REL_TO_CONF = '/nginx/conf'
const NGINX_CONF = '${HAVN_CONFIG_HOME}' + REL_TO_CONF // eslint-disable-line
const REL_TO_SSL = '/nginx/ssl'
const NGINX_SSL = '${HAVN_CONFIG_HOME}' + REL_TO_SSL // eslint-disable-line

const TEMPLATE = {
  image: 'nginx:1.11-alpine',
  ports: ['80:80', '443:443'],
  volumes: [
    `${NGINX_CONF}/header.conf:/etc/nginx/header.conf`,
    `${NGINX_CONF}/nginx.conf:/etc/nginx/nginx.conf`,
    `${NGINX_CONF}/proxy.conf:/etc/nginx/proxy.conf`,
    `${NGINX_CONF}/tuning.conf:/etc/nginx/tuning.conf`,
    `${NGINX_SSL}:/etc/ssl`
  ],
  restart: 'always',
  networks: {
    default: {
      // FIXME provide DNS aliases through config/args?
      aliases: ['tenant1.mycompany.com', 'tenant2.mycompany.com']
    }
  },
  links: ['proxy']
}

exports.config = async (configs, aliases) => {
  const configDirs = await initConfigDirs()
  const websockets = {}
  const redirects = {}
  forEach(configs, (config, key) => {
    parsers[config.type](config, websockets, redirects)
  })
  await initConfigFiles(configDirs, websockets, redirects)
  TEMPLATE.networks.default.aliases = TEMPLATE.networks.default.aliases.concat(
    aliases
  )
  return TEMPLATE
}

async function initConfigDirs () {
  const conf = `${process.env.HAVN_CONFIG_HOME}${REL_TO_CONF}`
  if (!await file.exists(conf)) await file.mkdirp(conf)
  const ssl = `${process.env.HAVN_CONFIG_HOME}${REL_TO_SSL}`
  if (!await file.exists(ssl)) await file.mkdirp(ssl)
  return { conf, ssl }
}

async function initConfigFiles (configDirs, websockets, redirects) {
  const srcConf = `${process.env.HAVN_SOURCE_HOME}${REL_TO_CONF}`
  copyIfMissing(`${srcConf}/header.conf`, `${configDirs.conf}/header.conf`)
  copyIfMissing(`${srcConf}/nginx.conf`, `${configDirs.conf}/nginx.conf`)
  const proxyContents = await fs.readFileAsync(`${srcConf}/proxy.conf`, 'utf8')
  const transformed = transformProxy(proxyContents, websockets, redirects)
  await fs.writeFileAsync(`${configDirs.conf}/proxy.conf`, transformed)
  copyIfMissing(`${srcConf}/tuning.conf`, `${configDirs.conf}/tuning.conf`)

  const srcSsl = `${process.env.HAVN_SOURCE_HOME}${REL_TO_SSL}`
  await file.copy(`${srcSsl}/server.crt`, `${configDirs.ssl}/server.crt`)
  await file.copy(`${srcSsl}/server.key`, `${configDirs.ssl}/server.key`)
}

async function copyIfMissing (source, target) {
  if (!await file.exists(target)) await file.copy(source, target)
}

function transformProxy (contents, websockets, redirects) {
  const websocketSnippet = map(websockets, webSocketTemplate).join('')
  const redirectSnippet = map(redirects, redirectTemplate).join('')
  return contents
    .replace('# Websockets', `# Websockets${websocketSnippet}`)
    .replace('# Redirects', `# Redirects${redirectSnippet}`)
}

const webSocketTemplate = (_, path) => `
  location ${path} {
    proxy_pass http://proxy;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
`

const redirectTemplate = (to, from) => `
  location = ${from} {
    rewrite ^ https://$host${to}? permanent;
  }
`

const parsers = {
  'kdc.json': noop,
  'service.json': (config, websockets, redirects) => {
    const router = get(config, 'build.router', {})
    Object.assign(websockets, router.websockets)
    Object.assign(redirects, router.redirects)
  }
}
