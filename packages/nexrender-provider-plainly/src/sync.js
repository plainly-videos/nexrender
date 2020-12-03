const crypto = require('crypto');
const fs  = require('fs');
const path = require('path');


class DiffActions {
    static ADDED = "ADDED";
    static DELETED = "DELETED";
    static CHANGED = "CHANGED";
}


const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');


const getRemoteHashesJson = async (templateBucket, localTemplateDir, downloadFn) => {
    const hashesFileBucket = `${templateBucket}/hashes.json`;
    const destHashesJsonPath = path.join(localTemplateDir, 'hashes-remote.json');

    await downloadFn(hashesFileBucket, destHashesJsonPath);

    return destHashesJsonPath;
}


const makeDiff = async (localHashesJsonPath, remoteHashesJsonPath) => {
    let remoteHashesJson = await fs.promises.readFile(remoteHashesJsonPath);
    let localHashesJson = Buffer.from('{}');
    try {
        localHashesJson = await fs.promises.readFile(localHashesJsonPath);
    } catch { /* first time download */ }

    const diff = {};

    // Local hash and remote hash are different, make a diff...
    if (hash(localHashesJson) !== hash(remoteHashesJson)) {
        localHashesJson = JSON.parse(localHashesJson.toString('utf-8'));
        remoteHashesJson = JSON.parse(remoteHashesJson.toString('utf-8'));

        Object.keys({...localHashesJson, ...remoteHashesJson}).forEach(path => {
            const existsLocally = localHashesJson[path];
            const existsRemotely = remoteHashesJson[path];

            if (existsLocally && existsRemotely) {
                if (existsLocally === existsRemotely) { return; }
                // File is changed
                diff[path] = DiffActions.CHANGED;
            } else {
                if (existsLocally) { // File deleted
                    diff[path] = DiffActions.DELETED;
                } else {  // File added
                    diff[path] = DiffActions.ADDED;
                }
            }
        });
    }

    await fs.promises.unlink(remoteHashesJsonPath);
    return Promise.resolve(diff);
}


const sync = async (diff, localTemplateDir, templateBucket, downloadFn, log) => {
    log('Syncing files...');
    if (!Object.keys(diff).length) {
        log('Project is synced.');
        return;
    }

    log(`--------------DIFF--------------\n${JSON.stringify(diff, null, 2)}\n--------------------------------`);

    try {
        await Promise.all(
            Object.entries(diff).map(async ([relPath, action]) => {
                const gsPath = `${templateBucket}/${relPath}`;
                const localPath = path.join(localTemplateDir, relPath);

                await fs.promises.mkdir(path.dirname(localPath), {recursive: true});

                switch(action) {
                    case DiffActions.ADDED:
                        log(`Downloading file: ${gsPath}`);
                        return await downloadFn(gsPath, localPath);
                    case DiffActions.CHANGED:
                        log(`Updating file: ${gsPath}`);
                        return await downloadFn(gsPath, localPath);
                    case DiffActions.DELETED:
                        log(`Deleting file: ${localPath}`);
                        break;
                    default:
                        log(`Unknown action: ${action}`);
                        break;
                };
            })
        );
    } catch (e) {
        // HOW TO CATCH ERROR IN DOWNLOAD???
        log(e);
    }
}


module.exports = {
    getRemoteHashesJson,
    makeDiff,
    sync,
}
