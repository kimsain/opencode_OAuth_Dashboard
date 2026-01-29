const fs = require("fs");
const os = require("os");
const path = require("path");

const isWindows = process.platform === "win32";

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

const candidateOpencodeDataDirs = () => {
  const dirs = [];

  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    dirs.push(path.join(xdgData, "opencode"));
  }

  // OpenCode itself commonly uses XDG-style paths on Windows too.
  dirs.push(path.join(os.homedir(), ".local", "share", "opencode"));

  if (isWindows) {
    const roaming = process.env.APPDATA;
    if (roaming) {
      dirs.push(path.join(roaming, "opencode"));
    }

    const local = process.env.LOCALAPPDATA;
    if (local) {
      dirs.push(path.join(local, "opencode"));
    }

    dirs.push(path.join(os.homedir(), "AppData", "Roaming", "opencode"));
    dirs.push(path.join(os.homedir(), "AppData", "Local", "opencode"));
  }

  return uniq(dirs);
};

const resolveOpencodeDataDir = () => {
  return candidateOpencodeDataDirs()[0];
};

const resolveOpencodeConfigDir = () => {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "opencode");
  }
  return path.join(os.homedir(), ".config", "opencode");
};

const resolveWindowsAppDataDir = () => {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  return path.join(appData, "opencode");
};

const resolveAuthPath = () => {
  const candidates = candidateOpencodeDataDirs().map((dir) => path.join(dir, "auth.json"));
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing) return existing;
  // Default to the most common OpenCode location.
  return path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
};

const resolveAntigravityAccountsPath = () => {
  const candidates = [];
  const configDir = resolveOpencodeConfigDir();
  candidates.push(path.join(configDir, "antigravity-accounts.json"));

  const dataDir = resolveOpencodeDataDir();
  const dataCandidate = path.join(dataDir, "antigravity-accounts.json");
  if (!candidates.includes(dataCandidate)) {
    candidates.push(dataCandidate);
  }

  if (isWindows) {
    const windowsDir = resolveWindowsAppDataDir();
    if (windowsDir) {
      const windowsCandidate = path.join(windowsDir, "antigravity-accounts.json");
      if (!candidates.includes(windowsCandidate)) {
        candidates.push(windowsCandidate);
      }
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const resolveOhMyOpencodePath = () => {
  const candidates = [];
  const configDir = resolveOpencodeConfigDir();
  candidates.push(path.join(configDir, "oh-my-opencode.json"));

  if (isWindows) {
    const windowsDir = resolveWindowsAppDataDir();
    if (windowsDir) {
      candidates.push(path.join(windowsDir, "oh-my-opencode.json"));
    }
  }

  const dataDir = resolveOpencodeDataDir();
  candidates.push(path.join(dataDir, "oh-my-opencode.json"));

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

module.exports = {
  resolveAuthPath,
  resolveAntigravityAccountsPath,
  resolveOhMyOpencodePath
};
