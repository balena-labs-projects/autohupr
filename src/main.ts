import { getSdk, OptionalNavigationResource } from 'balena-sdk';
import ms, { StringValue } from 'ms';

const apiKey = (process.env.BALENA_API_KEY as unknown as string) ?? undefined;
const apiUrl = (process.env.BALENA_API_URL as unknown as string) ?? undefined;
const deviceUuid =
	(process.env.BALENA_DEVICE_UUID as unknown as string) ?? undefined;

const checkInterval =
	(process.env.HUP_CHECK_INTERVAL as unknown as StringValue) || '1d';

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
		.then((versions) => {
			if (versions.recommended) {
				return versions.recommended;
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
		console.error(`Error while getting status: ${e}`);
	}
};

const main = async () => {
	while (true) {
		try {
			await balena.auth.loginWithToken(apiKey);
		} catch (e) {
			console.log(`Authentication failed: ${e}`);
			process.exit(1);
		}

		while (!(await balena.models.device.isOnline(deviceUuid))) {
			console.log('Device is offline...');
			await delay('2m');
		}

		console.log('Checking last update status...');
		while (
			await getUpdateStatus(deviceUuid).then((status) => {
				return status.status === 'in_progress';
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

		if (!targetVersion) {
			console.log(`No releases found, will check again in ${checkInterval}...`);
			await delay(checkInterval);
			break;
		}

		console.log(`Starting balenaOS host update to ${targetVersion}...`);
		try {
			await balena.models.device.startOsUpdate(deviceUuid, targetVersion);
		} catch (e) {
			console.error(`Error starting update: ${e}`);
			await delay(checkInterval);
			break;
		}

		while (
			await getUpdateStatus(deviceUuid).then((status) => {
				return status.status === 'in_progress';
			})
		) {
			console.log('Update is in progress...');
			await delay('30s');
		}

		while (
			await getUpdateStatus(deviceUuid).then((status) => {
				return status.status === 'error' || status.fatal;
			})
		) {
			console.error('Failed to update balenaOS host!');
			await delay(checkInterval);
			break;
		}

		// should never get here if running on device as it will reboot first
		console.log(`Successfully updated balenaOS host to ${targetVersion}!`);
		await delay(checkInterval);
	}
};

console.log('Starting up...');
main();
