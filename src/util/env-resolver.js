const { pickBy, template } = require('lodash')

exports.resolve = function (composed, prefix) {
  let composedStr = JSON.stringify(composed)
  const envs = pickBy(process.env, (value, key) => key.startsWith(prefix))
  const compiler = template(composedStr)
  return JSON.parse(compiler(envs))
}
