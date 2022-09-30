import { getSdk, OptionalNavigationResource } from 'balena-sdk';
import ms, { StringValue } from 'ms';
const lockfile = require('proper-lockfile');

const apiKey = (process.env.BALENA_API_KEY as unknown as string) ?? undefined;
const apiUrl = (process.env.BALENA_API_URL as unknown as string) ?? undefined;
const deviceUuid =
	(process.env.BALENA_DEVICE_UUID as unknown as string) ?? undefined;

const checkInterval =
	(process.env.HUP_CHECK_INTERVAL as unknown as StringValue) || '1d';

const userTargetVersion =
	(process.env.HUP_TARGET_VERSION as unknown as StringValue) || '';

const lockFile = (process.env.BALENA_APP_LOCK_PATH || '/tmp/balena/updates.lock');

if (!apiKey) {
	console.error('BALENA_API_KEY required in environment');
	process.exit(1);
}

if (!apiUrl) {
	console.error('BALENA_API_URL required in environment');
	process.exit(1);
}

if (!deviceUuid) {
	console.error('BALENA_DEVICE_UUID required in environment');
	process.exit(1);
}

const balena = getSdk({
	apiUrl,
	dataDirectory: '/tmp/work',
});

const delay = (value: StringValue) => {
	try {
		return new Promise((resolve) => setTimeout(resolve, ms(value)));
	} catch (e) {
		throw e;
	}
};

const getExpandedProp = <T, K extends keyof T>(
	obj: OptionalNavigationResource<T>,
	key: K,
) => (Array.isArray(obj) && obj[0] && obj[0][key]) || undefined;

const getDeviceType = async (uuid: string): Promise<string> => {
	return await balena.models.device
		.get(uuid, { $expand: { is_of__device_type: { $select: 'slug' } } })
		.then(async (device) => {
			return getExpandedProp(device.is_of__device_type, 'slug') as string;
		});
};

const getDeviceVersion = async (uuid: string): Promise<string> => {
	return await balena.models.device.get(uuid).then(async (device) => {
		return balena.models.device.getOsVersion(device);
	});
};

const getTargetVersion = async (
	deviceType: string,
	deviceVersion: string,
): Promise<string | null> => {
	return await balena.models.os
		.getSupportedOsUpdateVersions(deviceType, deviceVersion)
		.then((osUpdateVersions) => {
			if (userTargetVersion == '') {
				if (osUpdateVersions.recommended) {
					return osUpdateVersions.recommended;
				} else {
					return null;
				}
			} else if (userTargetVersion != '') {
				return osUpdateVersions.versions.find(version => version.includes(userTargetVersion))! || null;
			} else {
				return null;
			}
		});
};

const getUpdateStatus = async (uuid: string): Promise<any> => {
	try {
		const hupStatus = await balena.models.device.getOsUpdateStatus(uuid);
		console.log(hupStatus);
		return hupStatus;
	} catch (e) {
		console.error(`Error getting status: ${e}`);
		return false;
	}
};

const checkLock = async (): Promise<boolean> => {
	return lockfile.check(lockFile)
		.then((isLocked: boolean) => {
			if (isLocked) {
				return true;
			} else {
				return false;
			}
		})
		.catch((e: any) => {
			console.error(e.message);
			return false;
		});
};

const main = async () => {
	while (true) {
		try {
			await balena.auth.loginWithToken(apiKey);
		} catch (e) {
			throw e;
		}

		const lockExists = await checkLock();

		if (lockExists) {
			console.log("lockfile found, skipping update...");
			await delay('2m');
			continue;
		} else {
			lockfile.lock('/tmp/balena/updates', {realpath: false})
				.then(async (release: any) => {

					while (!(await balena.models.device.isOnline(deviceUuid))) {
						console.log('Device is offline...');
						await delay('2m');
					}

					console.log('Checking last update status...');
					while (
						await getUpdateStatus(deviceUuid).then((status) => {
							return !status || status.status === 'in_progress';
						})
					) {
						console.log('Another update is already in progress...');
						await delay('2m');
					}

					const deviceType = await getDeviceType(deviceUuid);
					const deviceVersion = await getDeviceVersion(deviceUuid);

					console.log(
						`Getting recommended releases for ${deviceType} at ${deviceVersion}...`,
					);

					const targetVersion = await getTargetVersion(deviceType, deviceVersion);
					console.log("TARGET VERSION:", targetVersion);

					if (!targetVersion) {
						console.log(`No releases found!`);
					} else {
						console.log(`Starting balenaOS host update to ${targetVersion}...`);
						await balena.models.device
							.startOsUpdate(deviceUuid, targetVersion)
							.then(async () => {
								while (
									// print progress at regular intervals until status changes
									// or device reboots
									await getUpdateStatus(deviceUuid).then((status) => {
										return !status || status.status === 'in_progress';
									})
								) {
									await delay('10s');
								}
							})
							.catch((e: any) => {
								console.error(e);
							});
					}

					return release();
				})
				.catch((e: any) => {
					console.log("error locking", e);
				});
		}

		// both success and failure should wait x before trying/checking again
		console.log(`Will try again in ${checkInterval}...`);
		await delay(checkInterval);
	}
};

console.log('Starting up...');
main();
