import { defineConfig } from '@playwright/test';
import config from './playwright.expo-web.config';
export default defineConfig({ ...config, projects: config.projects?.map(project => ({ ...project, use: { ...project.use, launchOptions: { ...project.use?.launchOptions, args: ['--ignore-certificate-errors-spki-list=cBuejlcyWXiCVkReBI0hXuQs3T43jlmS33GhO3ooMjc='] } } })) });
