import { app, BrowserWindow, Menu, Tray, nativeImage, dialog } from 'electron';
import path from 'path';
import { fork, ChildProcess, execSync } from 'child_process';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';

// ============================================
// MINIMAL ELECTRON LOGGER
// ============================================
const createElectronLogger = () => {
    const getLogDir = () => app.isReady()
        ? path.join(app.getPath('userData'), 'logs')
        : path.join(__dirname, '../logs');

    const write = (level: string, ...args: unknown[]) => {
        const timestamp = new Date().toISOString();
        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const line = `${timestamp} [${level.toUpperCase()}] [electron] ${message}\n`;

        // Always write to stderr/stdout so dev console shows it
        if (level === 'error') process.stderr.write(line);
        else process.stdout.write(line);

        // Also persist to file when app is ready
        try {
            const logDir = getLogDir();
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            const logFile = path.join(logDir, `electron-${new Date().toISOString().split('T')[0]}.log`);
            fs.appendFileSync(logFile, line);
        } catch { /* ignore write errors */ }
    };

    return {
        info:  (...args: unknown[]) => write('info', ...args),
        warn:  (...args: unknown[]) => write('warn', ...args),
        error: (...args: unknown[]) => write('error', ...args),
        debug: (...args: unknown[]) => write('debug', ...args),
    };
};

const logger = createElectronLogger();

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
const ALLOWED_RENDERER_ORIGINS = ['http://localhost:5173', 'file://'];

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
        logger.error('Auto-Updater Error:', err);
    });
}

// ============================================
// BACKUP & RESTORE
// ============================================
async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const defaultPath = path.join(app.getPath('documents'), `LogMasterBackup_${timestamp}.dump`);

    const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Guardar Backup',
        defaultPath,
        filters: [{ name: 'PostgreSQL Backup', extensions: ['dump'] }]
    });

    if (!result.canceled && result.filePath) {
        try {
            execSync(`pg_dump -U postgres -h localhost -Fc visitors > "${result.filePath}"`);
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
    const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Seleccionar Backup para Restaurar',
        filters: [{ name: 'PostgreSQL Backup', extensions: ['dump'] }],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const backupPath = result.filePaths[0];

        const confirm = await dialog.showMessageBox(mainWindow!, {
            type: 'warning',
            title: 'Confirmar Restauración',
            message: '¿Está seguro de restaurar este backup?',
            detail: 'Esto reemplazará todos los datos actuales con los del backup seleccionado.',
            buttons: ['Restaurar', 'Cancelar']
        });

        if (confirm.response === 0) {
            try {
                execSync(`pg_restore -U postgres -h localhost -d visitors -c "${backupPath}"`);
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
                            title: 'Acerca de LogMaster',
                            message: 'LogMaster - Sistema de Control de Acceso',
                            detail: `Versión: ${app.getVersion()}\n© 2026 LogMaster`
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
    if (!fs.existsSync(iconPath)) {
        logger.warn('Tray icon not found at:', iconPath);
        return;
    }

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir LogMaster', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Salir', click: () => app.quit() }
    ]);

    tray.setToolTip('LogMaster - Sistema de Control de Acceso');
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
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        title: 'LogMaster',
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

    // Prevent untrusted navigation/popups in renderer context.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const isAllowed = ALLOWED_RENDERER_ORIGINS.some((origin) => url.startsWith(origin));
        if (!isAllowed) {
            event.preventDefault();
        }
    });

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
        logger.debug('Running in dev mode. Assuming server is started externally.');
        return;
    }

    const serverDistPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist');
    const serverNodeModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules');
    const scriptPath = path.join(serverDistPath, 'server.js');
    logger.info('Starting server from:', scriptPath);

    try {
        const requiredEnvKeys = ['PII_ENCRYPTION_KEY', 'ENCRYPTION_KEY', 'JWT_SECRET', 'BACKUP_PASSWORD'];
        const missing = requiredEnvKeys.filter((key) => !process.env[key] || String(process.env[key]).trim().length === 0);

        if (missing.length > 0) {
            dialog.showErrorBox(
                'Configuracion insegura',
                `Faltan variables de entorno criticas: ${missing.join(', ')}. Configure estas claves antes de iniciar la app empaquetada.`
            );
            return;
        }

        serverProcess = fork(scriptPath, [], {
            cwd: serverDistPath,
            env: { 
                ...process.env, 
                NODE_ENV: 'production',
                NODE_PATH: serverNodeModulesPath,
                PORT: SERVER_PORT.toString(), 
                PII_ENCRYPTION_KEY: process.env.PII_ENCRYPTION_KEY,
                ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
                JWT_SECRET: process.env.JWT_SECRET,
                BACKUP_PASSWORD: process.env.BACKUP_PASSWORD
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        serverProcess.stdout?.on('data', (data) => {
            logger.info(`[SERVER]: ${data}`);
        });

        serverProcess.stderr?.on('data', (data) => {
            logger.error(`[SERVER ERROR]: ${data}`);
            if (data.toString().toLowerCase().includes('error:') && !data.toString().includes('DeprecationWarning')) {
                // T-18: Sanitize error messages shown to end users — never expose stack traces
                const rawMsg = data.toString();
                const sanitized = rawMsg.split('\n')[0].replace(/\s+at\s+.*/g, '').substring(0, 200);
                dialog.showErrorBox('Error del Servidor Backend', sanitized || 'An internal server error occurred.');
            }
        });

        serverProcess.on('error', (err) => {
            dialog.showErrorBox('Error fatal al iniciar servidor', err.message || String(err));
        });

        serverProcess.on('exit', (code) => {
            logger.info(`Server child process exited with code ${code}`);
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
        logger.error('Error creating tray:', e);
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

