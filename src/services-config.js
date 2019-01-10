const url = require('url')
const { assign, defaultsDeep, find, isString, map, pick } = require('lodash')
const githubProjectLoader = require('./loaders/github-project')
const kdcLoader = require('./loaders/kdc')
const strUtil = require('./util/string')

const LOADERS = [githubProjectLoader, kdcLoader]
const BUILD = 'build'
const IMAGE = 'image'
const dependencyTree = {}

async function getDependencies (svcConfigs, cmd) {
  const indexed = {}
  const dependencies = {}
  svcConfigs.forEach(svc => {
    try {
      const meta = getServiceMeta(svc)
      meta.walked = true
      indexed[meta.key] = meta
      dependencyTree[meta.key] = meta.build.dependencies
      Object.assign(dependencies, meta.build.dependencies)
    } catch (err) {
      err.serviceName = svc.config.name
      throw err
    }
  })
  await resolveDependencies(dependencies, indexed)
  return { indexed, dependencyTree }
}

async function resolveDependencies (deps, indexed) {
  const promises = map(deps, (dep, depKey) => {
    return depKey in indexed
      ? Promise.resolve(indexed[depKey])
      : indexDependency(indexed, depKey, dep)
  })
  const configs = await Promise.all(promises)
  await indexDependenciesOfDependencies(indexed, configs)
  return indexed
}

async function indexDependency (indexed, dependencyKey, dependency) {
  const dep = isString(dependency) ? { url: dependency } : dependency
  dep.meta = getDependencyUrlMeta(dep.url)
  const loader = find(LOADERS, loader => loader.canLoad(dep))
  const config = await loader.getConfig(dep)
  config.key = dependencyKey
  indexed[dependencyKey] = config
  return config
}

function getDependencyUrlMeta (value) {
  const meta = {}
  if (isString(value)) {
    meta.string = true
    if (strUtil.isUrl(value)) {
      meta.url = url.parse(value)
    }
  }
  return meta
}

async function indexDependenciesOfDependencies (indexed, configs) {
  const promises = configs.reduce((array, config) => {
    if (
      config.type === 'service.json' &&
      shouldResolveDependencies(indexed, config)
    ) {
      indexed[config.key].walked = true
      assign(config, getServiceMeta(config.data, config.key))
      if (!dependencyTree[config.key]) {
        dependencyTree[config.key] = config.build.dependencies
      }
      array.push(resolveDependencies(config.build.dependencies, indexed))
    }
    return array
  }, [])
  return Promise.all(promises)
}

function getServiceMeta (src, key) {
  const build = getBuild(src, key)
  return {
    build,
    directory: src.directory,
    key: key || src.config.name,
    data: src.config,
    depends_on: Object.keys(build.dependencies || {}),
    type: 'service.json'
  }
}

function getBuild (src, key) {
  const type = !key
    ? src.image ? IMAGE : BUILD
    : key in src.build ? BUILD : IMAGE

  const data = src.config ? src.config : src
  const build = defaultsDeep({}, data[type], data.common)
  return addOptionals(src, build)
}

function addOptionals (src, build) {
  if (src.optionals === undefined) {
    return build
  } else if (src.optionals === true) {
    build.dependencies = Object.assign(
      build.dependencies || {},
      build['optional-dependencies']
    )
    return build
  } else {
    build.dependencies = Object.assign(
      build.dependencies || {},
      pick(build['optional-dependencies'], src.optionals)
    )
    return build
  }
}

function shouldResolveDependencies (indexed, config) {
  return !(config.key in indexed) || !indexed[config.key].walked
}

module.exports = {
  getDependencies
}
