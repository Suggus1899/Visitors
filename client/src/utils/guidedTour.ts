import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export const startGuidedTour = () => {
    const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        steps: [
            {
                element: 'header',
                popover: {
                    title: '👋 Bienvenido al Sistema',
                    description: 'Este es el panel de control de acceso de visitantes. Aquí puedes registrar entradas y salidas.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '[data-tour="visit-form"]',
                popover: {
                    title: '📝 Formulario de Registro',
                    description: 'Ingresa la cédula del visitante para registrar su entrada. Si es un visitante nuevo, podrás agregar sus datos.',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '[data-tour="active-visits"]',
                popover: {
                    title: '📋 Visitas Activas',
                    description: 'Aquí verás todas las personas que están actualmente en las instalaciones. Puedes marcar su salida cuando se retiren.',
                    side: 'left',
                    align: 'start'
                }
            },
            {
                element: '[data-tour="admin-btn"]',
                popover: {
                    title: '⚙️ Panel de Administración',
                    description: 'Como administrador, puedes acceder al historial completo, reportes y gestión de usuarios.',
                    side: 'bottom',
                    align: 'end'
                }
            },
            {
                element: '[data-tour="logout-btn"]',
                popover: {
                    title: '🚪 Cerrar Sesión',
                    description: 'Usa este botón para salir del sistema de forma segura.',
                    side: 'bottom',
                    align: 'end'
                }
            }
        ],
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: '¡Entendido!',
        progressText: '{{current}} de {{total}}'
    });

    driverObj.drive();
};
