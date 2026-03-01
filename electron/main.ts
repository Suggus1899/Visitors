import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain } from 'electron';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const SERVER_PORT = 3000;
const isDev = !app.isPackaged;

// ============================================
// HELPERS (Lazy Loading)
// ============================================
function getFs() {
    return require('fs');
}

function getDbPath(): string {
    return isDev
        ? path.join(__dirname, '../server/visits.sqlite')
        : path.join(app.getPath('userData'), 'visits.sqlite');
}

// ============================================
// AUTO-UPDATER CONFIGURATION
// ============================================
function configureAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización Disponible',
            message: `Una nueva versión (${info.version}) está disponible. ¿Desea descargarla ahora?`,
            buttons: ['Sí', 'No']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización Lista',
            message: 'La actualización ha sido descargada. Se instalará al reiniciar la aplicación.',
            buttons: ['Reiniciar Ahora', 'Más Tarde']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('Auto-Updater Error:', err);
    });
}

// ============================================
// BACKUP & RESTORE
// ============================================
async function createBackup() {
    const fs = getFs();
    const dbPath = getDbPath();

    if (!fs.existsSync(dbPath)) {
        dialog.showErrorBox('Error', 'No se encontró la base de datos para respaldar.');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultPath = path.join(app.getPath('documents'), `VisitorBackup_${timestamp}.sqlite`);

    const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Guardar Backup',
        defaultPath,
        filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }]
    });

    if (!result.canceled && result.filePath) {
        try {
            fs.copyFileSync(dbPath, result.filePath);
            dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: 'Backup Exitoso',
                message: `Backup guardado en:\n${result.filePath}`
            });
        } catch (err) {
            dialog.showErrorBox('Error', `No se pudo crear el backup: ${err}`);
        }
    }
}

async function restoreBackup() {
    const fs = getFs();
    const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Seleccionar Backup para Restaurar',
        filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const backupPath = result.filePaths[0];
        const dbPath = getDbPath();

        const confirm = await dialog.showMessageBox(mainWindow!, {
            type: 'warning',
            title: 'Confirmar Restauración',
            message: '¿Está seguro de restaurar este backup?',
            detail: 'Esto reemplazará todos los datos actuales con los del backup seleccionado.',
            buttons: ['Restaurar', 'Cancelar']
        });

        if (confirm.response === 0) {
            try {
                // Create a backup of current before restoring
                const currentBackup = dbPath + '.before-restore';
                if (fs.existsSync(dbPath)) {
                    fs.copyFileSync(dbPath, currentBackup);
                }
                fs.copyFileSync(backupPath, dbPath);

                dialog.showMessageBox(mainWindow!, {
                    type: 'info',
                    title: 'Restauración Exitosa',
                    message: 'El backup ha sido restaurado correctamente.',
                    detail: 'Reinicie la aplicación para ver los cambios.'
                });
            } catch (err) {
                dialog.showErrorBox('Error', `No se pudo restaurar el backup: ${err}`);
            }
        }
    }
}

// ============================================
// NATIVE MENU
// ============================================
function createMenu() {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Crear Backup',
                    accelerator: 'CmdOrCtrl+B',
                    click: createBackup
                },
                {
                    label: 'Restaurar Backup',
                    click: restoreBackup
                },
                { type: 'separator' },
                { role: 'quit', label: 'Salir' }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { role: 'reload', label: 'Recargar' },
                { role: 'forceReload', label: 'Forzar Recarga' },
                { type: 'separator' },
                ...(isDev ? [{ role: 'toggleDevTools' as const, label: 'Herramientas de Desarrollo' }] : []),
                { type: 'separator' as const },
                { role: 'resetZoom' as const, label: 'Zoom Normal' },
                { role: 'zoomIn' as const, label: 'Acercar' },
                { role: 'zoomOut' as const, label: 'Alejar' },
                { type: 'separator' as const },
                { role: 'togglefullscreen' as const, label: 'Pantalla Completa' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de',
                    click: () => {
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Acerca de Visitor System',
                            message: 'Visitor Access Control System',
                            detail: `Versión: ${app.getVersion()}\n© 2026 Galletas Puig`
                        });
                    }
                },
                ...(isDev ? [] : [{
                    label: 'Buscar Actualizaciones',
                    click: () => {
                        autoUpdater.checkForUpdates();
                    }
                }])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ============================================
// SYSTEM TRAY
// ============================================
function createTray() {
    const iconPath = path.join(__dirname, '../client/public/logo.png');
    // Lazy load fs to check if icon exists, just in case, though nativeImage handles it gracefully usually
    const fs = getFs();
    if (!fs.existsSync(iconPath)) {
        console.warn('Tray icon not found at:', iconPath);
        return;
    }

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir Visitor System', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Salir', click: () => app.quit() }
    ]);

    tray.setToolTip('Visitor Access Control System');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow?.show();
    });
}

// ============================================
// MAIN WINDOW
// ============================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        title: 'Visitor Access Control System',
        icon: path.join(__dirname, '../client/public/logo.png'),
        show: false // Show after ready
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:5173`);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
    }

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (tray && !isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startServer() {
    if (serverProcess) return;

    if (!app.isPackaged) {
        console.log('Running in dev mode. Assuming server is started externally.');
        return;
    }

    const scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'server.js');
    console.log('Starting server from:', scriptPath);

    try {
        serverProcess = fork(scriptPath, [], {
            env: { 
                ...process.env, 
                NODE_ENV: 'production',
                PORT: SERVER_PORT.toString(), 
                DB_PATH: path.join(app.getPath('userData'), 'database'),
                DB_ENCRYPTION_KEY: 'e44719f04d5a961af39f640854d985396e8178daf4c9300fdbca6848840eeb52',
                ENCRYPTION_KEY: '301f7eae998b3bcddc49173a819699ef521b2bc7402da2d70f52a078b9b30d36',
                JWT_SECRET: '42f2934ddb4d4ab6f4fed97053a35143bc6406204c28857b12ae5eea6ede23bd7b6227c19e6ceb120a4f2bc938b52f66edd9ac1497fbb38379799470b7d11eb1',
                BACKUP_PASSWORD: '2333815119ad6a3b50ba48bd394f5e77e20557482815631c85c442af5572469d'
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        serverProcess.stdout?.on('data', (data) => {
            console.log(`[SERVER]: ${data}`);
        });

        serverProcess.stderr?.on('data', (data) => {
            console.error(`[SERVER ERROR]: ${data}`);
            if (data.toString().toLowerCase().includes('error:') && !data.toString().includes('DeprecationWarning')) {
                dialog.showErrorBox('Error del Servidor Backend', data.toString());
            }
        });

        serverProcess.on('error', (err) => {
            dialog.showErrorBox('Error fatal al iniciar servidor', err.message || String(err));
        });

        serverProcess.on('exit', (code) => {
            console.log(`Server child process exited with code ${code}`);
            if (code !== 0) {
                 dialog.showErrorBox('Servidor Detenido', `El servidor local de base de datos se detuvo con código ${code}`);
            }
            serverProcess = null;
        });
    } catch (e: any) {
        dialog.showErrorBox('Excepción al lanzar servidor', e.message || String(e));
    }
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}

// ============================================
// APP LIFECYCLE
// ============================================

app.whenReady().then(() => {
    configureAutoUpdater(); // Initialize auto-updater
    createMenu();
    try {
        createTray();
    } catch (e) {
        console.error("Error creating tray:", e);
    }

    if (app.isPackaged) {
        startServer();
        autoUpdater.checkForUpdatesAndNotify();
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopServer();
        app.quit();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    stopServer();
});

