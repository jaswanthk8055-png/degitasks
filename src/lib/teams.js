import * as microsoftTeams from '@microsoft/teams-js';

let initialized = false;

export const initializeTeams = async () => {
  try {
    await microsoftTeams.app.initialize();
    initialized = true;
    return true;
  } catch {
    return false;
  }
};

export const isInTeams = () => initialized;

export const notifyTeamsAppLoaded = () => {
  if (initialized) {
    microsoftTeams.app.notifyAppLoaded();
    microsoftTeams.app.notifySuccess();
  }
};

export const getTeamsTheme = async () => {
  if (!initialized) return 'default';
  const ctx = await microsoftTeams.app.getContext();
  return ctx.app.theme;
};
