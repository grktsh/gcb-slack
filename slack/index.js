const IncomingWebhook = require('@slack/webhook').IncomingWebhook;

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

const buildTriggerIds =
  process.env.BUILD_TRIGGER_IDS && process.env.BUILD_TRIGGER_IDS.split('|');

const emojis = {
  WORKING: process.env.EMOJI_WORKING,
  SUCCESS: process.env.EMOJI_SUCCESS,
  FAILURE: process.env.EMOJI_FAILURE,
  INTERNAL_ERROR: process.env.EMOJI_INTERNAL_ERROR,
  TIMEOUT: process.env.EMOJI_TIMEOUT
};

exports.gcbToolsSlack = data => {
  const build = parseBase64EncodedJSON(data.data);

  if (buildTriggerIds && !buildTriggerIds.includes(build.buildTriggerId)) {
    return;
  }

  if (!emojis[build.status]) {
    return;
  }

  const message = createSlackMessage(build);
  if (message) {
    return webhook.send(message);
  }
};

const createSlackMessage = build => {
  const { status, source, results, logUrl, timing } = build;

  const revision = getRevision(source);
  if (!revision) {
    return null;
  }

  const parts = [revision, `<${logUrl}|Build logs>`];
  if (timing && timing.BUILD) {
    const elapsedTime = getElapsedTime(timing.BUILD);
    parts.push(elapsedTime);
  }
  if (results) {
    for (const link of getLinks(results)) {
      parts.push(`<${link.url}|${link.name}>`);
    }
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emojis[status]} ${parts.join(' - ')}`
      }
    }
  ];

  return { blocks };
};

const getRevision = source => {
  if (!source || !source.repoSource) {
    return null;
  }
  const { branchName, tagName, commitSha } = source.repoSource;
  return branchName || tagName || commitSha;
};

const getLinks = results => {
  const links = [];

  for (const output of results.buildStepOutputs) {
    if (output) {
      try {
        const link = parseBase64EncodedJSON(output)['gcb-tools.link'];
        if (link && link.url) {
          links.push(link);
        }
      } catch (e) {
        console.error(e);
        console.error(data);
      }
    }
  }

  return links;
};

const getElapsedTime = ({ startTime, endTime }) => {
  const elapsed = (Date.parse(endTime) - Date.parse(startTime)) / 1000;
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  return minutes ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
};

const parseBase64EncodedJSON = data => {
  return JSON.parse(new Buffer(data, 'base64').toString());
};
