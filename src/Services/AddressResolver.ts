import { isIP } from "node:net";

// 12 hex digits, optionally separated by ':' or '-' (Loxone serial numbers are usually unseparated)
const MAC_ADDRESS_PATTERN = /^(?:[0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const REMOTE_CONNECT_LOOKUP_URL = "https://connect.loxonecloud.com/getip";
const REMOTE_CONNECT_STATUS_MESSAGES: Record<number, string> = {
  400: "Invalid serial format or missing serial number",
  404: "Serial not found or no working relay available",
  500: "Remote Connect internal server error",
  504: "Miniserver is configured but not connected to a Loxone relay",
};

type AddressType = "mac" | "ip" | "url" | "hostname";

/**
 * Determines how the configured address should be interpreted.
 * @param {string} address The configured Miniserver address
 * @returns {AddressType} The detected address type
 */
function classifyAddress(address: string): AddressType {
  const trimmedAddress = address.trim();
  if (URL_SCHEME_PATTERN.test(trimmedAddress)) return "url";
  if (MAC_ADDRESS_PATTERN.test(trimmedAddress)) return "mac";
  if (isIP(trimmedAddress) !== 0) return "ip";
  return "hostname";
}

/**
 * Normalizes a MAC address / Miniserver serial number to uppercase hex without separators.
 * @param {string} macAddress The MAC address to normalize
 * @returns {string} The normalized MAC address
 */
function normalizeMacAddress(macAddress: string): string {
  return macAddress.trim().replaceAll(/[:-]/g, "").toUpperCase();
}

/**
 * Resolves a Miniserver serial number (MAC address) to a publicly reachable URL using Loxone Remote Connect.
 * @param {string} macAddress The Miniserver serial number / MAC address
 * @returns {Promise<URL>} The base URL to use for the Miniserver
 */
async function resolveRemoteConnectUrl(macAddress: string): Promise<URL> {
  const serialNumber = normalizeMacAddress(macAddress);
  const lookupUrl = new URL(REMOTE_CONNECT_LOOKUP_URL);
  lookupUrl.searchParams.set("snr", serialNumber);

  let response: Response;
  try {
    response = await fetch(lookupUrl);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Remote Connect lookup for serial '${serialNumber}' failed: ${reason}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    const reason = REMOTE_CONNECT_STATUS_MESSAGES[response.status] ?? "Unexpected response";
    throw new Error(
      `Remote Connect lookup for serial '${serialNumber}' failed: ${reason} (${response.status})`,
    );
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("url" in payload) ||
    typeof payload.url !== "string"
  ) {
    throw new Error(
      `Remote Connect lookup for serial '${serialNumber}' returned an unexpected response`,
    );
  }

  const resolvedUrl = URL.parse(payload.url);
  if (!resolvedUrl || (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:")) {
    throw new Error(
      `Remote Connect lookup for serial '${serialNumber}' returned an invalid url '${payload.url}'`,
    );
  }

  return resolvedUrl;
}

/**
 * Resolves the configured address into an http(s) base URL.
 * MAC addresses are resolved via Remote Connect, IPs and hostnames default to http, URLs are used as-is.
 * @param {string} address The configured Miniserver address
 * @returns {Promise<URL>} The resolved base URL
 */
async function resolveBaseUrl(address: string): Promise<URL> {
  const trimmedAddress = address.trim().replace(/\/+$/, ""); // remove trailing slashes
  if (trimmedAddress === "") {
    throw new Error("Address must not be empty");
  }

  const addressType = classifyAddress(trimmedAddress);

  switch (addressType) {
    case "ip":
    case "hostname":
      return new URL(`http://${trimmedAddress}`);
    case "url":
      return new URL(trimmedAddress);
    case "mac":
      return resolveRemoteConnectUrl(trimmedAddress);
    default:
      throw new Error(`Unsupported address type'`);
  }
}

export { classifyAddress, normalizeMacAddress, resolveBaseUrl, resolveRemoteConnectUrl };
export type { AddressType };
