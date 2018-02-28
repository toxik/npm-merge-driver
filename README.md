# resx-git-merge-driver(1) -- git merge driver for automatic merging of lockfiles

### Automatic Setup (recommended):

To start using it right away:

```
$ npx resx-git-merge-driver install --global
```

**Or** install it locally, per-project:
```
$ cd /path/to/git/repository
$ npx resx-git-merge-driver install
```

...And you're good to go!

### Advanced

The following section is only for advanced configuration of the driver if you
have specific needs.

#### Setup Options

`resx-git-merge-driver install` supports a couple of config options:

`--driver` - string to install as the driver in the git configuration

`--driver-name` - string to use as the merge driver name in your configuration

`--files` - list of files that will trigger this driver

`--no-legacy` - disables retrying legacy commands on error

#### Merge Options

`resx-git-merge-driver merge` can also be configured:

`-c, --command` - command to execute when a lockfile is conflicted

`--no-legacy` - disables retrying legacy commands on error

#### Install as Dependency

To avoid regular `npx` installs, consider installing the driver:

`$ npm install [-g|--save-dev] resx-git-merge-driver`

#### Manual Setup (advanced):

`resx-git-merge-driver` requires two git configurations to work: a git configuration
to add the driver to git, which is by default your local `.git/config` file, and
a `gitattributes(5)` configuration, which is by default your local
`.git/info/attributes`.

If you **do not** want `resx-git-merge-driver` to install itself for you:

Add the driver to `.git/config`:
```
$ git config merge."resx-git-merge-driver".name \
    "Automatically merge resx files"
$ git config merge."resx-git-merge-driver".driver \
    "npx resx-git-merge-driver merge %A %O %B %P"
```

Add the relevant attributes to `.gitattributes` or `.git/info/attributes`:
```
*.resx merge=resx-git-merge-driver
```

#### Uninstalling

To remove an installed merge driver, use `resx-git-merge-driver uninstall`:

```
$ npx resx-git-merge-driver uninstall [--global] [--driver-name=resx-git-merge-driver]
```

## LICENSE

This work is released under the terms of the ISC license. See `LICENSE.md` for details.

## SEE ALSO

* `git-config(1)`
* `gitattributes(5)`
