// Apple Developer sertifikası olmadan (ücretsiz) macOS derlemesini ad-hoc imzalar.
// Bu olmadan arm64 (M1/M2/...) Mac'lerde Gatekeeper uygulamayı "hasar görmüş" sayıp açmayı reddediyor,
// çünkü Apple Silicon her Mach-O çalıştırılabilirinin geçerli bir imzaya (ad-hoc dahil) sahip olmasını zorunlu kılıyor.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
};
