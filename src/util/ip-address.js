const _ = require('lodash')
const os = require('os')

function getIPv4s () {
  const ifaces = os.networkInterfaces()
  let ipv4s = {}
  _.forEach(ifaces, (bindings, name) => {
    bindings.forEach(binding => {
      if (binding.family !== 'IPv4') return
      if (binding.internal) return
      if (!ipv4s[name]) ipv4s[name] = []
      ipv4s[name].push(binding.address)
    })
  })
  return ipv4s
}

function getMachineIP () {
  return _.find(getIPv4s(), () => true)[0]
}

module.exports = { getIPv4s, getMachineIP }
