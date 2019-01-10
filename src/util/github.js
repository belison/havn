const retry = require('async-retry')
const Promise = require('bluebird')
const { red } = require('chalk')
const Octokit = require('@octokit/rest')
const open = require('open')
const ora = require('ora')
const queryString = require('querystring')
const randomString = require('random-string')
const request = require('request-promise-native')
const sleep = require('then-sleep')

const config = require('./config')
const pkg = require('../../package.json')

const github = new Octokit({
  protocol: 'https',
  headers: { 'user-agent': `Havn v${pkg.version}` }
})

const tokenAPI = state =>
  retry(
    async () => {
      // FIXME what should we do about authorization
      const res = await request({
        uri: 'https://havn-auth.herokuapp.com',
        qs: { state },
        json: true
      })
      if (res.status === 403) throw new Error('Unauthorized')
      if (res.error) throw res.error
      return res.token
    },
    { retries: 500 }
  )

const validateToken = token =>
  new Promise(resolve => {
    github.authenticate({ type: 'token', token })
    // See if the token works by getting
    // the data for our company's account
    // FIXME need to provide user via config/args
    github.users.getForUser({ username: 'FIXME' }, err => {
      if (err) {
        resolve(false)
        return
      }
      resolve(true)
    })
  })

async function loadToken () {
  if (!config.has('github.token')) return false
  const fromStore = config.get('github.token')
  const valid = await validateToken(fromStore)
  return valid ? fromStore : false
}

async function requestToken () {
  let authURL = 'https://github.com/login/oauth/authorize'
  const state = randomString({ length: 20 })
  const params = { client_id: '22ba4369bd7e6ad13771', scope: 'repo', state }
  authURL += '?' + queryString.stringify(params)
  open(authURL)
  const token = await tokenAPI(state)
  config.set('github.token', token)
  return token
}

exports.getAuthenticatedClient = async function () {
  let token = await loadToken()
  if (!token) {
    const spinner = ora('Opening GitHub authentication page').start()
    await sleep(100)
    try {
      token = await requestToken()
      spinner.succeed()
    } catch (err) {
      spinner.fail()
      console.log('')
      console.error(`${red('Error!')} Couldn't load token.`)
      process.exit(1)
    }
  }
  github.authenticate({ type: 'token', token })
  return github
}
