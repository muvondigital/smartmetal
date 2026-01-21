/**
 * Google Cloud Pub/Sub Service
 * Replaces Azure Service Bus with Cloud Pub/Sub
 * Maintains same interface for backward compatibility
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const { PubSub } = require('@google-cloud/pubsub');

let pubsubClient = null;
let parsingTopic = null;

/**
 * Initialize Pub/Sub client
 */
function initializeServiceBus() {
  if (pubsubClient) {
    return pubsubClient;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const parsingTopicName = process.env.PUBSUB_PARSING_TOPIC || 'ai-parsing-topic';

  if (!projectId) {
    console.warn('Google Cloud Pub/Sub project ID not configured');
    return null;
  }

  try {
    pubsubClient = new PubSub({
      projectId: projectId,
    });

    parsingTopic = pubsubClient.topic(parsingTopicName);

    console.log('✅ Google Cloud Pub/Sub client initialized');
    console.log(`   Parsing Topic: ${parsingTopicName}`);
    return pubsubClient;
  } catch (error) {
    console.error('Failed to initialize Google Cloud Pub/Sub client', error);
    return null;
  }
}

/**
 * Send message to topic (queue)
 * MAINTAINS SAME INTERFACE as Azure Service Bus version
 * @param {string} queueName - Queue name (maps to topic name)
 * @param {Object} messageBody - Message payload
 * @param {Object} options - Additional options (correlationId, etc.)
 * @returns {Promise<string>} Message ID
 */
async function sendMessage(queueName, messageBody, options = {}) {
  const client = initializeServiceBus();
  if (!client) {
    throw new Error('Google Cloud Pub/Sub client not initialized');
  }

  try {
    // Map queue name to topic
    const topic = parsingTopic;

    // Convert message body to buffer
    const messageBuffer = Buffer.from(JSON.stringify(messageBody));

    // Publish message
    const messageId = await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        correlationId: options.correlationId || `msg-${Date.now()}`,
        subject: options.subject || '',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`✅ Message sent to Pub/Sub topic: ${topic.name} (ID: ${messageId})`);
    return messageId;
  } catch (error) {
    console.error('Failed to send message to Pub/Sub', { error: error.message, queueName });
    throw error;
  }
}




/**
 * Receive and process messages from subscription
 * MAINTAINS SAME INTERFACE as Azure Service Bus version
 * @param {string} queueName - Queue name (maps to subscription name)
 * @param {Function} messageHandler - Handler function (message) => Promise<void>
 * @param {Object} options - Processing options
 * @returns {Promise<void>}
 */
async function receiveMessages(queueName, messageHandler, options = {}) {
  const client = initializeServiceBus();
  if (!client) {
    throw new Error('Google Cloud Pub/Sub client not initialized');
  }

  // Map queue name to subscription name
  const subscriptionName = (process.env.PUBSUB_PARSING_SUBSCRIPTION || 'ai-parsing-sub');

  const subscription = client.subscription(subscriptionName);

  // Configure subscription options
  subscription.setOptions({
    flowControl: {
      maxMessages: options.maxConcurrentCalls || 1,
    },
    ackDeadline: 600, // 10 minutes (matches Azure Service Bus default)
  });

  // Message handler wrapper
  const onMessage = async (message) => {
    try {
      const payload = JSON.parse(message.data.toString());

      console.log(`📥 Processing Pub/Sub message: ${message.id}`);

      // Call user-provided message handler with Azure-compatible format
      await messageHandler(payload, {
        correlationId: message.attributes.correlationId,
        messageId: message.id,
        subject: message.attributes.subject,
      });

      // Acknowledge message
      message.ack();
      console.log(`✅ Message processed successfully: ${message.id}`);
    } catch (error) {
      console.error('❌ Error processing Pub/Sub message', {
        error: error.message,
        messageId: message.id,
      });

      // Nack message for retry
      message.nack();
    }
  };

  const onError = (error) => {
    console.error('❌ Pub/Sub subscription error:', error);
  };

  // Listen for messages
  subscription.on('message', onMessage);
  subscription.on('error', onError);

  console.log(`✅ Pub/Sub receiver started for: ${subscriptionName}`);

  // Keep the receiver alive
  return new Promise(() => {
    // This will run indefinitely until stopped
  });
}


/**
 * Send AI parsing job
 * @param {Object} jobData - Job data (structured data, tenantId, etc.)
 * @returns {Promise<string>} Message ID
 */
async function sendAiParsingJob(jobData) {
  const queueName = process.env.PUBSUB_PARSING_TOPIC || 'ai-parsing-topic';
  return sendMessage(queueName, jobData, {
    subject: 'ai-parsing',
    correlationId: jobData.correlationId || `parse-${Date.now()}`,
  });
}

/**
 * Close Pub/Sub client
 */
async function close() {
  if (pubsubClient) {
    await pubsubClient.close();
    pubsubClient = null;
    console.log('✅ Google Cloud Pub/Sub client closed');
  }
}

module.exports = {
  initializeServiceBus,
  sendMessage,
  receiveMessages,
  sendAiParsingJob,
  close,
};
