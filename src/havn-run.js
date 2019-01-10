const chalk = require('chalk')
const path = require('path')
const { forEach, get, isArray, isString, merge, mergeWith } = require('lodash')
const commander = require('commander')
const pkg = require('../package.json')
const serviceLoader = require('./loaders/service')
const servicesLoader = require('./loaders/services')
const ServiceConfig = require('./service-config')
const servicesConfig = require('./services-config')
const proxyRedis = require('./proxy-redis-config')
const proxy = require('./proxy-config')
const nginx = require('./nginx-config')
const composer = require('./composer')
const github = require('./util/github')
const config = require('./util/config')
const daLogin = require('./util/docker-aws-login')
const spawn = require('child_process').spawn
const getAuthToken = require('registry-auth-token')
const sinopia = require('./sinopia')
const ipAddress = require('./util/ip-address')
const util = require('util')

const ENV = process.env.NODE_ENV || 'development'

async function run () {
  commander
    .option(
      '-a, --aliases [aliases]',
      'Add additional domain aliases',
      split,
      []
    )
    .option('-b, --build <build>', 'Dependencies to build', split, [])
    .option('-c, --config', 'Prompt for configuration options')
    .option('-d, --directory <dir>', 'Source Directory [.]', '.')
    .option('-e, --env <env>', 'Specify an environment [NODE_ENV]', ENV)
    .option('-i, --image', 'Run the image')
    .option(
      '-o, --optionals [dependencies]',
      'Include optional dependencies',
      split
    )
    .option('--skip-image-update', 'Do not check for updates to images')
    .option('--skip-module-cache', 'Do not use the module cache')
    .option('-t, --test', 'Build files but do not docker-compose up')
    .option('-v, --verbose', 'Output more detail')
    .parse(process.argv)

  console.log()
  console.log(chalk.green(`--- K U D E --- (v${pkg.version})`))

  try {
    await github.getAuthenticatedClient()
    initEnvironmentVariables(commander.directory)

    console.log(
      chalk.cyan('[1/5]'),
      chalk.green(' recursively finding dependencies...')
    )
    const [configs, envs] = await getAllDependencyConfigurations(commander)
    const envOverrides = getAllEnvOverrides(configs, envs)
    forEach(envOverrides, (overrides, dep) => {
      const envs = get(configs, [dep, 'build', 'container', 'environment'], {})
      Object.assign(envs, overrides)
    })

    console.log(chalk.cyan('[2/5]'), chalk.green(' configuring proxy...'))
    const proxyCfg = await proxy.config(configs)
    const nginxCfg = await nginx.config(configs, commander.aliases)
    const proxyRedisCfg = await proxyRedis.config()

    console.log(chalk.cyan('[3/5]'), chalk.green(' configuring network...'))
    const dc = await composer.create(configs, proxyCfg, nginxCfg, proxyRedisCfg)

    const skipCache = commander.skipModuleCache
    console.log(
      chalk.cyan('[4/5]'),
      chalk.green(
        skipCache ? ' skipping module cache...' : ' starting module cache...'
      )
    )
    if (!skipCache) await sinopia()

    console.log(
      chalk.cyan('[5/5]'),
      chalk.green(' checking versions and starting...')
    )

    if (!commander.test) {
      await dockerAwsLogin(dc)
      startDocker(commander.skipImageUpdate)
    }
  } catch (err) {
    console.log('-----')
    console.log(util.inspect(err, { depth: 9 }))
    console.log('-----')
  }
}

function initEnvironmentVariables (dir) {
  const _gat = getAuthToken('//npm.mydomain.com')
  if (!_gat) {
    throw new Error('Cannot find .npmrc with auth token for "npm.mydomain.com"')
  }

  process.env.HAVN_SOURCE_HOME = __dirname
  process.env.HAVN_CONFIG_HOME = path.parse(config.path).dir
  process.env.HAVN_BUILD_HOME = path.join(process.cwd(), dir)
  process.env.HAVN_NPM_TOKEN = _gat.token
  process.env.HAVN_HOST_IP = ipAddress.getMachineIP()
}

async function getAllDependencyConfigurations (commander) {
  try {
    const svcs = await servicesLoader.load(commander.directory)
    const { params = {} } = svcs
    mergeWith(commander, params, (obj, src) => {
      if (isArray(obj)) return obj.concat(src)
      if (!obj) return src
      return obj
    })
    const configs = await Promise.all(
      svcs.run.map(async runConfig => {
        let override = {}
        if (isString(runConfig)) {
          override.directory = runConfig
        } else {
          override.directory = runConfig.directory
          override.optionals = runConfig.optionals
        }
        const cmd = Object.assign({}, commander, override)
        const svc = await serviceLoader.load(cmd.directory, cmd.config)
        return new ServiceConfig(svc, cmd)
      })
    )
    const { indexed, dependencyTree } = await servicesConfig.getDependencies(
      configs,
      commander
    )
    if (commander.verbose) printDependencyTree(dependencyTree)
    return [indexed, get(svcs, 'environmentOverrides', {})]
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof TypeError) {
      console.log()
      const msg = err.serviceName ? `for ${err.serviceName} ` : ''
      console.log(chalk.red(`ERROR: Failed to parse service.json ${msg}->`))
      console.log(chalk.red(err.message))
      console.log()
    } else {
      return getDependencyConfigurations(commander)
    }
  }
}

async function getDependencyConfigurations (commander) {
  const svc = await serviceLoader.load(commander.directory, commander.config)
  const serviceConfig = new ServiceConfig(svc, {
    build: commander.build,
    env: commander.env,
    image: commander.image,
    optionals: commander.optionals
  })
  const indexed = await serviceConfig.getDependencies()
  return [indexed, get(serviceConfig, ['build', 'environmentOverrides'], {})]
}

async function dockerAwsLogin (dc) {
  const curProfile = config.get('awsprofile')
  if (!curProfile) {
    throw new Error('You must specify an "awsprofile"')
  }
  const profile = await daLogin(dc, curProfile)
  if (profile !== curProfile) config.set('awsprofile', profile)
}

function startDocker (skipImageUpdate) {
  const dir = process.env.HAVN_CONFIG_HOME
  const updateCmd = skipImageUpdate ? '' : ' && docker-compose pull'
  const cmd = `cd ${dir}${updateCmd} && docker-compose up -d --remove-orphans`
  spawn(cmd, { shell: true, stdio: 'inherit' })
}

function printDependencyTree (dependencies) {
  console.log()
  console.log(chalk.cyan('[Dependency Tree]'))
  for (let svc in dependencies) {
    console.log(`  ${chalk.cyan(svc)}`)
    for (let dep in dependencies[svc]) {
      const value = dependencies[svc][dep]
      const out = isString(value) ? value : `${value.url}::${value.path}`
      console.log(`    ${chalk.white(dep)}: ${chalk.gray(out)}`)
    }
    console.log()
  }
  console.log()
}

function split (val) {
  return val.split(',')
}

function getAllEnvOverrides (configs, envs) {
  let allOverrides = {}
  for (const key in configs) {
    const overrides = get(configs, [key, 'build', 'environmentOverrides'], {})
    allOverrides = merge(allOverrides, overrides)
  }
  merge(allOverrides, envs)
  return allOverrides
}

run()
