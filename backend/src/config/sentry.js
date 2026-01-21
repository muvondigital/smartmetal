const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

/**
 * Sentry Configuration
 *
 * Purpose: Application monitoring, error tracking, and performance monitoring
 *
 * Features:
 * - Automatic error capturing
 * - Performance monitoring (slow queries, API latency)
 * - Release tracking
 * - Environment tracking (dev, staging, production)
 * - User context (for debugging)
 * - Custom tags and context
 *
 * Setup:
 * 1. Create Sentry account at https://sentry.io
 * 2. Create new project (select Node.js)
 * 3. Copy DSN to .env file: SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
 * 4. Optional: Set SENTRY_ENVIRONMENT (dev, staging, production)
 * 5. Optional: Set SENTRY_RELEASE (git commit hash or version)
 */

function initSentry(app) {
  // Skip Sentry initialization if DSN is not configured
  if (!process.env.SENTRY_DSN) {
    console.log('[Sentry] Sentry DSN not configured - monitoring disabled');
    console.log('[Sentry] To enable: Set SENTRY_DSN in .env file');
    return;
  }

  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const release = process.env.SENTRY_RELEASE || `backend@${require('../../package.json').version}`;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment,
    release,

    // Performance Monitoring
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in production, 100% in dev

    // Profiling
    profilesSampleRate: environment === 'production' ? 0.1 : 1.0,

    integrations: [
      // Profiling integration
      nodeProfilingIntegration(),
    ],

    // Ignore expected errors
    ignoreErrors: [
      // Ignore rate limit errors (expected behavior)
      'Too many AI requests',
      'Too many requests',
      'Too many authentication attempts',

      // Ignore validation errors (user input errors)
      'Invalid request',
      'Validation failed',

      // Ignore 404 errors
      'Not found',
      'NotFoundError',
    ],

    // Before sending to Sentry, scrub sensitive data
    beforeSend(event, hint) {
      // Remove sensitive data from request body
      if (event.request && event.request.data) {
        const data = typeof event.request.data === 'string'
          ? JSON.parse(event.request.data)
          : event.request.data;

        // Scrub sensitive fields
        const sensitiveFields = ['password', 'token', 'api_key', 'secret', 'authorization'];
        sensitiveFields.forEach(field => {
          if (data[field]) {
            data[field] = '[REDACTED]';
          }
        });

        event.request.data = data;
      }

      // Remove sensitive headers
      if (event.request && event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      return event;
    },

    // Before capturing breadcrumb
    beforeBreadcrumb(breadcrumb, hint) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null; // Skip console.log breadcrumbs
      }
      return breadcrumb;
    }
  });

  console.log(`[Sentry] Monitoring enabled (${environment}, ${release})`);

  // Attach Sentry request handler (must be first middleware)
  if (app) {
    app.use(Sentry.Handlers.requestHandler());

    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());
  }

  return Sentry;
}

/**
 * Error handler for Express (must be AFTER all routes)
 */
function sentryErrorHandler() {
  // If Sentry is not initialized (no DSN), return a no-op middleware
  if (!process.env.SENTRY_DSN || !Sentry || !Sentry.Handlers) {
    return (err, req, res, next) => next(err);
  }

  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all errors with status >= 500
      if (error.status && error.status >= 500) {
        return true;
      }

      // Capture specific error types regardless of status
      if (error.name === 'DatabaseError' || error.name === 'ServiceError') {
        return true;
      }

      return false;
    }
  });
}

/**
 * Capture custom error with context
 */
function captureError(error, context = {}) {
  if (!process.env.SENTRY_DSN) {
    return; // Skip if Sentry not configured
  }

  Sentry.withScope((scope) => {
    // Add custom context
    if (context.user) {
      scope.setUser({ id: context.user.id, email: context.user.email });
    }

    if (context.tags) {
      Object.keys(context.tags).forEach(key => {
        scope.setTag(key, context.tags[key]);
      });
    }

    if (context.extra) {
      Object.keys(context.extra).forEach(key => {
        scope.setExtra(key, context.extra[key]);
      });
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture custom message
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!process.env.SENTRY_DSN) {
    return; // Skip if Sentry not configured
  }

  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.keys(context.tags).forEach(key => {
        scope.setTag(key, context.tags[key]);
      });
    }

    if (context.extra) {
      Object.keys(context.extra).forEach(key => {
        scope.setExtra(key, context.extra[key]);
      });
    }

    Sentry.captureMessage(message, level);
  });
}

/**
 * Start a transaction for performance monitoring
 */
function startTransaction(name, op = 'http.server') {
  if (!process.env.SENTRY_DSN) {
    return null; // Skip if Sentry not configured
  }

  return Sentry.startTransaction({
    name,
    op,
  });
}

/**
 * Add breadcrumb for debugging trail
 */
function addBreadcrumb(category, message, data = {}, level = 'info') {
  if (!process.env.SENTRY_DSN) {
    return; // Skip if Sentry not configured
  }

  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
  });
}

module.exports = {
  initSentry,
  sentryErrorHandler,
  captureError,
  captureMessage,
  startTransaction,
  addBreadcrumb,
  Sentry
};
