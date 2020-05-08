/* global sb */
module.exports = (function () {
	"use strict";

	/**
	 * Represents a user's AFK status
	 * @memberof sb
	 * @type Platform
	 */
	return class Platform {
		/**
		 * Platform controller
		 * @type {Controller}
		 */
		#controller = null;

		/**
		 * @param {Object} data
		 * @param {number} data.User_Alias
		 * @param {sb.Date} data.Started
		 * @param {string} data.Text
		 * @param {boolean} data.Silent
		 */
		constructor (data) {
			/**
			 * Unique numeric platform identifier.
			 * @type {User.ID}
			 */
			this.ID = data.ID;

			/**
			 * Unique platform name.
			 * @type {string}
			 */
			this.Name = data.Name.toLowerCase();

			/**
			 * Fallback message limit.
			 * @type {number}
			 */
			this.Message_Limit = data.Message_Limit;

			/**
			 * Name of the bot's account in given platform.
			 * @type {string}
			 */
			this.Self_Name = data.Self_Name;

			/**
			 * Specific ID of the bot's account in given platform.
			 * Can be null if the platform does not support UIDs.
			 * @type {string|null}
			 */
			this.Self_ID = data.Self_ID;

			/**
			 * A string identifier to recognize a platform for mirroring.
			 * @type {string}
			 */
			this.Mirror_Identifier = data.Mirror_Identifier ?? null;

			/**
			 * Settings related to logging permissions and levels.
			 * @type {Object}
			 */
			this.Logging = {};

			if (data.Logging) {
				try {
					this.Logging = JSON.parse(data.Logging);
				}
				catch (e) {
					this.Logging = {};
					console.warn(`Platform ${this.Name} has incorrect logging settings definition`, e);
				}
			}

			/**
			 * Default platform-specific data.
			 * This can be customised in the Data column.
			 * The object is frozen, and thus cannot be modified.
			 * @type {Object}
			 */
			this.Defaults = Object.freeze({});

			if (data.Defaults) {
				try {
					this.Defaults = Object.freeze(JSON.parse(data.Logging));
				}
				catch (e) {
					this.Defaults = Object.freeze({});
					console.warn(`Platform ${this.Name} has incorrect default settings definition`, e);
				}
			}

			/**
			 * Custom platform-specific data, parsed from JSON format.
			 * It is merged with defaults on startup.
			 * @type {Object}
			 */
			this.Data = {};

			if (data.Data) {
				try {
					// Merge together custom data with defaults - custom data has priority over defaults.
					this.Data = {
						...this.Defaults,
						...JSON.parse(data.Data)
					};
				}
				catch (e) {
					this.Data = { ...this.Defaults };
					console.warn(`Platform ${this.Name} has incorrect data definition`, e);
				}
			}
			else {
				this.Data = { ...this.Defaults };
			}
		}

		get capital () {
			return sb.Utils.capitalize(this.Name);
		}

		/**
		 * Determines if a user is an "owner" of a given channel in the platform.
		 * @param channel
		 * @param user
		 * @returns {null|boolean}
		 */
		isUserChannelOwner (channel, user) {
			if (typeof this.#controller.isUserChannelOwner !== "function") {
				return null;
			}

			return this.#controller.isUserChannelOwner(channel, user);
		}

		destroy () {
			this.#controller = null;
		}

		/**
		 * Platform controller
		 * @type {Controller}
		 */
		get controller () {
			return this.#controller;
		}

		get client () {
			return this.#controller?.client ?? null;
		}

		/** @override */
		static async initialize () {
			await Platform.loadData();
			return Platform;
		}

		static async loadData () {
			const data = await sb.Query.getRecordset(rs => rs
				.select("*")
				.from("chat_data", "Platform")
			);

			Platform.data = data.map(record => new Platform(record));

			if (Platform.data.length === 0) {
				console.warn("No platforms initialized - bot will not attempt to log in to any services");
			}
		}

		static async reloadData () {
			Platform.data = [];
			await Platform.loadData();
		}

		/**
		 * Assigns controllers to each platform after they have been prepared.
		 * @param {Object<string, Controller>}controllers
		 */
		static assignControllers (controllers) {
			for (const [name, controller] of Object.entries(controllers)) {
				const platform = Platform.get(name);
				if (platform) {
					platform.#controller = controller;
				}
			}
		}

		static get (identifier) {
			if (identifier instanceof Platform) {
				return identifier;
			}
			else if (typeof identifier === "number") {
				return Platform.data.find(i => i.ID === identifier);
			}
			else if (typeof identifier === "string") {
				return Platform.data.find(i => i.Name === identifier);
			}
			else {
				throw new sb.Error({
					message: "Unrecognized platform identifier type",
					args: typeof identifier
				});
			}
		}

		/**
		 * Cleans up.
		 */
		static destroy () {
			for (const platform of Platform.data) {
				platform.destroy();
			}

			Platform.data = null;
		}
	};
})();