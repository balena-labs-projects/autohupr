# autohupr

Automatically keep your balenaOS host release up-to-date with this block!

## Usage

To use this image, add a service in your `docker-compose.yml` file as shown below.

```yml
services:
  autohupr:
    # where <arch> is one of aarch64, armv7hf or amd64
    image: bh.cr/balenalabs/autohupr-<arch>
    tmpfs:
      - /tmp/work
    labels:
      io.balena.features.balena-api: 1
```

To pin to a specific version of this block use:

```yml
services:
  autohupr:
    # where <version> is the release semver or release commit ID
    image: bh.cr/balenalabs/autohupr-<arch>/<version>
    tmpfs:
      - /tmp/work
    labels:
      io.balena.features.balena-api: 1
```

## Customization

### Environment Variables

- `HUP_CHECK_INTERVAL`: Interval between checking for available updates. Default is 1d.
- `HUP_TARGET_VERSION`: The OS version you want balenaHUP to automatically update your
  device to. This is a required variable to be specified, otherwise, an update won't be
  performed by default. Set the variable to 'latest'/'recommended' for your device to
  always update to the latest OS version or set it to a specific version (e.g '2.107.10').
