#!/usr/bin/env node
'use strict'

const cp = require('child_process')
const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const yargs = require('yargs')
const libxml = require('libxmljs')
const differenceBy = require('lodash/differenceBy')
const intersectionBy = require('lodash/intersectionBy')
const mapKeys = require('lodash/mapKeys')

if (require.main === module) {
  parseArgs()
}

function parseArgs () {
  return yargs
    .command(
      'install',
      'Set up the merge driver in the current git repository.',
    {
      global: {
        type: 'boolean',
        default: false,
        description: 'install to your user-level git configuration'
      },
      driver: {
        type: 'string',
        default: 'npx resx-git-merge-driver merge %A %O %B %P',
        description:
            'string to install as the driver in the git configuration'
      },
      'driver-name': {
        type: 'string',
        default: 'resx-git-merge-driver',
        description:
            'String to use as the merge driver name in your configuration.'
      },
      files: {
        description: 'Filenames that will trigger this driver.',
        type: 'array',
        default: ['*.resx']
      }
    },
      install
    )
    .command(
      'uninstall',
      'Remove a previously configured driver',
    {
      global: {
        type: 'boolean',
        default: false,
        description: 'install to your user-level git configuration'
      },
      'driver-name': {
        type: 'string',
        default: 'resx-git-merge-driver',
        description:
            'String to use as the merge driver name in your configuration.'
      }
    },
      uninstall
    )
    .command(
      'merge <%A> <%O> <%B> <%P>',
      'Check for resx conflicts and correct them if necessary.',
    {
      legacy: {
        type: 'boolean',
        default: false,
        description:
            'If <command> errors, it will be re-run after checking out the --theirs version of the file, with no granular merging.'
      }
    },
      merge
    )
    .alias('version', 'v')
    .help()
    .alias('help', 'h')
    .demandCommand().argv
}

function install (argv) {
  const attrFile = findAttributes(argv).replace(
    /^\s*~\//,
    process.env.HOME + '/'
  )
  const opts = argv.global ? '--global' : '--local'
  cp.execSync(
    `git config ${opts} merge."${argv.driverName}".name "automatically merge .resx files"`
  )
  cp.execSync(
    `git config ${opts} merge."${argv.driverName}".driver "${argv.driver}"`
  )
  mkdirp.sync(path.dirname(attrFile))
  let attrContents = ''
  try {
    const RE = new RegExp(`.* merge\\s*=\\s*${argv.driverName}$`)
    attrContents = fs
      .readFileSync(attrFile, 'utf8')
      .split(/\r?\n/)
      .filter(line => !line.match(RE))
      .join('\n')
  } catch (e) {}
  if (attrContents && !attrContents.match(/[\n\r]$/g)) {
    attrContents = '\n'
  }
  attrContents += argv.files
    .map(f => `${f} merge=${argv.driverName}`)
    .join('\n')
  attrContents += '\n'
  fs.writeFileSync(attrFile, attrContents)
  console.error(
    'resx-git-merge-driver:',
    argv.driverName,
    'installed to `git config',
    opts + '`',
    'and',
    attrFile
  )
}

function uninstall (argv) {
  const attrFile = findAttributes(argv)
  const opts = argv.global ? '--global' : '--local'
  try {
    cp.execSync(
      `git config ${opts} --remove-section merge."${argv.driverName}"`
    )
  } catch (e) {
    if (!e.message.match(/no such section/gi)) {
      throw e
    }
  }
  let currAttrs
  try {
    currAttrs = fs.readFileSync(attrFile, 'utf8').split('\n')
  } catch (e) {}
  if (currAttrs) {
    let newAttrs = ''
    currAttrs.forEach(attr => {
      const match = attr.match(/ merge=(.*)$/i)
      if (!match || match[1].trim() !== argv.driverName) {
        newAttrs += attr + '\n'
      }
    })
    fs.writeFileSync(attrFile, newAttrs)
  }
}

function findAttributes (argv) {
  let attrFile
  if (argv.global) {
    try {
      attrFile = cp
        .execSync(`git config --global core.attributesfile`)
        .toString('utf8')
        .trim()
    } catch (e) {}
    if (!attrFile) {
      if (process.env.XDG_CONFIG_HOME) {
        attrFile = path.join(process.env.XDG_CONFIG_HOME, 'git', 'attributes')
      } else {
        attrFile = path.join(process.env.HOME, '.config', 'git', 'attributes')
      }
    }
  } else {
    const gitDir = cp
      .execSync(`git rev-parse --git-dir`, {
        encoding: 'utf8'
      })
      .trim()
    attrFile = path.join(gitDir, 'info', 'attributes')
  }
  return attrFile
}

function merge (argv) {
  console.error('resx-git-merge-driver: merging', argv['%P'])
  // let git handle the merge normally
  const ret = cp.spawnSync(
    'git',
    [
      'merge-file',
      '-p',
      '-L HEAD',
      '-L INCOMING',
      '--union',
      argv['%A'],
      argv['%O'],
      argv['%B']
    ],
    {
      stdio: [0, 'pipe', 2]
    }
  )
  fs.writeFileSync(argv['%P'], ret.stdout)

  try {
    // see if the resulting file  has markers
    const result = ret.stdout.toString('utf8')
    // also check if it's correct XML (will throw if not)
    libxml.parseXmlString(result)
  } catch (e) {
    // let's try and do the merge manually then
    const left = libxml.parseXmlString(fs.readFileSync(argv['%A'], 'utf8'))
    const right = libxml.parseXmlString(fs.readFileSync(argv['%B'], 'utf8'))

    // so first of all we want to add any new nodes to A from B,
    const leftNames = left
      .root()
      .childNodes()
      .filter(node => node.type() === 'element' && node.name() === 'data')
      .map(node => ({
        name: node.attr('name').value(),
        path: node.path(),
        value: node.text()
      }))
    const rightNames = right
      .root()
      .childNodes()
      .filter(node => node.type() === 'element' && node.name() === 'data')
      .map(node => ({
        name: node.attr('name').value(),
        path: node.path(),
        value: node.text()
      }))

    // any value changes ?
    const rightNamesMap = mapKeys(rightNames, 'name')
    const commonNames = intersectionBy(leftNames, rightNames, el => el.name)
    const differentValues = commonNames.filter(
      node => node.value !== rightNamesMap[node.name].value
    )

    if (differentValues.length !== 0) {
      console.error(
        'there are conflicts that need resolving manually on:',
        argv['%P']
      )
      const ret = cp.spawnSync(
        'git',
        [
          'merge-file',
          '-p',
          '-L HEAD',
          '-L INCOMING',
          argv['%A'],
          argv['%O'],
          argv['%B']
        ],
        {
          stdio: [0, 'pipe', 2]
        }
      )
      fs.writeFileSync(argv['%A'], ret.stdout)
      process.exit(-1)
    }

    const newNodeNames = differenceBy(rightNames, leftNames, el => el.name)
    // add in left what's not in right
    newNodeNames.forEach((node, idx) => {
      left.root().addChild(right.get(node.path))
    })

    // merge complete :)
    ret.stdout = left.toString()
  }
  fs.writeFileSync(argv['%A'], ret.stdout)
  console.error('resx-git-merge-driver:', argv['%P'], 'successfully merged.')
}
