/**
 * HTTP Agent Factory
 *
 * Creates appropriate HTTPS agents for direct connections or proxy connections.
 * Manages connection pooling, timeouts, and proxy credentials.
 */

import https from "https";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Agent cache to reuse agents and maintain connection pooling
 * Key: proxy identifier, Value: agent instance
 */
const agentCache = new Map();

/**
 * Create or retrieve a cached HTTPS agent for a proxy
 *
 * @param {Object} proxy - Proxy configuration object
 * @param {boolean} proxy.isLocalhost - If true, uses direct connection
 * @param {string} proxy.ip - Proxy IP address
 * @param {number} proxy.port - Proxy port
 * @param {string} [proxy.username] - Proxy username (optional)
 * @param {string} [proxy.password] - Proxy password (optional)
 * @returns {https.Agent|HttpsProxyAgent} HTTPS agent for the proxy
 */
export function getHttpsAgent(proxy) {
  // Direct connection (localhost)
  if (proxy.isLocalhost) {
    const cacheKey = "localhost-direct";

    if (!agentCache.has(cacheKey)) {
      const agent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
        freeSocketTimeout: 30000,
      });

      agentCache.set(cacheKey, agent);
    }

    return agentCache.get(cacheKey);
  }

  // Proxy connection
  const proxyUrl = buildProxyUrl(proxy);

  if (!agentCache.has(proxyUrl)) {
    const agent = new HttpsProxyAgent(proxyUrl, {
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000,
    });

    agentCache.set(proxyUrl, agent);
  }

  return agentCache.get(proxyUrl);
}

/**
 * Build proxy URL with credentials
 *
 * @param {Object} proxy - Proxy configuration
 * @returns {string} Proxy URL in format: http://[user:pass@]ip:port
 */
function buildProxyUrl(proxy) {
  let proxyUrl = "http://";

  if (proxy.username && proxy.password) {
    proxyUrl += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
  }

  proxyUrl += `${proxy.ip}:${proxy.port}`;

  return proxyUrl;
}

/**
 * Clear agent cache (useful for cleanup or testing)
 */
export function clearAgentCache() {
  for (const agent of agentCache.values()) {
    if (typeof agent.destroy === "function") {
      agent.destroy();
    }
  }
  agentCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getAgentCacheStats() {
  return {
    size: agentCache.size,
    keys: Array.from(agentCache.keys()),
  };
}
