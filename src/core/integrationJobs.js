// SPDX-License-Identifier: GPL-3.0-only
import Gio from 'gi://Gio';

// One serialized worker queue for apply/restore, shared across module reloads.
// Pending snapshots are replaced by newer ones; an in-flight transaction is
// always allowed to finish before the next apply or final restore begins.
const pending = new Map();
let running = false;
let waiters = [];
const worker = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('integrationWorker.js').get_path();

function execute(job) {
    return new Promise((resolve, reject) => {
        try {
            const process = Gio.Subprocess.new(['gjs', '-m', worker, JSON.stringify(job)],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            process.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [, output, error] = source.communicate_utf8_finish(result);
                    if (!source.get_successful())
                        throw new Error(error.trim() || output.trim() || 'Integration worker failed');
                    resolve();
                } catch (error) { reject(error); }
            });
        } catch (error) { reject(error); }
    });
}

async function drain() {
    if (running)
        return;
    running = true;
    while (pending.size) {
        const [key, entry] = pending.entries().next().value;
        pending.delete(key);
        try { await execute(entry.job); }
        catch (error) { entry.onError(error); }
    }
    running = false;
    for (const resolve of waiters.splice(0))
        resolve();
}

export function integrationJob(key, job, onError) {
    const old = pending.get(key);
    // Merge affected integrations with the newest settings snapshot. A final
    // restore must include work that an older pending apply intended to do.
    if (old)
        job.parts = [...new Set([...old.job.parts, ...job.parts])];
    pending.set(key, {job, onError});
    const settled = new Promise(resolve => waiters.push(resolve));
    void drain();
    return settled;
}

export function integrationsSettled() {
    return !running && !pending.size ? Promise.resolve() : new Promise(resolve => waiters.push(resolve));
}
