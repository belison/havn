'use strict'
const _ = require('lodash')
const chalk = require('chalk')
const Promise = require('bluebird')
const inquirer = require('inquirer')
const childProc = require('child_process')

var exec = childProc.exec

function containsAWSImages (dockerComposeCfg, profile) {
  // This is the docker-compose.yml as JavaScript objects
  const dc = dockerComposeCfg

  if (_.find(dc.services, v => v.image && v.image.includes('amazonaws.com/'))) {
    return validateAWSProfile(dockerComposeCfg, profile).then(loginToDocker)
  }
}

function validateAWSProfile (dc, profile) {
  return new Promise((resolve, reject) => {
    const cmd = `aws configure --profile ${profile} list`
    exec(cmd, err => {
      if (err) {
        resolve(
          askForAwsProfile(profile).then(resp =>
            validateAWSProfile(dc, resp.path)
          )
        )
      } else {
        resolve(profile)
      }
    })
  })
}

function loginToDocker (profile, usingOldAwsVersion) {
  console.log(chalk.blue('logging in to aws...'))
  const awsGenLogin = usingOldAwsVersion
    ? `aws ecr get-login --profile ${profile}`
    : `aws ecr get-login --no-include-email --profile ${profile}`
  return execPromise(awsGenLogin)
    .then(resp => execPromise(resp.stdout))
    .then(resp => {
      if (resp.stdout === 'Login Succeeded\n') {
        console.log(chalk.blue('logged in to aws!'))
      } else {
        throw new Error('Unknown response from aws-cli', resp)
      }
    })
    .catch(err => {
      console.log(chalk.red(err))
      console.log(
        chalk.blue('Try old syntax (if this works your aws-cli is out of date)')
      )
      if (!usingOldAwsVersion) return loginToDocker(profile, true)
      else throw Error(err)
    })
}

function execPromise (cmd) {
  let exitPromise
  const callbackPromise = new Promise((resolve, reject) => {
    const childProcess = exec(cmd, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
    exitPromise = new Promise((resolve, reject) => {
      childProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          const err = new Error(
            `Command: "${cmd}" exited with code: ${code} and signal: ${signal}`
          )
          reject(err)
        } else resolve({ code, signal })
      })
    })
  })
  return Promise.props({
    callback: callbackPromise.reflect(),
    exit: exitPromise.reflect()
  }).then(({ callback, exit }) => {
    if (!callback.isFulfilled()) throw new Error(callback.reason())
    else {
      const { stdout, stderr } = callback.value()
      const { code, signal } = exit.value()
      return { stdout, stderr, code, signal }
    }
  })
}

function askForAwsProfile (profile) {
  const message =
    'Pulling Docker images from AWS requires the \x1b[31mAWS CLI and credentials\x1b[0m\n' +
    'stored in a profile. You can find instructions for setting up a profile\n' +
    'at \x1b[31mhttp://bit.ly/aws-profile-setup\x1b[0m. Once setup enter the name of the\n' +
    'profile here:'
  return inquirer
    .prompt([
      {
        type: 'input',
        message,
        name: 'path',
        default: profile
      }
    ])
    .then(resp => resp || profile)
}

module.exports = containsAWSImages
