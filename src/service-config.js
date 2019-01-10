const url = require('url')
const { assign, defaultsDeep, find, isString, map, pick } = require('lodash')
const Promise = require('bluebird')
const strUtil = require('./util/string')
const githubProjectLoader = require('./loaders/github-project')
const kdcLoader = require('./loaders/kdc')

const LOADERS = [githubProjectLoader, kdcLoader]
const BUILD = 'build'
const IMAGE = 'image'

class ServiceConfig {
  /**
   * Creates a ServiceConfig
   * @param {Object} config - The service.json object
   * @param {Object} opts - The build, env and image options
   */
  constructor (config, opts) {
    this.config = config
    this.directory = opts.directory
    this.build = opts.build
    this.env = opts.env
    this.image = opts.image
    this.optionals = opts.optionals
    this.indexed = {}
  }

  /**
   * Recursively compiles a list of dependencies
   * @return {Object} A keyed dependencies map
   */
  async getDependencies () {
    const meta = this.getServiceMeta(this.config)
    meta.walked = true
    this.indexed[meta.key] = meta
    await this.resolveDependencies(meta.build.dependencies)
    return this.indexed
  }

  /**
   * Resolve dependencies that are not already in the index
   * @param {Object} deps - The dependencies map from the service.json
   */
  async resolveDependencies (deps) {
    const promises = map(deps, (dep, depKey) => {
      return depKey in this.indexed
        ? Promise.resolve(this.indexed[depKey])
        : this.indexDependency(depKey, dep)
    })
    const configs = await Promise.all(promises)
    await this.indexDependenciesOfDependencies(configs)
    return this.indexed
  }

  /**
   * Gets the configuration for a dependency
   * @param {string} dependencyKey - The dependency key
   * @param {*} dependencyUrl - The dependency URL
   * @return {Object} The dependency configuration
   */
  async indexDependency (dependencyKey, dependency) {
    const dep = isString(dependency) ? { url: dependency } : dependency
    dep.meta = this.getDependencyUrlMeta(dep.url)
    const loader = find(LOADERS, loader => loader.canLoad(dep))
    const config = await loader.getConfig(dep)
    config.key = dependencyKey
    this.indexed[dependencyKey] = config
    return config
  }

  /**
   * Gets information about the dependency
   * @param {string} value - The dependency url
   * @return {Object} information about the dependency
   */
  getDependencyUrlMeta (value) {
    const meta = {}
    if (isString(value)) {
      meta.string = true
      if (strUtil.isUrl(value)) {
        meta.url = url.parse(value)
      }
    }
    return meta
  }

  /**
   * Recursively find dependencies
   * @param {Object} configs
   * @return {Object}
   */
  async indexDependenciesOfDependencies (configs) {
    const promises = configs.reduce((array, config) => {
      if (
        config.type === 'service.json' &&
        this.shouldResolveDependencies(config)
      ) {
        this.indexed[config.key].walked = true
        assign(config, this.getServiceMeta(config.data, config.key))
        array.push(this.resolveDependencies(config.build.dependencies))
      }
      return array
    }, [])
    return Promise.all(promises)
  }

  /**
   * Build and return a meta object
   * @param {Object} config - The contents of the service.json
   * @param {String} key - The dependency key
   * @return {Object} The service meta
   */
  getServiceMeta (config, key) {
    const build = this.getBuild(config, key)
    return {
      build,
      key: key || config.name,
      data: config,
      depends_on: Object.keys(build.dependencies || {}),
      type: 'service.json'
    }
  }

  /**
   * Gets the build type for a dependency key
   * @param {string} key - The dependency key
   * @return {('build'|'image')}
   */
  getBuild (config, key) {
    const type = !key
      ? this.image
        ? IMAGE
        : BUILD
      : key in this.build
        ? BUILD
        : IMAGE

    const build = defaultsDeep({}, config[type], config.common)
    return this.addOptionals(build)
  }

  addOptionals (build) {
    if (this.optionals === undefined) {
      return build
    } else if (this.optionals === true) {
      build.dependencies = Object.assign(
        build.dependencies,
        build['optional-dependencies']
      )
      return build
    } else {
      build.dependencies = Object.assign(
        build.dependencies,
        pick(build['optional-dependencies'], this.optionals)
      )
      return build
    }
  }

  shouldResolveDependencies (config) {
    return !(config.key in this.indexed) || !this.indexed[config.key].walked
  }
}

module.exports = ServiceConfig
