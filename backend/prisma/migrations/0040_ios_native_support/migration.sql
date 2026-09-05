-- Add first-class iPhone and iPad sessions plus APNs-backed Expo push tokens.
ALTER TYPE "MobileDevicePlatform" ADD VALUE 'IOS';
ALTER TYPE "NativePushPlatform" ADD VALUE 'IOS';
