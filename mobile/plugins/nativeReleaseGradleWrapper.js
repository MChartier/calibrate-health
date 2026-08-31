const NATIVE_RELEASE_GRADLE_VERSION = '8.14.3';
const NATIVE_RELEASE_GRADLE_DISTRIBUTION_URL =
  `https://services.gradle.org/distributions/gradle-${NATIVE_RELEASE_GRADLE_VERSION}-bin.zip`;
// Reviewed official checksums:
// https://services.gradle.org/distributions/gradle-8.14.3-bin.zip.sha256
// https://services.gradle.org/distributions/gradle-8.14.3-wrapper.jar.sha256
const NATIVE_RELEASE_GRADLE_DISTRIBUTION_SHA256 =
  'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531';
const NATIVE_RELEASE_GRADLE_WRAPPER_JAR_SHA256 =
  '7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172';

const DISTRIBUTION_URL_PROPERTY = NATIVE_RELEASE_GRADLE_DISTRIBUTION_URL.replace(':', '\\:');

function propertyIndexes(lines, name) {
  const pattern = new RegExp(`^\\s*${name}\\s*=`);
  return lines.flatMap((line, index) => pattern.test(line) ? [index] : []);
}

/** Pin the generated Expo wrapper after prebuild has written the Android project. */
function pinNativeReleaseGradleWrapperProperties(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = /\r?\n$/.test(source);
  const lines = source.split(/\r?\n/);
  if (hasTrailingNewline) lines.pop();

  const distributionUrlIndexes = propertyIndexes(lines, 'distributionUrl');
  if (distributionUrlIndexes.length !== 1) {
    throw new Error('Expo Android prebuild must generate exactly one Gradle distributionUrl property.');
  }
  const checksumIndexes = propertyIndexes(lines, 'distributionSha256Sum');
  if (checksumIndexes.length > 1) {
    throw new Error('Expo Android prebuild generated duplicate Gradle distributionSha256Sum properties.');
  }

  const distributionUrlIndex = distributionUrlIndexes[0];
  lines[distributionUrlIndex] = `distributionUrl=${DISTRIBUTION_URL_PROPERTY}`;
  if (checksumIndexes.length === 1) {
    lines[checksumIndexes[0]] = `distributionSha256Sum=${NATIVE_RELEASE_GRADLE_DISTRIBUTION_SHA256}`;
  } else {
    lines.splice(
      distributionUrlIndex + 1,
      0,
      `distributionSha256Sum=${NATIVE_RELEASE_GRADLE_DISTRIBUTION_SHA256}`
    );
  }

  return `${lines.join(newline)}${hasTrailingNewline ? newline : ''}`;
}

module.exports = {
  DISTRIBUTION_URL_PROPERTY,
  NATIVE_RELEASE_GRADLE_DISTRIBUTION_SHA256,
  NATIVE_RELEASE_GRADLE_DISTRIBUTION_URL,
  NATIVE_RELEASE_GRADLE_VERSION,
  NATIVE_RELEASE_GRADLE_WRAPPER_JAR_SHA256,
  pinNativeReleaseGradleWrapperProperties
};
