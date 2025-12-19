import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Normalize a hex color string to #RRGGBB or return null when invalid.
 */
function normalizeHexColor(value) {
    const trimmed = value.trim();
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return `#${hex.toLowerCase()}`;
}

/**
 * Parse a #RRGGBB hex color into RGB components.
 */
function parseHexColor(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    const raw = normalized.slice(1);
    return {
        r: Number.parseInt(raw.slice(0, 2), 16),
        g: Number.parseInt(raw.slice(2, 4), 16),
        b: Number.parseInt(raw.slice(4, 6), 16)
    };
}

/**
 * Format an RGB color as #RRGGBB.
 */
function formatHexColor({ r, g, b }) {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

/**
 * Lighten a #RRGGBB color by the given ratio (0-1).
 */
function lightenHexColor(hex, ratio) {
    const color = parseHexColor(hex);
    if (!color) return null;
    return formatHexColor({
        r: Math.round(color.r + (255 - color.r) * ratio),
        g: Math.round(color.g + (255 - color.g) * ratio),
        b: Math.round(color.b + (255 - color.b) * ratio)
    });
}

/**
 * Apply an alpha channel to a #RRGGBB color and return #RRGGBBAA.
 */
function applyAlpha(hex, alpha) {
    const color = parseHexColor(hex);
    if (!color) return null;
    const alphaByte = clampByte(Math.round(alpha * 255));
    return `${formatHexColor(color)}${toHexByte(alphaByte)}`;
}

/**
 * Estimate relative luminance for an RGB color in 0-1.
 */
function relativeLuminance({ r, g, b }) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Pick a readable foreground color for a background.
 */
function pickForegroundColor(hex) {
    const color = parseHexColor(hex);
    if (!color) return '#e7e7e7';
    return relativeLuminance(color) > 0.6 ? '#15202b' : '#e7e7e7';
}

/**
 * Clamp a number to the 0-255 byte range.
 */
function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

/**
 * Convert a number in the 0-255 range to a two-digit hex byte.
 */
function toHexByte(value) {
    return clampByte(value).toString(16).padStart(2, '0');
}

/**
 * Read VS Code settings JSON, returning an empty object if missing.
 */
async function readSettings(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

/**
 * Write VS Code settings JSON with stable formatting.
 */
async function writeSettings(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = `${JSON.stringify(data, null, 4)}\n`;
    await fs.writeFile(filePath, content, 'utf8');
}

const workspaceRoot = process.cwd();
const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');

const rawColor = process.env.WORKTREE_COLOR ?? '';
const baseColor = normalizeHexColor(rawColor);

if (!baseColor) {
    process.exit(0);
}

const activeBackground = lightenHexColor(baseColor, 0.2) ?? baseColor;
const activeForeground = pickForegroundColor(activeBackground);
const inactiveForeground = applyAlpha(activeForeground, 0.6) ?? activeForeground;
const baseForeground = pickForegroundColor(baseColor);
const baseInactiveForeground = applyAlpha(baseForeground, 0.6) ?? baseForeground;
const baseInactiveBackground = applyAlpha(baseColor, 0.6) ?? baseColor;

const colorCustomizations = {
    'activityBar.activeBackground': activeBackground,
    'activityBar.background': activeBackground,
    'activityBar.foreground': activeForeground,
    'activityBar.inactiveForeground': inactiveForeground,
    'activityBarBadge.background': '#bf0060',
    'activityBarBadge.foreground': '#e7e7e7',
    'commandCenter.border': applyAlpha(baseForeground, 0.6) ?? baseForeground,
    'sash.hoverBorder': activeBackground,
    'statusBar.background': baseColor,
    'statusBar.foreground': baseForeground,
    'statusBarItem.hoverBackground': activeBackground,
    'statusBarItem.remoteBackground': baseColor,
    'statusBarItem.remoteForeground': baseForeground,
    'titleBar.activeBackground': baseColor,
    'titleBar.activeForeground': baseForeground,
    'titleBar.inactiveBackground': baseInactiveBackground,
    'titleBar.inactiveForeground': baseInactiveForeground
};

const settings = await readSettings(settingsPath);
const existingCustomizations = settings['workbench.colorCustomizations'];
const mergedCustomizations = {
    ...(existingCustomizations && typeof existingCustomizations === 'object' ? existingCustomizations : {}),
    ...colorCustomizations
};

const nextSettings = {
    ...settings,
    'peacock.color': baseColor,
    'peacock.remoteColor': baseColor,
    'workbench.colorCustomizations': mergedCustomizations
};

await writeSettings(settingsPath, nextSettings);
