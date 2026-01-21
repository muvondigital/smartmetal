const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getProjectId() {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
}

function normalizeSecretName(secretName, projectId) {
  if (!secretName) return null;
  if (secretName.startsWith('projects/')) {
    return secretName.includes('/versions/')
      ? secretName
      : `${secretName}/versions/latest`;
  }
  if (!projectId) {
    throw new Error('Missing GCP project ID for Secret Manager access.');
  }
  return `projects/${projectId}/secrets/${secretName}/versions/latest`;
}

function parseSecretMappings(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [envVar, secretName] = pair.split('=').map((part) => part.trim());
      if (!envVar || !secretName) {
        throw new Error(
          `Invalid SECRET_MANAGER_SECRETS entry: "${pair}". Expected ENV_VAR=secret-name.`
        );
      }
      return { envVar, secretName };
    });
}

async function accessSecret(client, secretName, projectId) {
  const name = normalizeSecretName(secretName, projectId);
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString('utf8');
  if (!payload) {
    throw new Error(`Secret "${secretName}" returned empty payload.`);
  }
  return payload;
}

function writeCredentialsFile(contents) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartmetal-'));
  const filePath = path.join(tmpDir, 'gcp-sa-key.json');
  fs.writeFileSync(filePath, contents, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

async function loadSecretsFromManager() {
  const mappings = parseSecretMappings(process.env.SECRET_MANAGER_SECRETS);
  const credentialsSecret = process.env.GCP_SA_KEY_SECRET;

  if (!credentialsSecret && mappings.length === 0) {
    return;
  }

  const projectId = getProjectId();
  const client = new SecretManagerServiceClient();

  if (credentialsSecret && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentialsJson = await accessSecret(client, credentialsSecret, projectId);
    const credentialsPath = writeCredentialsFile(credentialsJson);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    console.log(`? [SECRETS] Loaded GCP credentials from secret "${credentialsSecret}".`);
  }

  if (mappings.length > 0) {
    for (const { envVar, secretName } of mappings) {
      if (process.env[envVar]) {
        continue;
      }
      const value = await accessSecret(client, secretName, projectId);
      process.env[envVar] = value;
      console.log(`? [SECRETS] Loaded ${envVar} from secret "${secretName}".`);
    }
  }
}

module.exports = {
  loadSecretsFromManager,
};
