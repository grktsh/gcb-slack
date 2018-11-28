const https = require('https');

const BITBUCKET_APP_USERNAME = process.env.BITBUCKET_APP_USERNAME;
const BITBUCKET_APP_PASSWORD = process.env.BITBUCKET_APP_PASSWORD;
const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_REPO_SLUG = process.env.BITBUCKET_REPO_SLUG;

const buildTriggerIds = process.env.BUILD_TRIGGER_IDS
  ? process.env.BUILD_TRIGGER_IDS.split(',')
  : [];

exports.gcbToolsBitbucket = (data, context) => {
  const build = parseBase64EncodedJSON(data.data);

  if (
    buildTriggerIds.length &&
    buildTriggerIds.indexOf(build.buildTriggerId) === -1
  ) {
    return;
  }

  const state = getBitbucketState(build.status);
  if (!state) {
    return;
  }

  const commitSha = getCommitSha(build.sourceProvenance);
  if (!commitSha) {
    return;
  }

  const path = `/2.0/repositories/${BITBUCKET_USERNAME}/${BITBUCKET_REPO_SLUG}/commit/${commitSha}/statuses/build`;
  const buildStatus = {
    state,
    key: 'Cloud Build',
    url: build.logUrl
  };
  postBuildStatus(path, buildStatus);

  if (build.results) {
    for (const link of getLinks(build.results)) {
      const buildStatus = {
        state,
        key: link.name,
        url: link.url
      };
      postBuildStatus(path, buildStatus);
    }
  }
};

const getBitbucketState = status => {
  return {
    QUEUED: 'INPROGRESS',
    WORKING: 'INPROGRESS',
    SUCCESS: 'SUCCESSFUL',
    FAILURE: 'FAILED',
    INTERNAL_ERROR: 'FAILED',
    TIMEOUT: 'STOPPED',
    CANCELLED: 'STOPPED'
  }[status];
};

const getCommitSha = sourceProvenance => {
  const repoSource = sourceProvenance && sourceProvenance.resolvedRepoSource;
  return repoSource && repoSource.commitSha;
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

const postBuildStatus = (path, buildStatus) => {
  const postData = JSON.stringify(buildStatus);
  const options = {
    hostname: 'api.bitbucket.org',
    method: 'POST',
    path,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    auth: BITBUCKET_APP_USERNAME + ':' + BITBUCKET_APP_PASSWORD
  };
  const req = https.request(options, res => {
    console.log('Status:', res.statusCode);
    res.setEncoding('utf8');
    res.on('data', chunk => {
      console.log('Body:', chunk);
    });
  });
  req.on('error', e => {
    console.error('Error:', e);
  });
  req.write(postData);
  req.end();
};

const parseBase64EncodedJSON = data => {
  return JSON.parse(new Buffer(data, 'base64').toString());
};
