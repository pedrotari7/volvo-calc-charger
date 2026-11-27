/**
 * Remote commands the app may send, as Volvo Connected Vehicle v2 paths
 * (`POST /connected-vehicle/v2/vehicles/{vin}/commands/{name}`). Unlock and engine start are deliberately absent.
 */
export const CAR_COMMANDS = [
	'lock',
	'lock-reduced-guard',
	'climatization-start',
	'climatization-stop',
	'honk',
	'flash',
	'honk-flash',
] as const;

export type CarCommand = (typeof CAR_COMMANDS)[number];

/** The key `GET /commands` lists when the car supports a command. */
export const COMMAND_KEY: Record<CarCommand, string> = {
	lock: 'LOCK',
	'lock-reduced-guard': 'LOCK_REDUCED_GUARD',
	'climatization-start': 'CLIMATIZATION_START',
	'climatization-stop': 'CLIMATIZATION_STOP',
	honk: 'HONK',
	flash: 'FLASH',
	'honk-flash': 'HONK_AND_FLASH',
};

export const isCarCommand = (x: unknown): x is CarCommand =>
	typeof x === 'string' && (CAR_COMMANDS as readonly string[]).includes(x);

/** How long Volvo runs climatisation after a remote start. An estimate: the car may stop earlier. */
export const CLIMATE_RUN_MINUTES = 30;
