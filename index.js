const IncomingWebhook = require('@slack/client').IncomingWebhook;

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

module.exports.gcbSlack = (event, callback) => {
  const build = eventToBuild(event.data.data);

  // Skip if the current status is not in the status list.
  // Add additional statuses to list if you'd like:
  // QUEUED, CANCELLED
  const status = ['WORKING', 'SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'];
  if (status.indexOf(build.status) === -1) {
    return callback();
  }

  const message = createSlackMessage(build);
  webhook.send(message, callback);
};

const eventToBuild = data => {
  return JSON.parse(new Buffer(data, 'base64').toString());
};

const createSlackMessage = build => {
  const { status, projectId, source, logUrl } = build;
  const revision = getRevision(source);
  return {
    attachments: [
      {
        text: `[${status}] ${projectId} - ${revision} - <${logUrl}|Build logs>`,
        color: getStatusColor(build.status)
      }
    ]
  };
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

const getRevision = source => {
  if (!source || !source.repoSource) {
    return null;
  }
  const { branchName, tagName, commitSha } = source.repoSource;
  return branchName || tagName || commitSha;
};
