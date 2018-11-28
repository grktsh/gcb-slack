const IncomingWebhook = require('@slack/client').IncomingWebhook;

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

const buildTriggerIds = process.env.BUILD_TRIGGER_IDS
  ? process.env.BUILD_TRIGGER_IDS.split(',')
  : [];

const statuses = [
  'WORKING',
  'SUCCESS',
  'FAILURE',
  'INTERNAL_ERROR',
  'TIMEOUT',
  'CANCELLED'
];

exports.gcbToolsSlack = (data, context) => {
  const build = parseBase64EncodedJSON(data.data);

  if (
    buildTriggerIds.length &&
    buildTriggerIds.indexOf(build.buildTriggerId) === -1
  ) {
    return;
  }

  if (statuses.indexOf(build.status) === -1) {
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

  return {
    attachments: [
      {
        text: `[${status.toLowerCase()}] ${parts.join(' - ')}`,
        color: getStatusColor(build.status)
      }
    ]
  };
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
        if (link) {
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

const getStatusColor = status => {
  const colorMap = {
    SUCCESS: 'good',
    FAILURE: 'danger',
    INTERNAL_ERROR: 'danger',
    TIMEOUT: 'warning'
  };
  return colorMap[status] || null;
};

const parseBase64EncodedJSON = data => {
  return JSON.parse(new Buffer(data, 'base64').toString());
};
