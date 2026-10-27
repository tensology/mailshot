import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
    listThreads,
    createThread,
    getThread,
    deleteThread,
    listMessages,
    addMessage
} from '../services/dev-agent-store.js';
import { runAgent, commitAndDeploy, diffSummary, isRunning, currentRun, uploadsDir, discardChanges } from '../services/dev-agent-runner.js';
import { broadcast } from '../services/dev-agent-ws.js';
import { getSettings, updateSettingsSection } from '../services/settings-store.js';
import { getActiveAccount } from '../services/account-context.js';

const isEnabled = async () => {
    const settings = await getSettings();
    return Boolean(settings.dev_agent?.enabled);
};

const requireEnabled = async (request, response) => {
    if (!(await isEnabled())) {
        response.status(403).json('The dev agent is switched off for this mailbox');
        return false;
    }
    return true;
};

// Any file the user drags in is written to the thread's uploads folder and handed
// to the agent as a pi @file reference (it can OCR / parse with bash + tools).
const storeAttachments = (threadId, files = []) => {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) {
        return [];
    }
    const dir = uploadsDir(threadId);
    fs.mkdirSync(dir, { recursive: true });
    return list.map((file) => {
        const safe = String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
        const target = path.join(dir, `${randomUUID().slice(0, 8)}-${safe}`);
        fs.writeFileSync(target, file.buffer);
        return target;
    });
};

export const getDevSettings = async (request, response) => {
    const settings = await getSettings();
    return response.status(200).json({
        capable: Boolean(getActiveAccount()?.dev_agent_capable),
        enabled: Boolean(settings.dev_agent?.enabled),
        auto_deploy: Boolean(settings.dev_agent?.auto_deploy),
        running: isRunning(),
        running_thread_id: currentRun()?.threadId || ''
    });
};

export const updateDevSettings = async (request, response) => {
    const updates = {};
    if (request.body?.enabled !== undefined) {
        updates.enabled = Boolean(request.body.enabled);
    }
    if (request.body?.auto_deploy !== undefined) {
        updates.auto_deploy = Boolean(request.body.auto_deploy);
    }
    const settings = await updateSettingsSection('dev_agent', updates);
    return response.status(200).json({
        enabled: Boolean(settings.dev_agent?.enabled),
        auto_deploy: Boolean(settings.dev_agent?.auto_deploy),
        running: isRunning()
    });
};

export const getDevThreads = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    try {
        return response.status(200).json(await listThreads());
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const postDevThread = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    try {
        return response.status(201).json(await createThread({ title: request.body?.title }));
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const deleteDevThread = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    await deleteThread(request.params.id);
    return response.status(200).json({ ok: true });
};

export const getDevMessages = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    try {
        return response.status(200).json(await listMessages(request.params.id));
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const postDevPrompt = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;

    const threadId = String(request.params.id || '');
    const prompt = String(request.body?.prompt || '').trim();
    if (!prompt) {
        return response.status(400).json('A prompt is required');
    }
    if (isRunning()) {
        return response.status(409).json('Another dev-agent run is already in progress');
    }

    const thread = await getThread(threadId);
    if (!thread) {
        return response.status(404).json('Thread not found');
    }

    const attachments = storeAttachments(threadId, request.files || []);
    const userMessage = await addMessage({
        threadId,
        role: 'user',
        content: prompt,
        meta: { attachments: attachments.map((filePath) => path.basename(filePath)) }
    });
    broadcast(threadId, { type: 'message', message: userMessage });

    // Kick off the run in the background; stream everything over the WebSocket.
    runAgent({ threadId, prompt, attachments, onEvent: (event) => broadcast(threadId, { type: 'agent', event }) })
        .then(async (result) => {
            const assistantMessage = await addMessage({
                threadId,
                role: 'assistant',
                content: result.text || (result.ok ? '(done)' : '(no output)'),
                meta: { ok: result.ok, code: result.code }
            });
            broadcast(threadId, { type: 'message', message: assistantMessage });
            broadcast(threadId, { type: 'diff', ...(await diffSummary()) });

            const settings = await getSettings();
            if (settings.dev_agent?.auto_deploy) {
                const deploy = await commitAndDeploy({ threadId, message: prompt.slice(0, 80) });
                broadcast(threadId, { type: 'deploy', ...deploy });
            } else {
                broadcast(threadId, { type: 'ready_to_deploy' });
            }
        })
        .catch(async (error) => {
            broadcast(threadId, { type: 'error', message: error.message });
        });

    return response.status(202).json({ ok: true, thread_id: threadId });
};

export const postDevApply = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    try {
        const result = await commitAndDeploy({
            threadId: request.params.id,
            message: String(request.body?.message || '').slice(0, 100)
        });
        broadcast(request.params.id, { type: 'deploy', ...result });
        return response.status(200).json(result);
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const getDevDiff = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    return response.status(200).json(await diffSummary());
};

export const postDevDiscard = async (request, response) => {
    if (!(await requireEnabled(request, response))) return;
    const result = await discardChanges();
    broadcast(request.params.id, { type: 'diff', ...result });
    return response.status(200).json(result);
};
