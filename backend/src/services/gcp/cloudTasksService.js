
const { CloudTasksClient } = require('@google-cloud/tasks');
const { config } = require('../../config/env');
const { log } = require('../../utils/logger');

const tasksClient = new CloudTasksClient();

/**
 * Create a new HTTP task and add it to a queue.
 *
 * @param {string} queue - The name of the Cloud Tasks queue.
 * @param {string} url - The URL of the HTTP endpoint to invoke.
 * @param {Object} payload - The payload to send to the HTTP endpoint.
 * @param {string} [serviceAccountEmail] - The service account email to use for authentication.
 * @returns {Promise<Object>} The created task.
 */
async function createHttpTask(queue, url, payload, serviceAccountEmail = config.gcp.serviceAccountEmail) {
  const project = config.gcp.projectId;
  const location = config.gcp.location;

  const parent = tasksClient.queuePath(project, location, queue);

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail,
      },
    },
  };

  try {
    log.info(`Creating Cloud Task in queue ${queue} targeting ${url}`);
    const [response] = await tasksClient.createTask({ parent, task });
    log.info(`Created task ${response.name}`);
    return response;
  } catch (error) {
    log.error('Error creating Cloud Task:', error);
    throw error;
  }
}

module.exports = {
  createHttpTask,
};
