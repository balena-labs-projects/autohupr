import { getSdk, OptionalNavigationResource } from 'balena-sdk';
import * as semver from 'balena-semver';
import ms, { StringValue } from 'ms';

const apiKey = (process.env.BALENA_API_KEY as unknown as string) ?? undefined;
const apiUrl = (process.env.BALENA_API_URL as unknown as string) ?? undefined;
const deviceUuid =
	(process.env.BALENA_DEVICE_UUID as unknown as string) ?? undefined;

const checkInterval =
	(process.env.HUP_CHECK_INTERVAL as unknown as StringValue) || '1d';
const maxRetries = (process.env.HUP_MAX_RETRIES as unknown as number) || 3;

const retryInterval = '5m';
const statusInterval = '30s';

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

enum osUpdateStatus {
	IN_PROGRESS = 'in_progress',
	DONE = 'done',
	ERROR = 'error',
}

const delay = (value: StringValue) => {
	try {
		return new Promise((resolve) => setTimeout(resolve, ms(value)));
	} catch (e) {
		console.error(`Error while setting delay: ${e}`);
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
		.then((versions) => {
			if (versions.recommended) {
				return versions.recommended;
			} else {
				return null;
			}
		});
};

const isHupInProgress = async (uuid: string): Promise<boolean> => {
	try {
		const hupStatus = await balena.models.device.getOsUpdateStatus(uuid);
		return hupStatus.status === osUpdateStatus.IN_PROGRESS;
	} catch (e) {
		console.error(`Error while getting status: ${e}`);
	}
	return false;
};

const isHupFailed = async (
	uuid: string,
	targetVersion: string,
): Promise<boolean> => {
	try {
		const hupStatus = await balena.models.device.getOsUpdateStatus(deviceUuid);
		if (hupStatus.status === osUpdateStatus.ERROR || hupStatus.fatal === true) {
			return true;
		} else if (hupStatus.status === osUpdateStatus.DONE) {
			const deviceVersion = await getDeviceVersion(uuid);
			if (semver.gt(targetVersion, deviceVersion)) {
				console.error(
					`Update complete but version is unchanged! (target ${targetVersion}, current: ${deviceVersion})`,
				);
				return true;
			}
		}
	} catch (e) {
		console.error(`Error while getting status: ${e}`);
	}
	return false;
};

const doUpdate = async (
	uuid: string,
	targetVersion: string,
): Promise<boolean> => {
	while (!(await balena.models.device.isOnline(uuid))) {
		console.log('Device is offline...');
		await delay(statusInterval);
	}

	while (await isHupInProgress(uuid)) {
		console.log('Another update is already in progress...');
		await delay(statusInterval);
	}

	console.log(`Updating balenaOS host to ${targetVersion}...`);
	try {
		await balena.models.device.startOsUpdate(uuid, targetVersion);
	} catch (e) {
		console.error(`Error while starting update: ${e}`);
		return false;
	}

	while (await isHupInProgress(uuid)) {
		console.log('Update in progress...');
		await delay(statusInterval);
	}

	if (await isHupFailed(uuid, targetVersion)) {
		console.error('balenaOS host update failed!');
		return false;
	}

	console.log('balenaOS host update successful!');
	return true;
};

const main = async () => {
	while (true) {
		await balena.auth.loginWithToken(apiKey);

		const deviceType = await getDeviceType(deviceUuid);
		const deviceVersion = await getDeviceVersion(deviceUuid);

		console.log(
			`Getting recommended release for ${deviceType} at ${deviceVersion}...`,
		);

		const targetVersion = await getTargetVersion(deviceType, deviceVersion);

		if (!targetVersion) {
			console.log('No releases found...');
		} else {
			let count = 0;
			while (count < maxRetries) {
				count++;

				console.log(`Starting update attempt ${count}/${maxRetries}...`);

				if (await doUpdate(deviceUuid, targetVersion)) {
					break;
				}

				console.log(`Retrying in ${retryInterval}...`);
				await delay(retryInterval);
			}
		}

		console.log(`Will check again in ${checkInterval}...`);
		await delay(checkInterval);
	}
};

console.log('Starting up...');
main();
