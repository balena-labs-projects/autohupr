# autohupr

Automatically keep your balenaOS host release up-to-date with this block!

## Environment Variables

To run this project, you will need the following environment variables in your container:

- `BALENA_API_KEY`: Automatically provided by the balena Supervisor when the `io.balena.features.balena-api` label is used.
- `BALENA_API_URL`: Automatically provided by the balena Supervisor when the `io.balena.features.balena-api` label is used.
- `BALENA_DEVICE_UUID`: Automatically provided by the balena Supervisor.
- `HUP_CHECK_INTERVAL`: Interval between checking for available updates. Defaults is 1d.
- `HUP_MAX_RETRIES`: Max retries if an update fails to apply. Default is 3.

## Usage/Examples

Add this block to your fleet application:

1. Clone or download this repo into a subdirectory of your project, eg. `./autohupr`.
2. Using the [included docker-compose file](./docker-compose.yml) for reference and add this block to your project's `docker-compose.yml`.

```yml
services:
  autohupr:
    build: ./autohupr
    tmpfs:
      - /tmp/work
    labels:
      io.balena.features.balena-api: 1
    environment:
      HUP_CHECK_INTERVAL: 1d
      HUP_MAX_RETRIES: 3
```
