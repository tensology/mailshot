import dns from 'dns/promises';
import net from 'net';
import { URL } from 'url';

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata'
]);

const isPrivateIp = (ip = '') => {
    const value = String(ip || '').trim().toLowerCase();
    if (!value) {
        return true;
    }

    if (value === '::1' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) {
        return true;
    }

    if (net.isIPv4(value)) {
        const parts = value.split('.').map(Number);
        const [a, b] = parts;
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }

    return false;
};

/**
 * Ensure URL is https and does not resolve to private/link-local addresses.
 */
export const assertSafeExternalUrl = async (rawUrl = '', { allowHosts = [] } = {}) => {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('Invalid URL');
    }

    if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
    }

    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error('Host is not allowed');
    }

    if (allowHosts.length && !allowHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        // allowHosts empty = any public HTTPS host after DNS check
    }

    if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) {
            throw new Error('Private IP addresses are not allowed');
        }
        return parsed.toString().replace(/\/$/, '');
    }

    const records = await dns.lookup(hostname, { all: true });
    if (!records.length || records.some((record) => isPrivateIp(record.address))) {
        throw new Error('Host resolves to a private or blocked address');
    }

    return parsed.toString().replace(/\/$/, '');
};
