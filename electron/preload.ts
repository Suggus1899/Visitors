import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron,
    },
    onBackupCreated: (callback: (filePath: string) => void) => {
        ipcRenderer.on('backup-created', (_event, filePath) => callback(filePath));
    },
    removeBackupCreatedListener: () => {
        ipcRenderer.removeAllListeners('backup-created');
    },
});
