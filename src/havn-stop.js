const commander = require('commander')
const path = require('path')
const spawn = require('child_process').spawn
const config = require('./util/config')

async function stop () {
  commander
    .option('-p, --prune', 'Clean up docker (removes stopped containers!)')
    .option('-v, --volumes', 'Removes all associated volumes')
    .option('--remove-orphans', 'Remove all un-associated containers')
    .parse(process.argv)

  initEnvironmentVariables()
  const dir = process.env.HAVN_CONFIG_HOME

  let switches = ''
  if (commander.volumes) switches += ' --volumes'
  if (commander.removeOrphans) switches += ' --remove-orphans'

  const commands = [`cd ${dir}`, `docker-compose down${switches}`]

  if (commander.prune) {
    commands.push('printf "y\n" | docker system prune')
  }

  const command = commands.join(' && ')
  console.log(command)

  spawn(command, {
    shell: true,
    stdio: 'inherit'
  })
}

function initEnvironmentVariables () {
  process.env.HAVN_SOURCE_HOME = __dirname
  process.env.HAVN_CONFIG_HOME = path.parse(config.path).dir
}

stop()
