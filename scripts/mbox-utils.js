import { createReadStream } from 'fs';
import readline from 'readline';

const isMboxDelimiter = (line = '') => /^From \S/.test(line);

/**
 * Stream-parse an mbox file one message at a time.
 */
export async function* iterateMboxMessages(mboxFilePath) {
    const stream = createReadStream(mboxFilePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lines = [];

    for await (const line of rl) {
        if (isMboxDelimiter(line) && lines.length > 0) {
            yield lines.join('\n');
            lines = [line];
        } else {
            lines.push(line);
        }
    }

    if (lines.length > 0) {
        yield lines.join('\n');
    }
}

export const stripMboxDelimiter = (rawBlock = '') => {
    const lines = rawBlock.split('\n');
    if (lines.length > 0 && isMboxDelimiter(lines[0])) {
        return lines.slice(1).join('\n');
    }
    return rawBlock;
};

export const parseGmailLabels = (parsed) => {
    const header = parsed.headers.get('x-gmail-labels');
    if (!header) {
        return [];
    }

    return String(header).split(',').map((label) => label.trim()).filter(Boolean);
};

export const isStarredFromGmailLabels = (gmailLabels = []) => gmailLabels.includes('Starred');
