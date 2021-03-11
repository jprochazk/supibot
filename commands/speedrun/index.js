module.exports = {
	Name: "speedrun",
	Aliases: null,
	Author: "supinic",
	Cooldown: 10000,
	Description: "Fetches the current world record speedrun of a given name in the default category. Check extended help for more info.",
	Flags: ["mention","non-nullable","pipe","use-params"],
	Params: [
		{ name: "category", type: "string" },
		{ name: "showCategories", type: "boolean" },
		{ name: "runner", type: "string" }
	],
	Whitelist_Response: null,
	Static_Data: null,
	Code: (async function speedrun (context, ...args) {
		const showCategories = (context.params.showCategories === true);
		const categoryName = context.params.categoryName ?? null;
		const gameName = args.join(" ");
		if (!gameName) {
			return {
				success: false,
				reply: `No game name provided!`
			};
		}
	
		const { data: gameData } = await sb.Got("Speedrun", {
			url: "games",
			searchParams: new sb.URLParams()
				.set("name", gameName)
				.toString()
		}).json();
		if (gameData.length === 0) {
			return {
				success: false,
				reply: `No such game found!`
			};
		}
	
		const [game] = gameData;
		const { data: categoryData } = await sb.Got("Speedrun", `games/${game.id}/categories`).json();
		if (showCategories) {
			return {
				reply: `Available categories for ${game.names.international}: ${categoryData.map(i => i.name).join(", ")}.`
			};
		}
	
		let category;
		if (categoryName === null) {
			category = categoryData[0];
		}
		else {
			const categories = categoryData.map(i => i.name);
			const categoryMatch = sb.Utils.selectClosestString(categoryName, categories, { descriptor: true });

			category = (categoryMatch) ? categoryData[categoryMatch.index] : null;
		}
	
		if (!category) {
			return {
				success: false,
				reply: `No such category found! Try one of thise: ${categoryData.map(i => i.name).join(", ")}`
			};
		}

		const filtersData = await sb.Got("Speedrun", {
			url: `categories/${category.id}/variables`
		}).json();
		const defaultFilters = Object.fromEntries(
			Object.values(filtersData).map(filter => {
				if (filter.values.default) {
					return [filter.id, filter.values.default];
				}
			}).filter(Boolean)
		);

		const { data: runsData } = await sb.Got("Speedrun", {
			url: `leaderboards/${game.id}/category/${category.id}`,
			searchParams: "top=1"
		}).json();
		if (runsData.runs.length === 0) {
			return {
				reply: `${game.names.international} (${category.name}) has no runs.`
			};
		}

		let runner;
		if (context.params.runner) {
			const runnerData = await sb.Got("Speedrun", {
				url: "users",
				searchParams: {
					lookup: context.params.runner
				}
			}).json();

			if (runnerData.data.length === 0) {
				return {
					success: false,
					reply: `No such runner found!`
				};
			}

			runner = runnerData.data[0];
		}

		const filteredRuns = runsData.runs.filter(runData => {
			for (const [key, value] of Object.entries(defaultFilters)) {
				if (runData.values[key] !== value) {
					return false;
				}
			}

			if (runnerID) {
				const runnerFound = runData.players.find(i => i.id === runner.id);
				if (!runnerFound) {
					return false;
				}
			}

			return true;
		});

		const { run } = filteredRuns[0];
		if (!runner) {
			const { statusCode, body: runnerData } = await sb.Got("Speedrun", {
				url: `users/${run.players[0].id}`,
				throwHttpErrors: false
			});

			if (statusCode === 404) {
				return {
					success: false,
					reply: "Runner not found!"
				};
			}

			runner = runnerData.data;
		}

		const link = run.videos?.links[0] ?? run.weblink;
		const date = new sb.Date(run.date).format("Y-m-d");
		const time = sb.Utils.formatTime(run.times.primary_t);
		return {
			reply: sb.Utils.tag.trim `
				Current WR for ${game.names.international}, ${category.name}: 
				${time}.
			    Ran by ${runner.names.international},
			    from ${date}.
			    ${link}
			`
		};
	}),
	Dynamic_Description: (async (prefix) => {
		return [
			`Searches <a href="//speedrun.com">speedrun.com</a> for the world record run of a given game.`,
			`You can also specify categories. If you don't, the "default" one will be used.`,
			"",
	
			`<code>${prefix}speedrun Doom II</code>`,
			"Searches for the world record run of Doom II's default category (Hell on Earth).",
			"",
	
			`<code>${prefix}speedrun Doom II category:UV</code>`,
			"Searches for the world record run of Doom II's UV Speed category.",
			"",
	
			`<code>${prefix}speedrun Doom II categories</code>`,
			"Posts a list of all tracked categories for Doom II.",
		];
	})
};