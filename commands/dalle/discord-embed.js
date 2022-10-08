/**
 * @param {string} id
 * @param {Object} options
 * @param {string} options.prompt
 * @param {CustomDate} options.created
 * @param {number} options.creationTime
 * @returns {Object[]}
 */
const createEmbeds = function createDiscordEmbed (id, options = {}) {
	const dateString = options.created.format("Y-m-d H:i:s");
	const time = sb.Utils.round(options.creationTime);

	const result = [];
	for (let i = 0; i < 9; i++) {
		const obj = {
			url: `https://supinic.com/data/dall-e/detail/${id}`,
			image: {
				url: `https://supinic.com/data/dall-e/detail/${id}/preview/${i}?direct=1`
			}
		};

		if (i === 0) {
			obj.title = "DALL-E generation";
			obj.description = options.prompt ?? "(no prompt)";
			obj.footer = {
				text: `Generated by the DALL-E API on ${dateString} in ${time} seconds, as available on HuggingFace.`
			};
		}

		result.push(obj);
	}

	return result;
};

module.exports = {
	createEmbeds
};
