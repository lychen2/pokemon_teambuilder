import {_electron as electron} from '@playwright/test';
import {resolve} from 'node:path';

export function launchDesktop(directory: string) {
  return electron.launch({
    executablePath: process.env.POKE_EXECUTABLE,
    args: ['--ozone-platform=x11', '--force-device-scale-factor=1', ...(process.env.POKE_EXECUTABLE ? [] : [resolve('.')])],
    env: {...process.env, POKE_DATA: directory, POKE_TEST: '1'}, timeout: 20000,
  });
}
