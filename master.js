// Classes requires
const Filter = require("./classes/filter.js");
const Command = require("./classes/command.js");
const User = require("./classes/user.js");
const AwayFromKeyboard = require("./classes/afk.js");
const Banphrase = require("./classes/banphrase.js");
const Channel = require("./classes/channel.js");
const Reminder = require("./classes/reminder.js");
const ChatModule = require("./classes/chat-module.js");

// Singletons requires
const Logger = require("./singletons/logger.js");
const Pastebin = require("./singletons/pastebin.js");
const VLCConnector = require("./singletons/vlc-connector.js");

// Platform require
const Platform = require("./platforms/template.js");

const importFileDataModule = async (module, path) => {
	if (!config.modules[path]) {
		throw new Error(`Missing configuration for ${path}`);
	}

	const {
		disableAll = true,
		whitelist = [],
		blacklist = []
	} = config.modules[path];

	if (whitelist.length > 0 && blacklist.length > 0) {
		throw new Error(`Cannot combine blacklist and whitelist for ${path}`);
	}
	else if (disableAll) {
		console.warn(`Module ${path} is disabled - will not load`);
		return;
	}

	const identifier = (path === "gots") ? "name" : "Name";
	const { definitions } = await import(`./${path}/index.mjs`);
	if (blacklist.length > 0) {
		await module.importData(definitions.filter(i => !blacklist.includes(i[identifier])));
	}
	else if (whitelist.length > 0) {
		await module.importData(definitions.filter(i => whitelist.includes(i[identifier])));
	}
	else {
		await module.importData(definitions);
	}
};

let config;
try {
	config = require("./config.json");
}
catch {
	try {
		config = require("./config-default.json");
	}
	catch {
		throw new Error("No default or custom configuration found");
	}
}

const databaseModuleInitializeOrder = [
	// First batch - no dependencies
	[Filter, Command, User, AwayFromKeyboard, Banphrase, Channel, Reminder],
	// Second batch - depends on Channel
	[ChatModule]
];

const initializeCommands = async (config) => {
	if (config.modules.commands.disableAll) {
		console.warn("Load commands - skipped due to `disableAll` setting");
		return;
	}

	console.time("Load commands");
	const {
		blacklist,
		whitelist
	} = config.modules.commands;

	const { loadCommands } = await require("./commands/index.js");
	const commands = await loadCommands({
		blacklist,
		whitelist
	});

	await Command.importData(commands.definitions);
	console.timeEnd("Load commands");
};

// Database access keys are loaded here, and stored to process.env
require("./db-access.js");

(async () => {
	const platformsConfig = config.platforms;
	if (!platformsConfig || platformsConfig.length === 0) {
		console.warn("No platforms configured! Supibot will now exit.");
		process.exit(0);
	}

	console.groupCollapsed("Initialize timers");
	console.time("supi-core");

	const core = await import("supi-core");
	const Query = new core.Query({
		user: process.env.MARIA_USER,
		password: process.env.MARIA_PASSWORD,
		host: process.env.MARIA_HOST,
		connectionLimit: process.env.MARIA_CONNECTION_LIMIT
	});

	const configData = await Query.getRecordset(rs => rs
		.select("*")
		.from("data", "Config"));

	core.Config.load(configData);

	globalThis.sb = {
		Date: core.Date,
		Error: core.Error,
		Promise: core.Promise,

		Config: core.Config,
		Got: core.Got,

		Query,
		Cache: new core.Cache(core.Config.get("REDIS_CONFIGURATION")),
		Metrics: new core.Metrics(),
		Utils: new core.Utils()
	};

	console.timeEnd("supi-core");

	const platforms = new Set();
	for (const definition of platformsConfig) {
		platforms.add(Platform.create(definition.type, definition));
	}

	console.time("basic bot modules");

	// Initialize bot-specific modules with database-driven data
	for (let i = 0; i < databaseModuleInitializeOrder.length; i++) {
		console.debug(`Modules batch #${i + 1}`);

		const initOrder = databaseModuleInitializeOrder[i];
		const promises = initOrder.map(async (module) => {
			console.time(`Init ${module.name}`);
			await module.initialize();
			console.timeEnd(`Init ${module.name}`);
		});

		if (i === 0) {
			await Promise.all([...promises, initializeCommands(config)]);
		}
		else {
			await Promise.all(promises);
		}
	}

	globalThis.sb = {
		...sb,

		Platform,

		Filter,
		Command,
		User,
		AwayFromKeyboard,
		Banphrase,
		Channel,
		Reminder,
		ChatModule,

		Logger: new Logger(),
		Pastebin: new Pastebin(),
		VideoLANConnector: VLCConnector.initialize(), // @todo move code from `initialize` here

		API: require("./api")
	};

	console.timeEnd("basic bot modules");
	console.time("chat modules");

	await Promise.all([
		importFileDataModule(ChatModule, "chat-modules"), importFileDataModule(sb.Got, "gots")
	]);

	console.timeEnd("chat modules");
	console.time("crons");

	const { initializeCrons } = await import("./crons/index.mjs");
	initializeCrons(config.modules.crons);

	console.timeEnd("crons");

	if (sb.Metrics) {
		sb.Metrics.registerCounter({
			name: "supibot_messages_sent_total",
			help: "Total number of Twitch messages sent by the bot.",
			labelNames: ["platform", "channel"]
		});

		sb.Metrics.registerCounter({
			name: "supibot_messages_read_total",
			help: "Total number of Twitch messages seen (read) by the bot.",
			labelNames: ["platform", "channel"]
		});
	}

	const promises = [];
	for (const platform of platforms) {
		if (!platform.active) {
			console.debug(`Platform ${platform.name} (ID ${platform.ID}) is set to inactive, not connecting`);
			continue;
		}

		platform.checkConfig();
		promises.push((async () => {
			console.time(`Platform connect: ${platform.name}`);
			await platform.connect();
			console.timeEnd(`Platform connect: ${platform.name}`);
		})());
	}

	await Promise.all(promises);

	console.debug("Ready!");
	console.groupEnd();

	process.on("unhandledRejection", async (reason) => {
		if (!(reason instanceof Error)) {
			return;
		}

		const origin = (reason.message?.includes("RequestError: Timeout awaiting 'request'"))
			? "External"
			: "Internal";

		try {
			await sb.Logger.logError("Backend", reason, {
				origin,
				context: {
					cause: "UnhandledPromiseRejection"
				}
			});
		}
		catch (e) {
			console.warn("Rejected the promise of promise rejection handler", { reason, e });
		}
	});
})();
