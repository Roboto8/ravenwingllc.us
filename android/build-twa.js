#!/usr/bin/env node
const { TwaManifest, TwaGenerator, JdkHelper, AndroidSdkTools, GradleWrapper, KeyTool, ConsoleLog } = require('@bubblewrap/core');
const path = require('path');
const fs = require('fs');

async function build() {
  const home = process.env.USERPROFILE || process.env.HOME;
  const jdkPath = path.join(home, '.bubblewrap', 'jdk', 'jdk-17.0.11+9');
  const sdkPath = path.join(home, '.bubblewrap', 'android_sdk');
  const outputDir = path.join(__dirname, 'output');
  const log = new ConsoleLog('build-twa');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('1. Creating TWA manifest...');
  const twaManifest = new TwaManifest({
    packageId: 'com.ravenwingllc.fencecalc',
    host: 'ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com',
    name: 'FenceCalc',
    launcherName: 'FenceCalc',
    display: 'standalone',
    themeColor: '#c0622e',
    themeColorDark: '#1a1a2e',
    navigationColor: '#f5f0eb',
    navigationColorDark: '#1a1a2e',
    navigationDividerColor: '#00000000',
    navigationDividerColorDark: '#00000000',
    backgroundColor: '#f5f0eb',
    startUrl: '/',
    iconUrl: 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/icon-512.png',
    maskableIconUrl: 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/icon-512.png',
    appVersionCode: 1,
    appVersionName: '1.0.0',
    signingKey: {
      path: path.join(outputDir, 'android.keystore'),
      alias: 'fencecalc'
    },
    splashScreenFadeOutDuration: 300,
    enableNotifications: false,
    shortcuts: [],
    generatorApp: '@nicolo-ribaudo/nicolo-ribaudo',
    webManifestUrl: 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/manifest.json',
    fallbackType: 'customtabs',
    features: {},
    alphaDependencies: { enabled: false },
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    isMetaQuest: false,
    fullScopeUrl: 'http://ravenwingllc-frontend-dev.s3-website-us-east-1.amazonaws.com/',
    minSdkVersion: 19,
    orientation: 'default',
    fingerprints: []
  });

  console.log('2. Initializing JDK...');
  const config = { jdkPath: jdkPath, androidSdkPath: sdkPath };
  const jdkHelper = new JdkHelper(process, config);

  console.log('3. Initializing Android SDK...');
  const androidSdkTools = new AndroidSdkTools(process, jdkHelper, sdkPath, log);

  console.log('4. Generating TWA project...');
  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(outputDir, twaManifest);

  // Save the manifest for future builds
  fs.writeFileSync(path.join(outputDir, 'twa-manifest.json'), JSON.stringify(twaManifest, null, 2));

  console.log('5. Keystore already generated, skipping...');

  console.log('6. Building APK with Gradle...');
  const gradleWrapper = new GradleWrapper(process, androidSdkTools);
  await gradleWrapper.assembleRelease(outputDir);

  console.log('\nBuild complete!');
  const apkPath = path.join(outputDir, 'app', 'build', 'outputs', 'apk', 'release');
  if (fs.existsSync(apkPath)) {
    console.log('APK at:', apkPath);
    const files = fs.readdirSync(apkPath);
    files.forEach(f => console.log('  ', f));
  }
}

build().catch(err => {
  console.error('Build failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
