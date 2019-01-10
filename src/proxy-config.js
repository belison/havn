const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')
const { chain, forEach, reduce, pick, omit, get } = require('lodash')
const config = require('./util/config')
const file = require('./util/file')
const shortid = require('shortid')

const PROXY_BASE_CFG_DIR = 'proxy'
const PROXY_PROXY_DIR = 'proxy'
const PROXY_CONFIG_DIR = 'config'
const NODE_APP_INSTANCE = 'HAVN'

const TEMPLATE = {
  image: '667650582711.dkr.ecr.us-west-2.amazonaws.com/cor-proxy:latest',
  environment: {
    NODE_APP_INSTANCE,
    RATE_LIMIT_REDIS_URL: 'redis://proxy-redis:6379',
    CACHING_ENABLE_REDIS: 'false'
  },
  volumes: [
    '${HAVn_CONFIG_HOME}/proxy/config/default-HAVN.json:/usr/src/app/config/default-HAVN.json',
    '${HAVN_CONFIG_HOME}/proxy/proxy:/usr/src/app/proxy'
  ],
  ports: ['8000']
}

exports.config = async configs => {
  const configDirs = await initConfigDirs()
  const links = []
  const upstreams = {}
  const paths = {}
  const websockets = {}
  const rules = {}
  const preAuth = {
    userURL: 'http://localhost:3001/api/v1/users/current',
    institutionURL: 'http://localhost:3001/api/v1/institution'
  }
  forEach(configs, (config, key) => {
    parsers[config.type](
      config,
      links,
      upstreams,
      paths,
      websockets,
      rules,
      preAuth
    )
  })
  links.push('proxy-redis')
  await initConfigFiles(configDirs, upstreams, paths, websockets)
  let proxyRules = buildProxyRules(upstreams, websockets, paths, rules)
  proxyRules = chain(proxyRules)
    .toPairs()
    .sortBy(0)
    .reverse()
    .fromPairs()
    .value()
  return Object.assign({}, TEMPLATE, {
    links,
    environment: Object.assign({}, TEMPLATE.environment, {
      PRE_AUTH_USER_URL: preAuth.userURL,
      PRE_AUTH_INSTITUTION_URL: preAuth.institutionURL,
      PROXY_RULES: JSON.stringify(proxyRules).replace(/\$/g, '$$$$') // Double escape dollar signs for dockerfile compatibility
    })
  })
}

async function initConfigDirs () {
  const configDir = path.parse(config.path).dir
  const configDirStat = await file.exists(configDir)
  if (!configDirStat || !configDirStat.isDirectory()) {
    throw new Error('Configuration is bad: ', configDir)
  }
  const base = `${configDir}/${PROXY_BASE_CFG_DIR}`
  const ppd = `${base}/${PROXY_PROXY_DIR}`
  if (!await file.exists(ppd)) {
    await file.mkdirp(ppd)
  }
  const pcd = `${base}/${PROXY_CONFIG_DIR}`
  if (!await file.exists(pcd)) {
    await file.mkdirp(pcd)
  }
  return {
    config: pcd,
    proxy: ppd
  }
}

function buildProxyRules (upstreams, websockets, paths, rules) {
  const combinedUpstreams = Object.entries(upstreams || {}).concat(
    Object.entries(websockets || {})
  )
  return Object.entries(paths || {}).reduce((rules, [path, target]) => {
    const replacePrefix = path.includes('(')
      ? path.replace(/\([^)]*\)/, '$1')
      : path
    const removedPrefixTarget = target.replace('{req.prefix}', replacePrefix)
    rules[path] = combinedUpstreams.reduce(
      (target, [alias, host]) => target.replace(alias, host),
      removedPrefixTarget
    )
    return rules
  }, rules)
}

async function initConfigFiles (configDirs, upstreams, paths, websockets) {
  if (!upstreams) return
  const upstreamsCfg = {
    rules: { upstreams, websockets },
    log: { level: 'debug' }
  }
  const upstreamsFile = `${configDirs.config}/default-${NODE_APP_INSTANCE}.json`
  await fs.writeFileAsync(upstreamsFile, JSON.stringify(upstreamsCfg))
  const pathsCfg = sortAttributes(paths)
  const pathsFile = `${configDirs.proxy}/${NODE_APP_INSTANCE}.json`
  await fs.writeFileAsync(pathsFile, JSON.stringify(pathsCfg))
}

function stringifyObjectInline (obj, prefix) {
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line, i) => {
      return i === 0 ? line : `${prefix}${line}`
    })
    .join('\n')
}

function logOutdatedRouterConfig (config, router) {
  if (router.upstreams || router.paths || router.websockets) {
    console.log('---------------------------------------------------------')
    console.log(
      `The "${config.key}" service needs to be updated to the new router config`
    )
    if (config.url) {
      console.log('Please let the mainter know')
    } else {
      const convertedRules = buildProxyRules(
        router.upstreams,
        router.websockets,
        router.paths,
        {}
      )
      const oldRouter = pick(router, [
        'router',
        'upstreams',
        'paths',
        'websockets'
      ])
      const newRouter = Object.assign(
        omit(router, ['upstreams', 'paths', 'websockets']),
        {
          rules: convertedRules
        }
      )
      console.log(`
      Instead of:

      ...
      "router": ${stringifyObjectInline(oldRouter, '      ')}
      ...

      It should look like:

      ...
      "router": ${stringifyObjectInline(newRouter, '      ')}
      ...
      `)
      console.log('It will work for now, but you should update it soon.')
    }
  }
}

const parsers = {
  'kdc.json': (config, links) => {
    links.push(config.key)
  },
  'service.json': (
    config,
    links,
    upstreams,
    paths,
    websockets,
    rules,
    preAuth
  ) => {
    const router = get(config, 'build.router', {})
    const keymap = {}
    const link = config.key
    // TODO only start logging this when we've published the new version of
    // cor-proxy so they don't update before we've published cor-proxy
    // logOutdatedRouterConfig(config, router)
    forEach(router.upstreams, (value, key) => {
      const newKey = `${key}_${shortid.generate()}`
      keymap[key] = newKey
      upstreams[newKey] = value.replace(`\${host}`, link)
    })
    forEach(router.paths, (value, key) => {
      paths[key] = replaceAny(value, keymap)
    })
    forEach(router.websockets, (value, key) => {
      websockets[key] = replaceAny(value, keymap)
    })
    forEach(router.rules, (value, key) => {
      rules[key] = value.replace(`\${host}`, link)
    })
    Object.assign(preAuth, router.preAuth)
    links.push(link)
  }
}

function replaceAny (str, matches) {
  return reduce(
    matches,
    (_str, replace, match) => _str.replace(match, replace),
    str
  )
}

function sortAttributes (o) {
  const sorted = {}
  const attributes = []
  for (let key in o) {
    if (o.hasOwnProperty(key)) {
      attributes.push(key)
    }
  }
  attributes.sort().reverse()
  for (let i = 0; i < attributes.length; i++) {
    sorted[attributes[i]] = o[attributes[i]]
  }
  return sorted
}
