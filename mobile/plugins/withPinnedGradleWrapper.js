const fs = require('node:fs');
const path = require('node:path');
const { withFinalizedMod } = require('@expo/config-plugins');

const { pinNativeReleaseGradleWrapperProperties } = require('./nativeReleaseGradleWrapper');

const DEPENDENCY_LOCKING_MARKER = '// calibrate: strict native dependency locking';
const PHONE_DEPENDENCY_STATE_DIRECTORY = path.join('gradle', 'native-release', 'phone');
const DEPENDENCY_LOCKING_BLOCK = `${DEPENDENCY_LOCKING_MARKER}
allprojects {
  def calibrateDependencyLockName = project.path == ':'
    ? 'root'
    : project.path.substring(1).replace(':', '--')
  dependencyLocking {
    lockAllConfigurations()
    lockMode = org.gradle.api.artifacts.dsl.LockMode.STRICT
    lockFile = rootProject.file("gradle/dependency-locks/\${calibrateDependencyLockName}.lockfile")
  }
}

buildscript {
  configurations.classpath {
    resolutionStrategy.activateDependencyLocking()
  }
}
`;

function injectNativeDependencyLocking(source) {
  if (source.includes(DEPENDENCY_LOCKING_MARKER)) return source;
  return `${source.trimEnd()}\n\n${DEPENDENCY_LOCKING_BLOCK}`;
}

function restorePhoneGradleDependencyState(projectRoot, platformProjectRoot) {
  const dependencyStateTemplate = path.join(projectRoot, PHONE_DEPENDENCY_STATE_DIRECTORY);
  let templateStat;
  try {
    templateStat = fs.statSync(dependencyStateTemplate);
  } catch {
    throw new Error('Reviewed phone Gradle dependency state is missing.');
  }
  if (!templateStat.isDirectory()) {
    throw new Error('Reviewed phone Gradle dependency state is missing.');
  }
  fs.copyFileSync(
    path.join(dependencyStateTemplate, 'buildscript-gradle.lockfile'),
    path.join(platformProjectRoot, 'buildscript-gradle.lockfile')
  );
  fs.copyFileSync(
    path.join(dependencyStateTemplate, 'settings-gradle.lockfile'),
    path.join(platformProjectRoot, 'settings-gradle.lockfile')
  );
  fs.cpSync(
    path.join(dependencyStateTemplate, 'gradle'),
    path.join(platformProjectRoot, 'gradle'),
    { recursive: true, force: true }
  );
}

const withPinnedGradleWrapper = (config) => withFinalizedMod(config, ['android', async (modConfig) => {
  const repositoryRoot = path.dirname(modConfig.modRequest.projectRoot);
  const wrapperProperties = path.join(
    modConfig.modRequest.platformProjectRoot,
    'gradle',
    'wrapper',
    'gradle-wrapper.properties'
  );
  const source = fs.readFileSync(wrapperProperties, 'utf8');
  fs.writeFileSync(wrapperProperties, pinNativeReleaseGradleWrapperProperties(source));
  fs.copyFileSync(
    path.join(repositoryRoot, 'wear', 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    path.join(modConfig.modRequest.platformProjectRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar')
  );

  const rootBuildGradle = path.join(modConfig.modRequest.platformProjectRoot, 'build.gradle');
  fs.writeFileSync(
    rootBuildGradle,
    injectNativeDependencyLocking(fs.readFileSync(rootBuildGradle, 'utf8'))
  );
  restorePhoneGradleDependencyState(
    modConfig.modRequest.projectRoot,
    modConfig.modRequest.platformProjectRoot
  );
  return modConfig;
}]);

module.exports = withPinnedGradleWrapper;
module.exports.injectNativeDependencyLocking = injectNativeDependencyLocking;
module.exports.restorePhoneGradleDependencyState = restorePhoneGradleDependencyState;
