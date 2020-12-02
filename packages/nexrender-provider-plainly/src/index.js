const fs  = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const gsProvider = require('@nexrender/provider-gs')

const PLAINLY_PROTOCOL = 'plainly:'
const PLAINLY_CACHE_DIR_ENV = 'PLAINLY_CACHE_DIR'
const PLAINLY_CACHE_DIR_DEFAULT = path.join(os.homedir(), '.plainly')


class DiffActions {
  static ADDED = "ADDED";
  static DELETED = "DELETED";
  static CHANGED = "CHANGED";
}


const hash = (bytes) => {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}


const getCacheDir = async () => {
    const cacheDir = process.env[PLAINLY_CACHE_DIR_ENV] || PLAINLY_CACHE_DIR_DEFAULT;
    await fs.promises.mkdir(cacheDir, {recursive: true});

    return cacheDir;
}


const getTemplateDir = async (templateBucket) => {
    const cacheDir = await getCacheDir();
    const projectPathAbs = path.join(cacheDir, templateBucket);
    await fs.promises.mkdir(projectPathAbs, {recursive: true});

    return projectPathAbs;
}


const getRemoteHashesJson = async (job, settings, templateBucket, localTemplateDir, params, type) => {
    const hashesFileBucket = `${templateBucket}/hashes.json`;
    const destHashesJson = path.join(localTemplateDir, 'hashes-remote.json');

    await gsProvider.download(job, settings, hashesFileBucket, destHashesJson, params, type);

    return destHashesJson;
}


const makeActions = async (localHashesJsonPath, remoteHashesJsonPath) => {
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
        if (existsLocally) {
          diff[path] = DiffActions.DELETED;
        } else {
          diff[path] = DiffActions.ADDED;
        }
      }
    });
  }

  await fs.promises.unlink(remoteHashesJsonPath);
  return Promise.resolve(diff);
}


const sync = async (templateBucket, dest) => {
   // TODO: Go through diff and execute actions...

}


const download = async (job, settings, src, dest, params, type) => {
    const gsSrc = src.replace(`${PLAINLY_PROTOCOL}//`, '');
    const templateRootDir = path.dirname(gsSrc);
    const localTemplateDir = await getTemplateDir(templateRootDir);

    const templateBucket = `gs://${templateRootDir}`;

    const remoteHashesJsonPath = await getRemoteHashesJson(job, settings, templateBucket, localTemplateDir, params, type);
    const localHashesJsonPath = path.join(localTemplateDir, 'hashes.json');

    const diff = await makeDiff(localHashesJsonPath, remoteHashesJsonPath);

    // TODO: sync

    // TODO: Fix paths inside aep, aepx
}


const upload = (job, settings, src, params) => {
    return Promise.reject(new Error('Plainly provider does not have an upload action...'))
}


module.exports = {
    download,
    upload,
}
