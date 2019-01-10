'use strict'

const Promise = require('bluebird')
const request = Promise.promisifyAll(require('request'))
const spawn = require('child_process').spawn
const yml = require('../util/json-to-yaml')
const env = require('../util/env-resolver')
const file = require('../util/file')

const cfg = {
  storage: '/sinopia/storage',
  web: {
    title: 'Sinopia'
  },
  auth: {
    htpasswd: {
      file: './htpasswd'
    }
  },
  uplinks: {
    npmjs: {
      url: 'https://registry.npmjs.org/',
      timeout: '30s',
      maxage: '24h'
    }
  },
  packages: {
    '@*/*': {
      access: '$all',
      publish: '$authenticated',
      proxy: 'npmjs'
    },
    '*': {
      access: '$all',
      publish: '$authenticated',
      proxy: 'npmjs'
    }
  },
  listen: '0.0.0.0:4873',
  logs: [
    {
      type: 'stdout',
      format: 'pretty',
      level: 'http'
    }
  ]
}

const CFG_HOME = '$' + '{HAVN_CONFIG_HOME}'

const dc = {
  version: '2',
  services: {
    sinopia: {
      image: 'rnbwd/sinopia:alpine',
      ports: ['4873:4873'],
      volumes: [
        `${CFG_HOME}/sinopia/config.yaml:/sinopia/registry/config.yaml`,
        `${CFG_HOME}/sinopia/.registry:/sinopia/storage`
      ]
    }
  }
}

module.exports = async function () {
  try {
    await request.getAsync(`http://${process.env.HAVN_HOST_IP}:4873`)
  } catch (err) {
    await start()
  }
}

async function start () {
  console.info('\n[info] Starting Sinopia')
  await initConfigDirectories()
  await initConfigFiles()
  const args = [
    '-f',
    `${process.env.HAVN_CONFIG_HOME}/sinopia/docker-compose.yml`,
    'up',
    '-d',
    '--remove-orphans'
  ]
  spawn('docker-compose', args, { stdio: 'inherit' })
  return whenSinopiaIsReady()
}

async function initConfigDirectories () {
  const scd = `${process.env.HAVN_CONFIG_HOME}/sinopia/.registry`
  if (!await file.exists(scd)) await file.mkdirp(scd)
}

async function initConfigFiles () {
  const { HAVN_CONFIG_HOME } = process.env
  const composeData = env.resolve(dc, 'HAVN_')
  const composePath = `${HAVN_CONFIG_HOME}/sinopia/docker-compose.yml`
  await yml.createFile(composeData, composePath)

  const configPath = `${HAVN_CONFIG_HOME}/sinopia/config.yaml`
  await yml.createFile(cfg, configPath)
}

function whenSinopiaIsReady () {
  return request
    .getAsync(`http://${process.env.HAVN_HOST_IP}:4873`)
    .then(() => console.info('[info] -Started Sinopia\n'))
    .catch(() => Promise.delay(200).then(whenSinopiaIsReady))
}
