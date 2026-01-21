#!/usr/bin/env node

/**
 * Backend Health Monitor
 * Monitors the Pricer backend API health and performance
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 5000; // 5 seconds
const ALERT_THRESHOLD = parseInt(process.env.ALERT_THRESHOLD) || 3; // consecutive failures

let consecutiveFailures = 0;
let totalRequests = 0;
let totalSuccesses = 0;
let totalFailures = 0;
let responseTimes = [];
let startTime = Date.now();

async function checkHealth() {
  const start = Date.now();

  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    const responseTime = Date.now() - start;
    const data = await response.json();

    totalRequests++;
    responseTimes.push(responseTime);
    if (responseTimes.length > 100) responseTimes.shift(); // keep last 100

    if (response.ok && data.status === 'ok') {
      totalSuccesses++;
      consecutiveFailures = 0;

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      console.log(`✓ [${new Date().toLocaleTimeString()}] Backend healthy`);
      console.log(`  Response: ${responseTime}ms (avg: ${avgResponseTime.toFixed(0)}ms)`);
      console.log(`  Uptime: ${formatUptime(uptime)} | Success: ${totalSuccesses}/${totalRequests} (${((totalSuccesses/totalRequests)*100).toFixed(1)}%)`);

      if (responseTime > 1000) {
        console.log(`  ⚠️  Slow response detected (${responseTime}ms)`);
      }
    } else {
      throw new Error(`Unhealthy status: ${data.status || 'unknown'}`);
    }
  } catch (error) {
    totalRequests++;
    totalFailures++;
    consecutiveFailures++;

    console.error(`✗ [${new Date().toLocaleTimeString()}] Backend check failed`);
    console.error(`  Error: ${error.message}`);
    console.error(`  Consecutive failures: ${consecutiveFailures}`);

    if (consecutiveFailures >= ALERT_THRESHOLD) {
      console.error(`\n🚨 ALERT: Backend has failed ${consecutiveFailures} consecutive health checks!`);
      console.error(`   URL: ${BACKEND_URL}/health`);
      console.error(`   Consider restarting the backend service.\n`);
    }
  }

  console.log(''); // blank line for readability
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// Check port availability
async function checkPort() {
  try {
    const net = await import('net');
    return new Promise((resolve) => {
      const server = net.default.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(4000);
    });
  } catch {
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backend Health Monitor');
  console.log('='.repeat(60));
  console.log(`Target: ${BACKEND_URL}`);
  console.log(`Check interval: ${CHECK_INTERVAL}ms`);
  console.log(`Alert threshold: ${ALERT_THRESHOLD} failures`);
  console.log('Press Ctrl+C to stop monitoring');
  console.log('='.repeat(60));
  console.log('');

  // Initial check
  await checkHealth();

  // Start periodic checks
  setInterval(checkHealth, CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nMonitoring stopped.');
  console.log(`Final stats: ${totalSuccesses} successes, ${totalFailures} failures out of ${totalRequests} checks`);
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
