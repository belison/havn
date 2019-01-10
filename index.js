#! /usr/bin/env node

const isAsyncSupported = require('is-async-supported')

if (!isAsyncSupported()) {
  const asyncToGen = require('async-to-gen/register')
  asyncToGen({ sourceMaps: true })
}

require('./src/havn')
