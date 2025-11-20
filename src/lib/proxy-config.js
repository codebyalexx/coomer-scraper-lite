/**
 * Proxy Configuration System
 *
 * Manages proxy definitions and concurrency limits for the multi-proxy downloader.
 * Each proxy (including localhost) operates independently with its own concurrency limits.
 *
 * Configuration Sources (in priority order):
 * 1. Environment variables (PROXY_POST_LIMIT, PROXY_ATTACHMENT_LIMIT)
 * 2. Default values defined in this file
 * 3. Hardcoded fallback values for safety
 */

import dotenv from "dotenv";
dotenv.config();

/**
 * Get concurrency configuration from environment or defaults
 */
function getConcurrencyConfig() {
  return {
    // Maximum concurrent posts processed per proxy
    postLimit: parseInt(process.env.PROXY_POST_LIMIT || "2", 10),

    // Maximum concurrent attachments downloaded per post per proxy
    attachmentLimit: parseInt(process.env.PROXY_ATTACHMENT_LIMIT || "4", 10),

    // Download timeout in milliseconds (10 minutes)
    downloadTimeout: parseInt(process.env.PROXY_DOWNLOAD_TIMEOUT || "600000", 10),

    // Redirect limit to prevent loops
    maxRedirects: parseInt(process.env.PROXY_MAX_REDIRECTS || "1", 10),

    // Redis key TTL for skipped downloads (1 hour)
    skipCacheTTL: parseInt(process.env.PROXY_SKIP_CACHE_TTL || "3600", 10),

    // Maximum retries per download
    maxRetries: parseInt(process.env.PROXY_MAX_RETRIES || "3", 10),

    // Retry backoff multiplier (exponential backoff: baseDelay * multiplier^attempt)
    retryBackoffMultiplier: parseFloat(process.env.PROXY_RETRY_BACKOFF || "2"),

    // Base retry delay in milliseconds
    retryBaseDelay: parseInt(process.env.PROXY_RETRY_BASE_DELAY || "1000", 10),
  };
}

/**
 * Proxy Configuration Interface
 *
 * Each proxy can be:
 * - { isLocalhost: true } - Direct downloads via localhost (no proxy)
 * - { ip, port, username?, password?, isLocalhost?: false } - HTTP/HTTPS proxy with credentials
 */

/**
 * Parse proxies from environment variable or use defaults
 *
 * Expected format for PROXY_LIST env var (JSON):
 * [
 *   { "isLocalhost": true },
 *   { "ip": "proxy1.example.com", "port": 3128, "username": "user1", "password": "pass1" },
 *   { "ip": "proxy2.example.com", "port": 3128 }
 * ]
 */
function getProxiesConfig() {
  try {
    const proxyListEnv = process.env.PROXY_LIST;

    if (proxyListEnv) {
      const parsed = JSON.parse(proxyListEnv);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[Proxy Config] Loaded ${parsed.length} proxies from PROXY_LIST environment variable`);
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`[Proxy Config] Failed to parse PROXY_LIST environment variable: ${e.message}`);
  }

  // Default: localhost only
  const defaultProxies = [{ isLocalhost: true }];
  console.log(`[Proxy Config] Using default proxy configuration (localhost only)`);

  return defaultProxies;
}

/**
 * Validate proxy configuration
 */
function validateProxyConfig(proxy) {
  if (proxy.isLocalhost) {
    return true;
  }

  if (!proxy.ip || !proxy.port) {
    console.warn(`[Proxy Config] Invalid proxy configuration: missing ip or port`, proxy);
    return false;
  }

  return true;
}

/**
 * Get proxy identifier for logging and tracking
 */
function getProxyId(proxy) {
  if (proxy.isLocalhost) {
    return "localhost";
  }
  return `${proxy.ip}:${proxy.port}`;
}

/**
 * Export configuration getters
 */
export {
  getConcurrencyConfig,
  getProxiesConfig,
  validateProxyConfig,
  getProxyId,
};

/**
 * Configuration Examples for .env file:
 *
 * # Concurrency limits (per proxy)
 * PROXY_POST_LIMIT=2
 * PROXY_ATTACHMENT_LIMIT=4
 *
 * # Download settings
 * PROXY_DOWNLOAD_TIMEOUT=600000
 * PROXY_MAX_REDIRECTS=1
 * PROXY_SKIP_CACHE_TTL=3600
 * PROXY_MAX_RETRIES=3
 * PROXY_RETRY_BACKOFF=2
 * PROXY_RETRY_BASE_DELAY=1000
 *
 * # Proxy list (JSON array)
 * PROXY_LIST=[{"isLocalhost":true},{"ip":"proxy1.example.com","port":3128,"username":"user1","password":"pass1"}]
 */
