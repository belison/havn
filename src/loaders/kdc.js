const axios = require('axios')
const env = require('../util/env-resolver')

exports.canLoad = function (dep) {
  return dep.meta.url && dep.meta.url.path.endsWith('.kdc.json')
}

exports.getConfig = function (_dep) {
  const dep = env.resolve(_dep, 'HAVN_')
  switch (dep.meta.url.protocol) {
    case 'file:':
      return getConfigFromLocalFile(dep)
    case 'https:':
    case 'http:':
      return getConfigFromWeb(dep)
    default:
      throw new Error(`Unsupported kdc protocol: ${dep.meta.url.protocol}`)
  }
}

function getConfigFromLocalFile (dep) {
  const path = dep.url.substring(7)
  const json = require(path)
  return Promise.resolve({ type: 'kdc.json', data: json })
}

function getConfigFromWeb (dep) {
  return axios
    .get(dep.url)
    .then(resp => ({ type: 'kdc.json', data: resp.data }))
    .catch(err => {
      console.log('Axios err:')
      console.log(err)
    })
}
