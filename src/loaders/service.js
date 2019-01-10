const { findKey, template } = require('lodash')
const chalk = require('chalk')
const inquirer = require('inquirer')
const Promise = require('bluebird')
const path = require('path')
const file = require('../util/file')
const store = require('../util/config')
const CFG_FILENAME = 'service.json'
const CFG_FILE_LOC = 'configFileLocation'

exports.load = async function (dir, prompt) {
  return attemptLoad(dir, 0, prompt)
}

async function attemptLoad (dir, attempt, prompt) {
  if (prompt) return askTheUser(dir, attempt)
  const project = file.directory(dir)
  const cfgFileLoc = store.get(`${project}.${CFG_FILE_LOC}`)
  try {
    return cfgFileLoc
      ? await loadFromConfig(cfgFileLoc, dir, attempt)
      : await loadFromRoot(dir, attempt)
  } catch (err) {
    return askTheUser(dir, attempt)
  }
}

async function loadFromConfig (location, dir, attempt) {
  switch (location.where) {
    case 'directory':
      return loadFromDirectory(location, dir, attempt)
    case 'module':
      return loadFromModule(location, dir, attempt)
    default:
      throw new Error('Unknown location type. Maybe your config is messed up')
  }
}

async function loadFromRoot (dir, attempt) {
  return file.get(dir, CFG_FILENAME)
}

async function loadFromDirectory (location, dir, attempt) {
  return getFileFromPath(location.path)
}

async function loadFromModule (location, dir, attempt) {
  const project = file.directory(dir)
  const { scope, package: pkg, path: pth } = location
  const compiledPkg = template(pkg)
  const resolvedPkg = compiledPkg({ project })
  let combinedPath = dir ? `${dir}/node_modules` : 'node_modules'
  if (scope) combinedPath += `/${scope}`
  combinedPath += `/${resolvedPkg}`
  if (pth) combinedPath += pth.startsWith('/') ? pth : pth.substr(1)
  return getFileFromPath(combinedPath)
}

async function askTheUser (dir, attempt = 0) {
  const project = file.directory(dir)
  const choiceRoot = 'At the project root'
  const choiceSubDirectory = 'In a subdirectory'
  const choiceSubModule = 'In a sub-module'
  const questions = [
    {
      type: 'list',
      name: 'type',
      message: 'Where is the service.json?',
      choices: [choiceRoot, choiceSubDirectory, choiceSubModule]
    },
    {
      type: 'input',
      name: 'directory',
      message: `Enter the path from ${project}:`,
      when: a => a.type === choiceSubDirectory
    },
    {
      type: 'input',
      name: 'moduleScope',
      message: `Enter the package scope (blank for none):`,
      when: a => a.type === choiceSubModule
    },
    {
      type: 'input',
      name: 'modulePackage',
      message: 'Enter the package name:',
      default: `${project}-ext`,
      when: a => a.type === choiceSubModule
    },
    {
      type: 'input',
      name: 'modulePath',
      message: 'Enter the directory path:',
      default: `/ops`,
      when: a => a.type === choiceSubModule
    }
  ]
  const answers = await inquirer.prompt(questions)
  let svc
  switch (answers.type) {
    case 'At the project root':
      svc = await loadFromRoot(dir, store, attempt + 1)
      break
    case 'In a subdirectory':
      addLocation(dir, {
        where: 'directory',
        path: answers.directory
      })
      svc = await attemptLoad(dir, attempt + 1)
      break
    case 'In a sub-module':
      addLocation(dir, {
        where: 'module',
        scope: answers.moduleScope,
        package: answers.modulePackage.replace(project, '${project}'),
        path: answers.modulePath
      })
      svc = await attemptLoad(dir, attempt + 1)
      break
    default:
      throw new Error('Uh. How did you get here?')
  }
  return svc
}

async function addLocation (dir, location) {
  const project = file.directory(dir)
  await store.set(`${project}.${CFG_FILE_LOC}`, location)
}

async function getFileFromPath (_path) {
  const actions = {
    named: getFileFromNamedPath,
    noname: getFileFromUnnamedPath
  }
  const formats = await Promise.props({
    named: await file.isFile(_path),
    noname: await file.isFile(path.join(_path, CFG_FILENAME))
  })
  const format = findKey(formats, (value, key) => value)
  try {
    const _file = await actions[format](_path)
    return _file
  } catch (err) {
    console.log()
    console.log(chalk.red('Error:'))
    console.log(chalk.red(`  File not found at ${_path}`))
    console.log(chalk.red('  Perhaps the module is not yet installed?'))
    console.log()
    throw new Error()
  }
}

async function getFileFromNamedPath (_path) {
  return file.get(null, _path)
}

async function getFileFromUnnamedPath (_path) {
  return file.get(_path, CFG_FILENAME)
}
