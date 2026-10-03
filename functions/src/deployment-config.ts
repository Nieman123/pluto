import projects from './deployment-projects.json';

export const productionWebConfig = {
  apiKey: 'AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE',
  appId: '1:763906028056:web:c1261eba96f8b0c792896d',
  messagingSenderId: '763906028056',
  projectId: projects.production,
  authDomain: `${projects.production}.firebaseapp.com`,
  storageBucket: `${projects.production}.appspot.com`,
  measurementId: 'G-Y6GBW8P032',
};
export type WebConfig = Omit<typeof productionWebConfig, 'measurementId'> & { measurementId?: string };

export function validateWebConfig(input: unknown, projectId: string, staging: boolean): WebConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A Firebase web configuration is required.');
  const config = input as Record<string, unknown>;
  const fields = ['apiKey', 'appId', 'messagingSenderId', 'projectId', 'authDomain', 'storageBucket', 'measurementId'];
  if (Object.keys(config).some(key => !fields.includes(key))) throw new Error('Only public Firebase web configuration fields are allowed.');
  for (const field of fields.slice(0, 6)) {
    if (typeof config[field] !== 'string' || !config[field]) throw new Error(`Missing Firebase web field: ${field}.`);
  }
  if (config.projectId !== projectId || config.authDomain !== `${projectId}.firebaseapp.com` ||
      ![`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(config.storageBucket as string) ||
      !/^\d+$/.test(config.messagingSenderId as string) ||
      !new RegExp(`^1:${config.messagingSenderId}:web:[a-f0-9]+$`).test(config.appId as string)) {
    throw new Error('Firebase app, Auth domain and Storage bucket must belong to the deployment project.');
  }
  if (staging && (projectId === projects.production || config.apiKey === productionWebConfig.apiKey ||
      config.messagingSenderId === productionWebConfig.messagingSenderId || config.measurementId)) {
    throw new Error('Staging cannot use production Firebase settings or Analytics.');
  }
  return config as WebConfig;
}

// Used by SSR, media, email links and workers. Never infer staging from the default CLI alias.
export function deploymentConfig(env: NodeJS.ProcessEnv = process.env) {
  const project = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    if (!project?.startsWith('demo-')) throw new Error('Emulators require an isolated demo project.');
    for (const host of [env.FIRESTORE_EMULATOR_HOST, env.FIREBASE_AUTH_EMULATOR_HOST, env.FIREBASE_STORAGE_EMULATOR_HOST].filter(Boolean)) {
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host!)) throw new Error('Emulators require loopback endpoints.');
    }
    const web: WebConfig = { apiKey: 'demo-preview-key', appId: '1:123:web:preview', messagingSenderId: '123',
      projectId: project, authDomain: `${project}.firebaseapp.com`, storageBucket: `${project}.appspot.com` };
    return { environment: 'emulator', web, baseUrl: env.TICKETING_BASE_URL || 'http://127.0.0.1:4173', revision: 'local' };
  }
  const environment = env.PLUTO_ENVIRONMENT || 'production';
  if (!['production', 'staging'].includes(environment)) throw new Error('Unknown deployment environment.');
  const expectedProject = environment === 'staging' ? projects.staging : projects.production;
  if (project && !project.startsWith('demo-') && project !== expectedProject) throw new Error('Runtime Firebase project does not match the deployment environment.');
  if (environment === 'staging' && (env.TICKETING_MODE !== 'test' || env.TICKETING_LIVE_READY !== 'false' || env.TICKETING_WALLETS_ENABLED === 'true')) {
    throw new Error('Staging requires sandbox payments, disabled live sales and disabled digital wallets.');
  }
  const web = env.PLUTO_FIREBASE_WEB_CONFIG ? validateWebConfig(JSON.parse(env.PLUTO_FIREBASE_WEB_CONFIG), expectedProject, environment === 'staging') :
    environment === 'production' ? productionWebConfig : (() => { throw new Error('Staging Firebase web configuration is missing.'); })();
  const baseUrl = (env.TICKETING_BASE_URL || (environment === 'staging' ? projects.stagingBaseUrl : projects.productionBaseUrl)).replace(/\/$/, '');
  const allowedBaseUrls = environment === 'staging' ? [projects.stagingBaseUrl] : [projects.productionBaseUrl];
  if (!allowedBaseUrls.includes(baseUrl)) throw new Error('Site URL does not match the deployment environment.');
  return { environment, web, baseUrl, revision: env.PLUTO_RELEASE_SHA || 'unversioned' };
}

export function storageBucket(kind: 'ticketing' | 'waiver') {
  const config = deploymentConfig();
  const explicit = process.env[kind === 'ticketing' ? 'TICKETING_STORAGE_BUCKET' : 'WAIVER_STORAGE_BUCKET'];
  if (explicit && explicit !== config.web.storageBucket) throw new Error('Storage bucket does not match the deployment project.');
  return config.web.storageBucket;
}

export function allowedSiteOrigins() {
  const config = deploymentConfig();
  const allowed = new Set([config.baseUrl, `https://${config.web.projectId}.web.app`, `https://${config.web.projectId}.firebaseapp.com`]);
  if (config.environment === 'production') allowed.add('https://www.pluto.events');
  if (config.environment === 'emulator') { allowed.add('http://127.0.0.1:4173'); allowed.add('http://localhost:4173'); }
  return allowed;
}
