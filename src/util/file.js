const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')

exports.get = async function (directory, file) {
  const dir = directory
    ? path.join(process.cwd(), directory, file)
    : path.join(process.cwd(), file)

  try {
    await fs.statAsync(dir)
    return require(dir)
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw err
    }
    if (err.code === 'ENOENT') {
      throw new Error(`Cannot find ${dir}`)
    }
  }
}

exports.exists = async function (path) {
  try {
    return await fs.statAsync(path)
  } catch (err) {
    return false
  }
}

exports.isFile = async function (path) {
  const exists = await exports.exists(path)
  return exists ? exists.isFile() : false
}

exports.isDirectory = async function (path) {
  const exists = await exports.exists(path)
  return exists ? exists.isDirectory() : false
}

exports.mkdirp = async function (path) {
  path.split('/').reduce((path, folder) => {
    path += folder + '/'
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path)
    }
    return path
  }, '')
}

exports.directory = function (directory) {
  const dirPath = path.join(process.cwd(), directory)
  return path.basename(dirPath)
}

exports.copy = async function (source, target) {
  return new Promise((resolve, reject) => {
    var cbCalled = false

    var rd = fs.createReadStream(source)
    rd.on('error', function (err) {
      done(err)
    })
    var wr = fs.createWriteStream(target)
    wr.on('error', function (err) {
      done(err)
    })
    wr.on('close', function (ex) {
      done()
    })
    rd.pipe(wr)

    function done (err) {
      if (!cbCalled) {
        err ? reject(err) : resolve()
        cbCalled = true
      }
    }
  })
}

exports.join = async function (base, extra) {
  const p = path.join(base, extra)
  return exports.exists(p) ? p : false
}
