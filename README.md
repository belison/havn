# Havn

# Objective

A docker-compose-composer.

## Installation

`yarn global add havn` or `npm install -g havn`

## Usage

on a project that already has a `service.json`

```sh
cd <project directory>
havn
```

and to stop

```sh
havn stop
```

## Options for havn run

| Option              | Alias | Default | Description                                                                                                            |
| ------------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| --aliases           | -a    | []      | Add additional network aliases. (e.g `havn run -a my-local.mydomain.com,your-local.mydomain.com`                       |
| --config            | -c    |         | Prompt for configuration options                                                                                       |
| --directory         | -d    | '.'     | Specify the source directory                                                                                           |
| --optionals         | -o    | all     | Load optional dependencies. (e.g. `havn run -o dep,dep-2.) Passing no dependencies will load all optional dependencies |
| --skip-module-cache |       |         | Do not use the module cache                                                                                            |
| --test'             | -t    |         | Build files but do not docker-compose up                                                                               |
| --verbose           | -v    |         | Output more detail                                                                                                     |

## Options for havn stop

| Option  | Alias | Default | Description                     |
| ------- | ----- | ------- | ------------------------------- |
| --prune | -p    |         | Run docker system prune on stop |

## Developing on Havn

from source

```sh
git clone https://github.com/havnjs/havn.git
cd havn
npm link
```

## Project Configuration

```
# service.json
{
  "name": "my-project",
  "version": "1.1.12",
  "description": "My Project does something...",
  "author": "Acme Code Co.",
  "contributors": [
    {
      "name": "Brock Carl Larry",
      "email": "brock1997@threefirstnames.com"
    }
  ],
  "common": {
    "container": {
      # ...
    },
    "router": {
      # ...
    },
    "dependencies": {
      # ...
    },
    "optional-dependencies": {
      # ...
    },
    "environmentOverrides": {
      # ...
    }
  },
  "build": {
    # overrides common settings on a build
  },
  "image": {
    # overrides common settings for and image
  }
}
```

### Container Configuration

The container section matches the docker-compose file's properties

```json
{
  "image": "redis:3.2.4-alpine",
  "ports": ["6379:6379"],
  "volumes": ["${HAVN_CONFIG_HOME}/redis/data:/data"]
}
```

### Router Configuration

```json
{
  "router": "cor-proxy",
  "redirects": {
    "/my-app": "/my-app/"
  },
  "upstreams": {
    "client": "${host}:3001",
    "server": "${host}:3000"
  },
  "paths": {
    "/team/my-project/api": "http://server{req.prefix}",
    "/team/my-project": "http://client{req.prefix}",
    "/my-project": "http://client/cor{req.prefix}"
  },
  "websockets": {
    "/sockjs-node": "ws://client{req.prefix}"
  }
}
```

### Dependency Configuration

These dependencies are loaded and keyed by their property name. If a dependency has its own
dependencies keyed by the same names (e.g. dependent-service-1 requires mongo and redis dependencies
that use the same names) the service (e.g. mongo) will be shared by all services that have that
dependency named with the same key. If you require different version, use different keys
(e.g. "mongo3", "mongo2").

```json
{
  "mongo": "https://s3.amazonaws.com/my-bucket/mongo-3.2.kdc.json",
  "redis": "https://s3.amazonaws.com/my-bucket/redis-3.2.4-alpine.kdc.json",
  "dependent-service-1": "https://github.com/Org/dep-svc-1",
  "dependent-service-2": {
    "url": "https://github.com/Org/dep-svc-2",
    "path": "/subdir"
  }
}
```

## Havn Configuration File Format (kdc.json)

```json
{
  "image": "redis:3.2.4-alpine",
  "ports": ["6379:6379"],
  "volumes": ["${HAVN_CONFIG_HOME}/redis/data:/data"]
}
```

## Configuration Variables

| Variable         | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| HAVN_CONFIG_HOME | The config directory. By default this is located at `~/.config/havn` |
| HAVN_BUILD_HOME  | The project build directory                                          |
| HAVN_NPM_TOKEN   | Pretty self explanitory                                              |
| host             | The project's host in the internal network                           |

## Building Multiple Projects Locally

Before looking for a `service.json` file, havn will look for a `services.json` file that matches
the format below. Using the `services.json` allows you to build mutliple projects locally.

`services.json`

```json
{
  "run": [
    "../my-locally-built-app-1",
    "../../other-directory/cor-apps/my-locally-built-app-2"
  ]
}
```

You can also specify command line arguments for convenience in `services.json` as follows:

```json
{
  "run": [
    {
      "directory": "../my-locally-built-app-1",
      "optionals": ["dep", "dep-2"]
    },
    "../../other-directory/cor-apps/my-locally-built-app-2"
  ],
  "params": {
    "aliases": ["my-local.mydomain.com", "your-local.mydomain.com"]
  }
}
```

The `services.json` also allows you to override environment variables in any of your dependencies:

```json
{
  "run": ["./project1", "./project2"],
  "environmentOverrides": {
    "main": {
      "COOKIE_DOMAIN": "linuxhost"
    }
  }
}
```

## Troubleshooting

### The cor-main container doesn't launch, throws errors

This issue may be caused by Docker running out of space in its virtual disk,
even though Docker may be reporting that it has plenty of space. Try the
following to fix the problem:

* Run `havn stop` (if havn is already running)
* Open Docker | Preferences
* Select the Disk tab
* Note the name of the Disk image file (typically `Docker.raw` or `Docker.qcow2`)
* Click on Open in Finder
* Delete the Docker.raw file
* Quit and restart Docker
* Try running `havn` again

## FAQ

\*. Sinopia hangs on startup
Docker creates the havn volume as root. Sinopia then tries to access it as not
root. and it stalls forever. when I chmod 777 the sinopia volume everything
works again.
