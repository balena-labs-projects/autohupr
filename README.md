# autohupr

Automatically keep your balenaOS host release up-to-date with this block!

## Usage

To use this image, add a service in your `docker-compose.yml` file as shown below.

```yml
services:
  autohupr:
    # where <arch> is one of aarch64, armv7hf or amd64
    image: bh.cr/balenablocks/autohupr-<arch>
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
    image: bh.cr/balenablocks/autohupr-<arch>/<version>
    tmpfs:
      - /tmp/work
    labels:
      io.balena.features.balena-api: 1
```

## Customization

### Environment Variables

- `HUP_CHECK_INTERVAL`: Interval between checking for available updates. Default is 1d.
